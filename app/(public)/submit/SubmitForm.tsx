'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { isAppError } from '@/lib/errors';
import {
  emptyParticipant,
  validateAnswers,
  validateParticipantCounts,
  visibleFields,
  type AnswerMap,
  type AnswerValue,
  type ParticipantInput,
} from '@/lib/forms/contract';
import { renderMarkdown } from '@/lib/markdown';
// Type-only, and it has to stay that way: a value import from the service would pull `pg` and the
// agenda's mail transport into this island's bundle. See the note at the top of `submissions.ts`.
import type { ParticipantField, RuntimeField } from '@/lib/services/submissions';
import { submitPublicForm } from './actions';
import { FieldControl } from './FieldControl';
import {
  buildSteps,
  submitFormStateKey,
  submitPath,
  uploadPath,
  type RuntimeForm,
  type SubmitStep,
} from './shared';
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

/**
 * `P-2`. Five stages, all of them real: Welcome, Account, Submission, Participant, Review.
 *
 * Welcome used to be static copy rendered outside the machine and Participant did not exist at all —
 * people were conjured server-side during submit, which is why nobody could name a co-speaker before
 * their talk was already filed. Both are stages now, and both can be absent for a good reason:
 * Welcome when the organizer has the copy hidden (`F-9`), Participant when the form has the block
 * switched off (`F-4`), Account when the submitter is already signed in. What is never allowed is a
 * stage that exists in the model and not on screen — the stepper renders exactly what the machine has.
 */
