'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Checkbox, Input, Radio, Select, Textarea } from '../../../../components/ui';
import type { AnswerMap, AnswerValue, FormFieldSpec } from '../../../../lib/forms/contract';
import { charLimitUsage, visibleFields } from '../../../../lib/forms/contract';
import { markdownLength, renderTrustedMarkdown } from '../../../../lib/markdown';
import { charLimitGroups, stepsOf } from '../field-rules';
import type { BuilderFieldView, FormView } from './builder-types';
import styles from './builder.module.css';

/**
 * The form as a speaker meets it, live rather than a screenshot — conditions really evaluate and the
 * combined counter really counts, because the questions an organizer most needs to check are the
 * ones that only appear for some answers.
 */

function toStringValue(value: AnswerValue): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: BuilderFieldView;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const options = field.options ?? [];

  switch (field.type) {
    case 'long_text':
    case 'markdown':
      return (
        <Textarea
          rows={field.type === 'markdown' ? 6 : 3}
          placeholder={field.placeholder ?? undefined}
          value={toStringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'select':
      return (
        <Select value={toStringValue(value)} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      );
    case 'radio':
      return (
        <div className={styles.optionsList}>
          {options.map((option) => (
            <label className={styles.choiceRow} key={option}>
              <Radio
                name={field.key}
                checked={toStringValue(value) === option}
                onChange={() => onChange(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    case 'multi_select': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className={styles.optionsList}>
          {options.map((option) => (
            <label className={styles.choiceRow} key={option}>
              <Checkbox
                checked={selected.includes(option)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option]
                      : selected.filter((entry) => entry !== option),
                  )
                }
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    }
    case 'checkbox':
      return (
        <label className={styles.choiceRow}>
          <Checkbox
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{field.placeholder ?? 'Yes'}</span>
        </label>
      );
    case 'file':
      return (
        <Input
          type="file"
          onChange={(event) => onChange(event.target.files?.[0]?.name ?? null)}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          placeholder={field.placeholder ?? undefined}
          value={toStringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          value={toStringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          placeholder={field.placeholder ?? undefined}
          value={toStringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

export function FormPreview({
  form,
  fields,
}: {
  form: FormView;
  fields: readonly BuilderFieldView[];
}) {
  const [values, setValues] = useState<AnswerMap>({});
  const [step, setStep] = useState(0);

  const specs = useMemo<FormFieldSpec[]>(() => [...fields], [fields]);
  const shown = useMemo(() => visibleFields(specs, values), [specs, values]);
  const steps = stepsOf(fields);
  const currentStep = steps[Math.min(step, steps.length - 1)] ?? 0;
  const onThisStep = shown.filter((field) => field.step === currentStep);
  const groups = charLimitGroups(fields);

  const set = (key: string, next: AnswerValue) =>
    setValues((current) => ({ ...current, [key]: next }));

  return (
    <div className={styles.preview}>
      <Card padding="lg">
        <div className={styles.stack}>
          <h2 className={styles.title}>{form.name}</h2>
          {form.introMarkdown ? (
            <div
              className={styles.previewProse}
              dangerouslySetInnerHTML={{ __html: renderTrustedMarkdown(form.introMarkdown) }}
            />
          ) : null}

          {steps.length > 1 ? (
            <p className={styles.stepTitle}>
              Step {steps.indexOf(currentStep) + 1} of {steps.length}
            </p>
          ) : null}

          {onThisStep.length === 0 ? (
            <p className={styles.help}>Nothing is visible on this step for the answers so far.</p>
          ) : null}

          {onThisStep.map((spec) => {
            const field = fields.find((candidate) => candidate.id === spec.id);
            if (!field) return null;
            if (field.type === 'section_break') {
              return (
                <div key={field.id} className={styles.sectionBreak}>
                  <span className={styles.switchLabel}>{field.label}</span>
                  {field.helpText ? <span className={styles.help}>{field.helpText}</span> : null}
                </div>
              );
            }
            const used =
              typeof values[field.key] === 'string'
                ? markdownLength(values[field.key] as string)
                : 0;
            return (
              <div className={styles.field} key={field.id}>
                <span className={styles.label}>
                  {field.label}
                  {field.required ? <span className={styles.requiredMark}> *</span> : null}
                </span>
                {field.helpText ? <span className={styles.help}>{field.helpText}</span> : null}
                <FieldControl
                  field={field}
                  value={values[field.key] ?? null}
                  onChange={(next) => set(field.key, next)}
                />
                {field.maxLength && !field.charLimitGroup ? (
                  <span className={styles.counter} data-over={used > field.maxLength}>
                    {used} / {field.maxLength}
                  </span>
                ) : null}
              </div>
            );
          })}

          {groups.map((group) => {
            const usage = charLimitUsage(specs, values, group.group);
            return (
              <p
                className={styles.counter}
                key={group.group}
                data-over={usage.used > usage.limit}
              >
                {group.fields.map((field) => field.label).join(' + ')}: {usage.used} /{' '}
                {usage.limit} characters combined
              </p>
            );
          })}

          {steps.length > 1 ? (
            <div className={styles.previewNav}>
              <Button
                variant="ghost"
                disabled={steps.indexOf(currentStep) === 0}
                onClick={() => setStep((current) => Math.max(0, current - 1))}
              >
                Back
              </Button>
              <Button
                variant="primary"
                disabled={steps.indexOf(currentStep) === steps.length - 1}
                onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
