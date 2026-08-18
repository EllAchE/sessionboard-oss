'use client';

import { useId } from 'react';
import { Button, Checkbox, Input, Radio, Select, Textarea } from '@/components/ui';
import { charLimitUsage, type AnswerMap, type AnswerValue } from '@/lib/forms/contract';
import type { RuntimeField } from '@/lib/services/submissions';
import { markdownLength, renderMarkdown } from '@/lib/markdown';
import styles from './submit.module.css';

type Props = {
  field: RuntimeField;
  value: AnswerValue;
  values: AnswerMap;
  allFields: RuntimeField[];
  error: string | undefined;
  groupError: string | undefined;
  fileName: string | undefined;
  uploading: boolean;
  disabled: boolean;
  onChange: (value: AnswerValue) => void;
  onUpload: (file: File) => void;
};

function optionLabel(field: RuntimeField, value: string): string {
  return field.optionLabels?.[value] ?? value;
}

function asString(value: AnswerValue): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'true' : '';
  return String(value);
}

function asArray(value: AnswerValue): string[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
}

/** `F-15`, live. A grouped field counts itself *and* its partners against the shared limit. */
function Counter({
  field,
  values,
  allFields,
}: {
  field: RuntimeField;
  values: AnswerMap;
  allFields: RuntimeField[];
}) {
  if (field.charLimitGroup) {
    const { used, limit } = charLimitUsage(allFields, values, field.charLimitGroup);
    if (!limit) return null;
    const partners = allFields.filter(
      (entry) => entry.charLimitGroup === field.charLimitGroup && entry.id !== field.id,
    );
    return (
      <p className={`${styles.counter} ${used > limit ? styles.counterOver : ''}`}>
        <span>
          combined with {partners.map((entry) => entry.label).join(', ') || 'this group'}
        </span>
        <span>
          {used} / {limit}
        </span>
      </p>
    );
  }

  if (!field.maxLength) return null;
  const raw = values[field.key];
  const used = typeof raw === 'string' ? markdownLength(raw) : 0;
  return (
    <p className={`${styles.counter} ${used > field.maxLength ? styles.counterOver : ''}`}>
      <span>{field.minLength ? `at least ${field.minLength}` : ''}</span>
      <span>
        {used} / {field.maxLength}
      </span>
    </p>
  );
}

export function FieldControl({
  field,
  value,
  values,
  allFields,
  error,
  groupError,
  fileName,
  uploading,
  disabled,
  onChange,
  onUpload,
}: Props) {
  const id = useId();
  const describedBy = [field.helpText ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  if (field.type === 'section_break') {
    return (
      <div className={styles.sectionBreak}>
        <p className={styles.sectionTitle}>{field.label}</p>
        {field.helpText && <p className={styles.help}>{field.helpText}</p>}
      </div>
    );
  }

  const common = {
    id,
    name: field.key,
    disabled,
    invalid: Boolean(error),
    'aria-describedby': describedBy || undefined,
  };

  let control: React.ReactNode;

  switch (field.type) {
    case 'long_text':
      control = (
        <Textarea
          {...common}
          rows={6}
          placeholder={field.placeholder ?? undefined}
          value={asString(value)}
          onChange={(nextEvent) => onChange(nextEvent.target.value)}
        />
      );
      break;

    case 'markdown':
      control = (
        <>
          <Textarea
            {...common}
            rows={10}
            placeholder={field.placeholder ?? 'Markdown is supported'}
            value={asString(value)}
            onChange={(nextEvent) => onChange(nextEvent.target.value)}
          />
          {asString(value).trim() !== '' && (
            <div className={styles.preview}>
              <p className={styles.previewLabel}>Preview</p>
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(asString(value)) }} />
            </div>
          )}
        </>
      );
      break;

    case 'select':
      control = (
        <Select
          {...common}
          value={asString(value)}
          onChange={(nextEvent) => onChange(nextEvent.target.value)}
        >
          <option value="">Choose…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {optionLabel(field, option)}
            </option>
          ))}
        </Select>
      );
      break;

    case 'radio': {
      const selected = asString(value);
      control = (
        <div className={styles.choices} role="radiogroup" aria-labelledby={`${id}-label`}>
          {(field.options ?? []).map((option) => (
            <label
              key={option}
              className={`${styles.choice} ${selected === option ? styles.choiceSelected : ''}`}
            >
              <Radio
                name={field.key}
                value={option}
                checked={selected === option}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              <span>{optionLabel(field, option)}</span>
            </label>
          ))}
        </div>
      );
      break;
    }

    case 'multi_select': {
      const selected = asArray(value);
      control = (
        <div className={styles.choices}>
          {(field.options ?? []).map((option) => (
            <label
              key={option}
              className={`${styles.choice} ${selected.includes(option) ? styles.choiceSelected : ''}`}
            >
              <Checkbox
                name={field.key}
                value={option}
                checked={selected.includes(option)}
                disabled={disabled}
                onChange={(nextEvent) =>
                  onChange(
                    nextEvent.target.checked
                      ? [...selected, option]
                      : selected.filter((entry) => entry !== option),
                  )
                }
              />
              <span>{optionLabel(field, option)}</span>
            </label>
          ))}
          {(field.options ?? []).length === 0 && (
            <p className={styles.help}>
              Nothing to choose from yet, so you can skip this one.
            </p>
          )}
        </div>
      );
      break;
    }

    case 'checkbox':
      control = (
        <label className={`${styles.choice} ${value ? styles.choiceSelected : ''}`}>
          <Checkbox
            id={id}
            name={field.key}
            checked={value === true}
            disabled={disabled}
            onChange={(nextEvent) => onChange(nextEvent.target.checked)}
          />
          <span>{field.placeholder ?? 'Yes'}</span>
        </label>
      );
      break;

    case 'file':
      control = (
        <div className={styles.fileRow}>
          <input
            id={id}
            type="file"
            disabled={disabled || uploading}
            onChange={(nextEvent) => {
              const picked = nextEvent.target.files?.[0];
              if (picked) onUpload(picked);
            }}
          />
          {uploading && <span className={styles.fileName}>Uploading…</span>}
          {!uploading && fileName && <span className={styles.fileName}>{fileName}</span>}
          {!uploading && fileName && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      );
      break;

    case 'number':
      control = (
        <Input
          {...common}
          type="number"
          placeholder={field.placeholder ?? undefined}
          value={asString(value)}
          onChange={(nextEvent) => onChange(nextEvent.target.value)}
        />
      );
      break;

    case 'email':
    case 'url':
    case 'date':
      control = (
        <Input
          {...common}
          type={field.type === 'date' ? 'date' : field.type}
          placeholder={field.placeholder ?? undefined}
          value={asString(value)}
          onChange={(nextEvent) => onChange(nextEvent.target.value)}
        />
      );
      break;

    default:
      control = (
        <Input
          {...common}
          type="text"
          maxLength={field.maxLength ?? undefined}
          placeholder={field.placeholder ?? undefined}
          value={asString(value)}
          onChange={(nextEvent) => onChange(nextEvent.target.value)}
        />
      );
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} id={`${id}-label`} htmlFor={id}>
        {field.label}
        {field.required && (
          <span className={styles.required} aria-hidden>
            *
          </span>
        )}
      </label>
      {field.helpText && (
        <p className={styles.help} id={`${id}-help`}>
          {field.helpText}
        </p>
      )}
      {control}
      <Counter field={field} values={values} allFields={allFields} />
      {error && (
        <p className={styles.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {groupError && (
        <p className={styles.error} role="alert">
          {groupError}
        </p>
      )}
    </div>
  );
}