type Step = SubmitStep;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function stepTitle(step: Step, position: number, fieldStepCount: number): string {
  switch (step.kind) {
    case 'welcome':
      return 'Welcome';
    case 'account':
      return 'Your account';
    case 'participant':
      return 'Participants';
    case 'review':
      return 'Review and submit';
    case 'fields':
      return fieldStepCount > 1 ? `Your talk · part ${position}` : 'Your talk';
  }
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
  const [people, setPeople] = useState<ParticipantInput[]>(() =>
    seedParticipants(form, initialName, initialEmail),
  );
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

  const hasWelcome = Boolean(form.welcomeHtml || form.pageHeading);

  const steps = useMemo<Step[]>(
    () =>
      buildSteps({
        showWelcome: hasWelcome,
        signedIn,
        fieldSteps: [...new Set(shown.map((field) => field.step))].sort((a, b) => a - b),
        collectsParticipants: form.collectsParticipants,
      }),
    [shown, signedIn, hasWelcome, form.collectsParticipants],
  );

  const safeIndex = Math.min(index, steps.length - 1);
  const current = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;
  const fieldStepCount = steps.filter((step) => step.kind === 'fields').length;

  const fieldsFor = (step: Step): RuntimeField[] =>
    step.kind === 'fields' ? shown.filter((field) => field.step === step.step) : [];

  /** `F-6`: which participant questions this form actually asks, in the order it asks them. */
  const participantFields = form.participantFields;
  const roleFor = (kind: string) => form.roles.find((role) => role.kind === kind);
  const atParticipantCap =
    form.maxParticipants !== null && people.length >= form.maxParticipants;

  function updatePerson(position: number, patch: Partial<ParticipantInput>) {
    setPeople((current) =>
      current.map((person, index) => (index === position ? { ...person, ...patch } : person)),
    );
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch)) delete next[`participants.${position}.${key}`];
      return next;
    });
  }

  function addPerson() {
    // The first role the form offers that is not already full is the useful default, because the one
    // an organizer put first is the one they expect most of.
    const tally = new Map<string, number>();
    for (const person of people) tally.set(person.role, (tally.get(person.role) ?? 0) + 1);
    const next =
      form.roles.find((role) => role.maxCount === null || (tally.get(role.kind) ?? 0) < role.maxCount) ??
      form.roles[form.roles.length - 1];
    if (!next) return;
    setPeople((current) => [...current, emptyParticipant(next.kind)]);
  }

  function removePerson(position: number) {
    if (position === 0) return;
    setPeople((current) => current.filter((_, index) => index !== position));
    setErrors({});
  }

  function setValue(key: string, value: AnswerValue) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  /**
   * With participants on, the Account stage asks only for the address the account is created against
   * — the name arrives split across the Participant stage, and asking for it twice is how the two end
   * up disagreeing. With participants off there is no Participant stage, so this is the only name box
   * on the form and it is required here.
   */
  function validateAccount(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!form.collectsParticipants && !name.trim()) found.submitterName = 'Tell us your name';
    if (!EMAIL_PATTERN.test(email.trim())) found.submitterEmail = 'Enter a valid email address';
    return found;
  }

  /** `F-6` / `F-7`, checked client-side for feel. `validateParticipants` on the server is the gate. */
  function validateParticipantStage(): Record<string, string> {
    const found: Record<string, string> = {};

    people.forEach((person, position) => {
      try {
        validateAnswers(
          participantFields.map((field) => ({ ...field, key: field.participantKey })),
          {
            firstName: person.firstName,
            lastName: person.lastName,
            email: position === 0 ? email : person.email,
            phone: person.phone ?? '',
            biography: person.biography ?? '',
          },
        );
      } catch (error) {
        if (isAppError(error) && error.details) {
          for (const [key, message] of Object.entries(error.details)) {
            found[`participants.${position}.${key}`] = message;
          }
        }
      }
    });

    try {
      validateParticipantCounts(
        form.roles,
        people.map((person) => person.role),
        form.maxParticipants,
      );
    } catch (error) {
      if (isAppError(error) && error.details) Object.assign(found, error.details);
    }

    return found;
  }

  /** Per-step gate. The server revalidates the whole form regardless; this is only for feel. */
  function validateStep(step: Step): Record<string, string> {
    if (step.kind === 'welcome' || step.kind === 'review') return {};
    if (step.kind === 'account') return validateAccount();
    if (step.kind === 'participant') return validateParticipantStage();
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

  function goToStep(match: (step: Step) => boolean) {
    const position = steps.findIndex(match);
    if (position >= 0) setIndex(position);
  }

  function jumpToError(found: Record<string, string>) {
    const keys = Object.keys(found);
    if (keys.includes('submitterEmail') || keys.includes('email') || keys.includes('submitterName')) {
      goToStep((step) => step.kind === 'account');
      return;
    }
    // `F-6` / `F-7` errors are keyed by person or by role, and both belong on the participant stage.
    if (
      keys.some((key) => key.startsWith('participants')) ||
      keys.some((key) => form.roles.some((role) => role.kind === key))
    ) {
      goToStep((step) => step.kind === 'participant');
      return;
    }
    const target = form.fields.find((field) => keys.includes(field.key));
    if (!target) return;
    goToStep((step) => step.kind === 'fields' && step.step === target.step);
  }

  function send(mode: 'draft' | 'submit') {
    if (mode === 'submit') {
      const accountErrors = signedIn ? {} : validateAccount();
      if (Object.keys(accountErrors).length > 0) {
        setErrors(accountErrors);
        goToStep((step) => step.kind === 'account');
        return;
      }
      if (form.collectsParticipants) {
        const participantErrors = validateParticipantStage();
        if (Object.keys(participantErrors).length > 0) {
          setErrors(participantErrors);
          goToStep((step) => step.kind === 'participant');
          return;
        }
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
        participants: form.collectsParticipants ? people : [],
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
        setSavedNote(`Saved as ${result.displayRef}. You can close this tab and come back to it.`);
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
      setErrors((previous) => ({ ...previous, [field.key]: 'That upload did not go through' }));
    } finally {
      setUploading((previous) => ({ ...previous, [field.key]: false }));
    }
  }

  function reviewValue(field: RuntimeField) {
    const value = values[field.key];
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      return <span className={styles.reviewEmpty}>Not answered</span>;
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
    if (field.type === 'file') return <span>{fileNames[String(value)] ?? 'Uploaded file'}</span>;
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
              {stepTitle(
                step,
                steps.filter((entry, at) => entry.kind === 'fields' && at <= position).length,
                fieldStepCount,
              )}
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

      {/* `P-2` / `F-9`: Welcome is a stage now, not decoration above one. */}
      {current.kind === 'welcome' && (
        <div className={styles.fields}>
          {form.pageHeading && <p className={styles.eyebrow}>{form.pageHeading}</p>}
          {form.welcomeHtml && (
            <div className={styles.intro} dangerouslySetInnerHTML={{ __html: form.welcomeHtml }} />
          )}
          {form.targetType === 'session' ? (
            <p className={styles.help}>This session goes straight to the programme.</p>
          ) : null}
        </div>
      )}

      {current.kind === 'account' && (
        <div className={styles.fields}>
          {!form.collectsParticipants && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="submitter-name">
                Your name
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
          )}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="submitter-email">
              Email
              <span className={styles.required} aria-hidden>
                *
              </span>
            </label>
            <p className={styles.help}>
              We’ll use this email for your speaker account.
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

      {/* `P-2` stage four. `F-6`'s fields, under `F-7`'s roles and counts. */}
      {current.kind === 'participant' && (
        <div className={styles.fields}>
          <p className={styles.help}>{participantHint(form)}</p>

          {people.map((person, position) => (
            <div className={styles.fields} key={`person-${position}`}>
              <div className={styles.sectionBreak}>
                <p className={styles.sectionTitle}>
                  {position === 0 ? 'You' : `Participant ${position + 1}`}
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor={`person-${position}-role`}>
                  Role
                </label>
                <Select
                  id={`person-${position}-role`}
                  value={person.role}
                  disabled={pending}
                  onChange={(nextEvent) =>
                    updatePerson(position, {
                      role: nextEvent.target.value as ParticipantInput['role'],
                    })
                  }
                >
                  {form.roles.map((role) => (
                    <option key={role.kind} value={role.kind}>
                      {role.label}
                    </option>
                  ))}
                </Select>
                {errors[person.role] && (
                  <p className={styles.error} role="alert">
                    {errors[person.role]}
                  </p>
                )}
              </div>

              {participantFields.map((field) => (
                <ParticipantControl
                  key={`${position}-${field.participantKey}`}
                  field={field}
                  person={person}
                  position={position}
                  accountEmail={email}
                  disabled={pending}
                  error={errors[`participants.${position}.${field.participantKey}`]}
                  onChange={(patch) => updatePerson(position, patch)}
                />
              ))}

              {position > 0 && (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => removePerson(position)}
                  >
                    Remove {person.firstName.trim() || 'this participant'}
                  </Button>
                </div>
              )}
            </div>
          ))}

          {errors.participants && (
            <p className={styles.error} role="alert">
              {errors.participants}
            </p>
          )}

          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || atParticipantCap || form.roles.length === 0}
              onClick={addPerson}
            >
              Add another participant
            </Button>
            {atParticipantCap && (
              <p className={styles.help}>
                This form takes {form.maxParticipants}{' '}
                {form.maxParticipants === 1 ? 'person' : 'people'} per submission.
              </p>
            )}
          </div>
        </div>
      )}

      {current.kind === 'review' && (
        <div className={styles.review}>
          {!signedIn && (
            <div className={styles.reviewRow}>
              <span className={styles.reviewLabel}>Submitting as</span>
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
          {/* `P-7`: the people are part of what is being confirmed, not a detail behind it. */}
          {form.collectsParticipants &&
            people.map((person, position) => (
              <div className={styles.reviewRow} key={`review-person-${position}`}>
                <span className={styles.reviewLabel}>
                  {roleFor(person.role)?.label ?? 'Participant'}
                </span>
                <div className={styles.reviewValue}>
                  {[person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unnamed'} ·{' '}
                  {position === 0 ? email : person.email}
                </div>
              </div>
            ))}
        </div>
      )}

      {savedNote && <p className={styles.savedNote}>{savedNote}</p>}

      <div className={styles.actions}>
        {safeIndex > 0 && (
          <Button type="button" variant="ghost" onClick={goBack} disabled={pending}>
            Back
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
              Save draft
            </Button>
          )}
          {!isLast && (
            <Button type="button" variant="primary" onClick={goNext} disabled={pending}>
              Continue
            </Button>
          )}
          {isLast && (
            <Button
              type="button"
              variant="primary"
              loading={pending}
              onClick={() => send('submit')}
            >
              {form.targetType === 'session' ? 'Add to the programme' : 'Submit talk'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * `F-6`. One participant question, rendered from the same `form_field` row the organizer configured —
 * so a Biography the organizer turned off is not on screen, and a relabelled First Name says what they
 * called it.
 *
 * The first person's email is the account's, which is why it is shown read-only rather than left
 * editable and quietly overwritten on the server.
 */
function ParticipantControl({
  field,
  person,
  position,
  accountEmail,
  disabled,
  error,
  onChange,
}: {
  field: ParticipantField;
  person: ParticipantInput;
  position: number;
  accountEmail: string;
  disabled: boolean;
  error: string | undefined;
  onChange: (patch: Partial<ParticipantInput>) => void;
}) {
  const key = field.participantKey;
  const id = `person-${position}-${key}`;
  const isAccountEmail = key === 'email' && position === 0;
  const value = isAccountEmail ? accountEmail : ((person[key] as string | null) ?? '');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {field.label}
        {field.required && (
          <span className={styles.required} aria-hidden>
            *
          </span>
        )}
      </label>
      {isAccountEmail ? (
        <p className={styles.help}>Change this on the Account step.</p>
      ) : (
        field.helpText && <p className={styles.help}>{field.helpText}</p>
      )}

      {field.type === 'markdown' ? (
        <Textarea
          id={id}
          rows={5}
          maxLength={field.maxLength ?? undefined}
          value={value}
          disabled={disabled}
          invalid={Boolean(error)}
          onChange={(nextEvent) => onChange({ [key]: nextEvent.target.value })}
        />
      ) : (
        <Input
          id={id}
          type={field.type === 'email' ? 'email' : 'text'}
          autoComplete={AUTOCOMPLETE[key]}
          maxLength={field.maxLength ?? undefined}
          value={value}
          disabled={disabled || isAccountEmail}
          readOnly={isAccountEmail}
          invalid={Boolean(error)}
          onChange={(nextEvent) => onChange({ [key]: nextEvent.target.value })}
        />
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const AUTOCOMPLETE: Record<string, string> = {
  firstName: 'given-name',
  lastName: 'family-name',
  email: 'email',
  phone: 'tel',
  biography: 'off',
};

/**
 * The submitter is participant one, seeded from whatever the account already knows. A signed-in
 * speaker should not retype a name the portal is already showing them.
 */
function seedParticipants(
  form: RuntimeForm,
  initialName: string,
  initialEmail: string,
): ParticipantInput[] {
  const first = form.roles[0]?.kind ?? 'speaker';
  const trimmed = initialName.trim().replace(/\s+/gu, ' ');
  const boundary = trimmed.lastIndexOf(' ');
  return [
    {
      ...emptyParticipant(first),
      firstName: boundary === -1 ? trimmed : trimmed.slice(0, boundary),
      lastName: boundary === -1 ? '' : trimmed.slice(boundary + 1),
      email: initialEmail,
    },
  ];
}

/** `F-7` stated in words, so a submitter reads the rule instead of discovering it as a rejection. */
function participantHint(form: RuntimeForm): string {
  const required = form.roles.filter((role) => role.minCount > 0);
  const parts: string[] = [];
  if (required.length > 0) {
    parts.push(
      `This form needs ${required
        .map((role) => `${role.minCount} ${role.label.toLowerCase()}${role.minCount === 1 ? '' : 's'}`)
        .join(' and ')}.`,
    );
  }
  if (form.maxParticipants !== null) {
    parts.push(
      `At most ${form.maxParticipants} ${form.maxParticipants === 1 ? 'person' : 'people'} in total.`,
    );
  }
  parts.push('Everyone listed gets their own speaker portal.');
  return parts.join(' ');
}
