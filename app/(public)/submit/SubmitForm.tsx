'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { isAppError } from '@/lib/errors';
import {
  validateAnswers,
  visibleFields,
  type AnswerMap,
  type AnswerValue,
} from '@/lib/forms/contract';
import { renderMarkdown } from '@/lib/markdown';
import type { RuntimeField } from '@/lib/services/submissions';
import { submitPublicForm } from './actions';
import { FieldControl } from './FieldControl';
import { submitFormStateKey, submitPath, uploadPath, type RuntimeForm } from './shared';
import styles from './submit.module.css';

/**
 * The one client island on this surface. Everything else about the public form is server-rendered;
 * this exists because `F-2` conditional visibility has to happen *as the submitter types* — a field
 * that only appears after a round trip is a form that feels broken.
 */

type Props = {
  form: RuntimeForm;
  initialValues: AnswerMap;
  initialFileNames: Record<string, string>;
  initialName: string;
  initialEmail: string;
  signedIn: boolean;
  submissionId: string | null;
};

type Step = { kind: 'account' } | { kind: 'fields'; step: number } | { kind: 'review' };

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function stepTitle(step: Step, position: number, total: number): string {
  if (step.kind === 'account') return 'Your name on the rolls';
  if (step.kind === 'review') return 'Read and file';
  return total > 3 ? `Your oration · tablet ${position}` : 'Your oration';
}

export function SubmitForm(props: Props) {
  return <SubmitFormSession key={submitFormStateKey(props.submissionId)} {...props} />;
}

