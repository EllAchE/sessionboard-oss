'use client';

import { useState } from 'react';
import { Checkbox, Input, Radio, Select, Textarea } from '@/components/ui';
import type { AnswerMap, AnswerValue, FormFieldSpec } from '@/lib/forms/contract';
import { visibleFields } from '@/lib/forms/contract';
import styles from '../portal.module.css';

/**
 * `S-17`. One renderer for organizer-built forms wherever a speaker meets them — a portal-form task
 * and the post-submission edit both come through here, so a conditional question behaves the same
 * on both. Visibility is recomputed in the browser off the same `visibleFields` the server uses to
 * clear hidden answers, which is what keeps the two from disagreeing.
 */
export function FieldSet({
  fields,
  initial,
  errors,
  disabled,
}: {
  fields: FormFieldSpec[];
  initial: AnswerMap;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<AnswerMap>(initial);
  const shown = visibleFields(fields, values);

  const set = (key: string, value: AnswerValue) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <div className={styles.stackTight}>
      {shown.map((field) => (
        <Field
          key={field.id}
          field={field}
          value={values[field.key] ?? null}
          error={errors?.[field.key]}
          disabled={disabled}
          onChange={(value) => set(field.key, value)}
        />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: FormFieldSpec;
  value: AnswerValue;
  error?: string;
  disabled?: boolean;
  onChange: (value: AnswerValue) => void;
}) {
  const name = `answer:${field.key}`;
  const id = `field-${field.id}`;

  if (field.type === 'section_break') {
    return <h3 className={styles.sectionTitle}>{field.label}</h3>;
  }

  const label = (
    <label className={field.required ? `${styles.label} ${styles.required}` : styles.label} htmlFor={id}>
      {field.label}
    </label>
  );

  const limit = field.maxLength ? (
    <span className={styles.hint}>
      {typeof value === 'string' ? value.length : 0} / {field.maxLength} characters
    </span>
  ) : null;

  return (
    <div className={styles.field}>
      {label}
      {renderControl()}
      {limit}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );

  function renderControl() {
    switch (field.type) {
      case 'long_text':
      case 'markdown':
        return (
          <Textarea
            id={id}
            name={name}
            rows={field.type === 'markdown' ? 8 : 4}
            value={String(value ?? '')}
            disabled={disabled}
            invalid={Boolean(error)}
            onChange={(untrusted) => onChange(untrusted.target.value)}
          />
        );
      case 'select':
        return (
          <Select
            id={id}
            name={name}
            value={String(value ?? '')}
            disabled={disabled}
            invalid={Boolean(error)}
            onChange={(untrusted) => onChange(untrusted.target.value)}
          >
            <option value="">Choose from the list</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        );
      case 'radio':
        return (
          <div className={styles.choiceList}>
            {(field.options ?? []).map((option) => (
              <label key={option} className={styles.choice}>
                <Radio
                  name={name}
                  value={option}
                  disabled={disabled}
                  checked={String(value ?? '') === option}
                  onChange={() => onChange(option)}
                />
                {option}
              </label>
            ))}
          </div>
        );
      case 'multi_select': {
        const picked = Array.isArray(value) ? value : [];
        return (
          <div className={styles.choiceList}>
            {(field.options ?? []).map((option) => (
              <label key={option} className={styles.choice}>
                <Checkbox
                  name={name}
                  value={option}
                  disabled={disabled}
                  checked={picked.includes(option)}
                  onChange={(untrusted) =>
                    onChange(
                      untrusted.target.checked
                        ? [...picked, option]
                        : picked.filter((entry) => entry !== option),
                    )
                  }
                />
                {option}
              </label>
            ))}
          </div>
        );
      }
      case 'checkbox':
        return (
          <label className={styles.choice}>
            <Checkbox
              id={id}
              name={name}
              disabled={disabled}
              checked={value === true}
              onChange={(untrusted) => onChange(untrusted.target.checked)}
            />
            I affirm
          </label>
        );
      case 'file':
        return <p className={styles.hint}>Scrolls for this assembly are lodged in the Archive tab.</p>;
      default:
        return (
          <Input
            id={id}
            name={name}
            type={inputType(field.type)}
            value={String(value ?? '')}
            disabled={disabled}
            invalid={Boolean(error)}
            onChange={(untrusted) => onChange(untrusted.target.value)}
          />
        );
    }
  }
}

function inputType(type: FormFieldSpec['type']): string {
  switch (type) {
    case 'email':
      return 'email';
    case 'url':
      return 'url';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}