function SubmitFormSession({
  form,
  initialValues,
  initialFileNames,
  initialName,
  initialEmail,
  signedIn,
  submissionId: initialSubmissionId,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<AnswerMap>(initialValues);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState(initialSubmissionId);
  const [fileNames, setFileNames] = useState<Record<string, string>>(initialFileNames);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();

  /** `F-2`: recomputed on every keystroke, which is the entire reason this component is a client one. */
  const shown = useMemo(() => {
    const ids = new Set(visibleFields(form.fields, values).map((field) => field.id));
    return form.fields.filter((field) => ids.has(field.id));
  }, [form.fields, values]);

  const steps = useMemo<Step[]>(() => {
    const fieldSteps = [...new Set(shown.map((field) => field.step))].sort((a, b) => a - b);
    return [
      ...(signedIn ? [] : ([{ kind: 'account' }] as Step[])),
      ...fieldSteps.map((step) => ({ kind: 'fields', step }) as Step),
      { kind: 'review' } as Step,
    ];
  }, [shown, signedIn]);

  const safeIndex = Math.min(index, steps.length - 1);
  const current = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;

  const fieldsFor = (step: Step): RuntimeField[] =>
    step.kind === 'fields' ? shown.filter((field) => field.step === step.step) : [];

  function setValue(key: string, value: AnswerValue) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function validateAccount(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!name.trim()) found.submitterName = 'Enter your name in the rolls';
    if (!EMAIL_PATTERN.test(email.trim())) found.submitterEmail = 'Give the courier a valid email address';
    return found;
  }

  /** Per-step gate. The server revalidates the whole form regardless; this is only for feel. */
  function validateStep(step: Step): Record<string, string> {
    if (step.kind === 'account') return validateAccount();
    if (step.kind === 'review') return {};
    try {
      validateAnswers(fieldsFor(step), values);
      return {};
    } catch (error) {
      if (isAppError(error) && error.details) return error.details;
      return {};
    }
  }

  function goNext() {
    const found = validateStep(current);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFormError(null);
    setSavedNote(null);
    setIndex(Math.min(safeIndex + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    setErrors({});
    setFormError(null);
    setIndex(Math.max(safeIndex - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function jumpToError(found: Record<string, string>) {
    const keys = Object.keys(found);
    if (keys.includes('submitterEmail') || keys.includes('email') || keys.includes('submitterName')) {
      setIndex(0);
      return;
    }
    const target = form.fields.find((field) => keys.includes(field.key));
    if (!target) return;
    const position = steps.findIndex(
      (step) => step.kind === 'fields' && step.step === target.step,
    );
    if (position >= 0) setIndex(position);
  }

  function send(mode: 'draft' | 'submit') {
    if (mode === 'submit') {
      const accountErrors = signedIn ? {} : validateAccount();
      if (Object.keys(accountErrors).length > 0) {
        setErrors(accountErrors);
        setIndex(0);
        return;
      }
    }

    setFormError(null);
    setSavedNote(null);

    startTransition(async () => {
      const result = await submitPublicForm({
        eventSlug: form.eventSlug,
        formSlug: form.formSlug,
        mode,
        values,
        submitterName: name,
        submitterEmail: email,
        submissionId,
      });

      if (!result.ok) {
        setErrors(result.errors);
        setFormError(result.message);
        jumpToError(result.errors);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (result.mode === 'draft') {
        setSubmissionId(result.submissionId);
        setSavedNote(`Sealed as ${result.displayRef}. Leave now and this scroll will await your return.`);
        // Keeps the resume link in the address bar without losing what is typed on screen.
        router.replace(
          `${submitPath(form.eventSlug, form.formSlug)}?draft=${result.submissionId}`,
          { scroll: false },
        );
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    });
  }

  async function upload(field: RuntimeField, picked: File) {
    setUploading((previous) => ({ ...previous, [field.key]: true }));
    try {
      const body = new FormData();
      body.append('file', picked);
      const response = await fetch(uploadPath(form.eventSlug, form.formSlug), {
        method: 'POST',
        body,
      });
      const payload = (await response.json()) as
        | { ok: true; fileId: string; filename: string }
        | { ok: false; message: string };
      if (!payload.ok) {
        setErrors((previous) => ({ ...previous, [field.key]: payload.message }));
        return;
      }
      setFileNames((previous) => ({ ...previous, [payload.fileId]: payload.filename }));
      setValue(field.key, payload.fileId);
    } catch {
      setErrors((previous) => ({
        ...previous,
        [field.key]: 'That record did not reach the archive',
      }));
    } finally {
      setUploading((previous) => ({ ...previous, [field.key]: false }));
    }
  }

  function reviewValue(field: RuntimeField) {
    const value = values[field.key];
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      return <span className={styles.reviewEmpty}>Left blank on the tablet</span>;
    }
    if (field.type === 'markdown') {
      return (
        <div
          className={styles.reviewValue}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(String(value)) }}
        />
      );
    }
    if (Array.isArray(value)) {
      return <span>{value.map((entry) => field.optionLabels?.[String(entry)] ?? String(entry)).join(', ')}</span>;
    }
    if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
    if (field.type === 'file') return <span>{fileNames[String(value)] ?? 'Lodged scroll'}</span>;
    return <span>{field.optionLabels?.[String(value)] ?? String(value)}</span>;
  }

  return (
    <div className={styles.fields}>
      <div className={styles.stepper}>
        <div className={styles.stepperRow}>
          {steps.map((step, position) => (
            <span
              key={`${step.kind}-${step.kind === 'fields' ? step.step : position}`}
              className={[
                styles.stepPill,
                position === safeIndex ? styles.stepPillCurrent : '',
                position < safeIndex ? styles.stepPillDone : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.stepIndex}>{position + 1}</span>
              {stepTitle(step, position + 1, steps.length)}
            </span>
          ))}
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${((safeIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
        <p className={styles.progressLabel}>
          Step {safeIndex + 1} of {steps.length}
        </p>
      </div>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      {current.kind === 'account' && (
        <div className={styles.fields}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="submitter-name">
              Your name for the rolls
              <span className={styles.required} aria-hidden>
                *
              </span>
            </label>
            <Input
              id="submitter-name"
              autoComplete="name"
              value={name}
              invalid={Boolean(errors.submitterName)}
              onChange={(nextEvent) => setName(nextEvent.target.value)}
            />
            {errors.submitterName && (
              <p className={styles.error} role="alert">
                {errors.submitterName}
              </p>
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="submitter-email">
              Dispatch address
              <span className={styles.required} aria-hidden>
                *
              </span>
            </label>
            <p className={styles.help}>
              No password to choose. We enter your name among the orators and admit you with a
              sealed email link.
            </p>
            <Input
              id="submitter-email"
              type="email"
              autoComplete="email"
              value={email}
              invalid={Boolean(errors.submitterEmail || errors.email)}
              onChange={(nextEvent) => setEmail(nextEvent.target.value)}
            />
            {(errors.submitterEmail || errors.email) && (
              <p className={styles.error} role="alert">
                {errors.submitterEmail ?? errors.email}
              </p>
            )}
          </div>
        </div>
      )}

      {current.kind === 'fields' &&
        fieldsFor(current).map((field) => (
          <FieldControl
            key={field.id}
            field={field}
            value={values[field.key] ?? null}
            values={values}
            allFields={form.fields}
            error={errors[field.key]}
            groupError={field.charLimitGroup ? errors[field.charLimitGroup] : undefined}
            fileName={fileNames[String(values[field.key] ?? '')]}
            uploading={Boolean(uploading[field.key])}
            disabled={pending}
            onChange={(value) => setValue(field.key, value)}
            onUpload={(picked) => void upload(field, picked)}
          />
        ))}

      {current.kind === 'review' && (
        <div className={styles.review}>
          {!signedIn && (
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>Petition filed by</span>
              <span className={styles.reviewValue}>
                {name} · {email}
              </span>
            </div>
          )}
          {shown
            .filter((field) => field.type !== 'section_break')
            .map((field) => (
              <div className={styles.reviewRow} key={field.id}>
                <span className={styles.reviewLabel}>{field.label}</span>
                <div className={styles.reviewValue}>{reviewValue(field)}</div>
              </div>
            ))}
        </div>
      )}

      {savedNote && <p className={styles.savedNote}>{savedNote}</p>}

      <div className={styles.actions}>
        {safeIndex > 0 && (
          <Button type="button" variant="ghost" onClick={goBack} disabled={pending}>
            Previous tablet
          </Button>
        )}
        <div className={styles.actionsRight}>
          {form.allowDrafts && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => send('draft')}
              disabled={pending || (!signedIn && !EMAIL_PATTERN.test(email.trim()))}
            >
              Seal for later
            </Button>
          )}
          {!isLast && (
            <Button type="button" variant="primary" onClick={goNext} disabled={pending}>
              Next tablet
            </Button>
          )}
          {isLast && (
            <Button
              type="button"
              variant="primary"
              loading={pending}
              onClick={() => send('submit')}
            >
              File the oration
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
