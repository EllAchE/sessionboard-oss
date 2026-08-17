import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { cache } from 'react';
import { getDb } from '../../db/client';
import {
  event,
  file,
  form,
  formField,
  formParticipantRole,
  membership,
  participant,
  participantRole,
  scheduledSession,
  sessionFormat,
  submission,
  submissionTag,
  tag as tagTable,
  track as trackTable,
  user,
} from '../../db/schema';
import { conflict, forbidden, invalid, isAppError, notFound } from '../errors';
import { spreadsheetSafeCellText } from '../csv';
import {
  PARTICIPANT_BUILTIN_META,
  clearHiddenAnswers,
  emptyParticipant,
  participantValues,
  resolveFieldType,
  splitAnswers,
  validateAnswers,
  validateParticipantCounts,
  type AnswerMap,
  type AnswerValue,
  type BuiltinKey,
  type Condition,
  type FieldType,
  type FormFieldSpec,
  type ParticipantBuiltinKey,
  type ParticipantInput,
  type ParticipantRoleKind,
  type ParticipantRoleSpec,
} from '../forms/contract';
import { formatRef } from '../ids';
import { markdownToText } from '../markdown';
import { personNameColumns } from '../person-name';
import { normalizePhoneNumber } from '../phone';
import { parseSpeakerName } from '../speaker-name';

/**
 * The public CFP runtime's service half. Everything here is callable from a Server Action, a route
 * handler or a test; nothing here reads a cookie or a request.
 */

export const DEFAULT_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;

/** A `form_field` row, structurally, so the pure helpers below are testable without a database. */
export type FieldRow = {
  id: string;
  position: number;
  step: number;
  type: FieldType;
  key: string;
  builtinKey: string | null;
  label: string;
  helpText: string | null;
  placeholder: string | null;
  required: boolean;
  options: string[] | null;
  showIf: Condition | null;
  minLength: number | null;
  maxLength: number | null;
  charLimitGroup: string | null;
};

export type NamedRow = { id: string; name: string };

/** The event-scoped lists that back the built-in `format`, `track` and `tags` choosers. */
export type Taxonomy = {
  formats: NamedRow[];
  tracks: NamedRow[];
  tags: NamedRow[];
};

/**
 * What the runtime renders: the engine's `FormFieldSpec` plus the presentation-only columns and a
 * value→label map. Choice *values* are always ids for the built-ins that resolve to a foreign key,
 * because the answer has to survive as `format_id` rather than as a name someone later renamed.
 */
export type RuntimeField = FormFieldSpec & {
  helpText: string | null;
  placeholder: string | null;
  optionLabels: Record<string, string> | null;
};

function labelMap(rows: NamedRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

function normalizeConditionValue(
  condition: Condition | null,
  target: RuntimeField | undefined,
): Condition | null {
  if (!condition || condition.value === undefined || !target?.optionLabels) return condition;

  const value = String(condition.value);
  if (target.options?.includes(value)) return condition;

  const option = Object.entries(target.optionLabels).find(([, label]) => label === value);
  return option ? { ...condition, value: option[0] } : condition;
}

/**
 * Built-in choice fields take their options from the event's taxonomy rather than from whatever the
 * builder stored on the row, so a track renamed after the form was published still renders — and so
 * `validateAnswers`, which checks membership in `options`, sees the same ids the value carries.
 */
export function buildFieldSpecs(rows: FieldRow[], taxonomy: Taxonomy): RuntimeField[] {
  const ordered = [...rows].sort((a, b) => a.step - b.step || a.position - b.position);

  const fields = ordered.map((row) => {
    const builtinKey = (row.builtinKey ?? null) as BuiltinKey | null;

    let options = row.options;
    let optionLabels: Record<string, string> | null = null;

    if (builtinKey === 'format') {
      options = taxonomy.formats.map((entry) => entry.id);
      optionLabels = labelMap(taxonomy.formats);
    } else if (builtinKey === 'track') {
      options = taxonomy.tracks.map((entry) => entry.id);
      optionLabels = labelMap(taxonomy.tracks);
    } else if (builtinKey === 'tags') {
      options = taxonomy.tags.map((entry) => entry.id);
      optionLabels = labelMap(taxonomy.tags);
    } else if (builtinKey === 'level') {
      options = row.options?.length ? row.options : [...DEFAULT_LEVELS];
    }

    return {
      id: row.id,
      key: row.key,
      builtinKey,
      type: resolveFieldType({ builtinKey, type: row.type }),
      label: row.label,
      position: row.position,
      step: row.step,
      required: row.required || builtinKey === 'title',
      options: options ?? null,
      showIf: row.showIf,
      minLength: row.minLength,
      maxLength: row.maxLength,
      charLimitGroup: row.charLimitGroup,
      helpText: row.helpText,
      placeholder: row.placeholder,
      optionLabels,
    };
  });

  const byId = new Map(fields.map((field) => [field.id, field]));
  return fields.map((field) => ({
    ...field,
    showIf: normalizeConditionValue(field.showIf, byId.get(field.showIf?.fieldId ?? '')),
  }));
}

// ---------------------------------------------------------------------------
// `F-6` / `F-7` — the participant model
// ---------------------------------------------------------------------------

/** A participant question as the runtime renders it. Same engine, its own built-in namespace. */
export type ParticipantField = RuntimeField & { participantKey: ParticipantBuiltinKey };

export function buildParticipantSpecs(rows: FieldRow[]): ParticipantField[] {
  return [...rows]
    .filter((row) => isParticipantKey(row.builtinKey))
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const participantKey = row.builtinKey as ParticipantBuiltinKey;
      const meta = PARTICIPANT_BUILTIN_META[participantKey];
      const ceiling = meta.maxLength;
      return {
        id: row.id,
        key: row.key,
        entity: 'participant' as const,
        builtinKey: null,
        participantKey,
        type: meta.type,
        label: row.label,
        position: row.position,
        step: row.step,
        // The three identity fields ignore whatever is stored: `F-6` locks them required, and a row
        // written before that lock existed must not be able to unlock itself.
        required: meta.requiredLocked ? true : row.required,
        options: null,
        showIf: null,
        minLength: row.minLength,
        // Same reasoning as the abstract built-ins: the constant is the ceiling, not a suggestion.
        maxLength: ceiling === null ? row.maxLength : Math.min(row.maxLength ?? ceiling, ceiling),
        charLimitGroup: null,
        helpText: row.helpText,
        placeholder: row.placeholder,
        optionLabels: null,
      };
    });
}

function isParticipantKey(key: string | null): key is ParticipantBuiltinKey {
  return key !== null && key in PARTICIPANT_BUILTIN_META;
}

/**
 * `ParticipantInput` and its two helpers live in `lib/forms/contract.ts`, not here. The participant
 * stage is a client island, and a client component that value-imports this module pulls `pg` into the
 * browser bundle — and, since the session-target path reaches the agenda, a mail transport with it.
 * Re-exported so server callers still have one import for the whole participant model.
 */
export { emptyParticipant, participantValues, type ParticipantInput };

/**
 * `F-6` and `F-7` together, and the only place either is decided. Field-level rules come from
 * `validateAnswers` — the same required flags and character caps the builder configured — and the
 * count rules from `validateParticipantCounts`.
 *
 * Errors are keyed `participants.<index>.<field>` so the client can put a message under the right box
 * on a stage that renders several people at once; a flat key would land every error on the first one.
 */
export function validateParticipants(
  fields: ParticipantField[],
  people: ParticipantInput[],
  roles: ParticipantRoleSpec[],
  maxParticipants: number | null,
): void {
  const errors: Record<string, string> = {};

  const seen = new Map<string, number>();
  people.forEach((person, index) => {
    try {
      validateAnswers(
        fields.map((field) => ({ ...field, key: field.participantKey })),
        participantValues(person),
      );
    } catch (error) {
      if (!isAppError(error) || !error.details) throw error;
      for (const [key, message] of Object.entries(error.details)) {
        errors[`participants.${index}.${key}`] = message;
      }
    }

    if (person.phone?.trim()) {
      try {
        normalizePhoneNumber(person.phone);
      } catch (error) {
        errors[`participants.${index}.phone`] =
          error instanceof Error ? error.message : 'Enter a valid phone number';
      }
    }

    const email = person.email.trim().toLowerCase();
    if (email) {
      const first = seen.get(email);
      if (first !== undefined) {
        errors[`participants.${index}.email`] = 'This person is already on the submission';
      } else {
        seen.set(email, index);
      }
    }
  });

  try {
    validateParticipantCounts(
      roles,
      people.map((person) => person.role),
      maxParticipants,
    );
  } catch (error) {
    if (!isAppError(error) || !error.details) throw error;
    Object.assign(errors, error.details);
  }

  if (Object.keys(errors).length > 0) {
    throw invalid('Some of the people on this submission need attention', errors);
  }
}

export type SubmissionColumns = {
  title: string;
  descriptionMarkdown: string | null;
  formatId: string | null;
  trackId: string | null;
  level: string | null;
};

export type PreparedSubmission = {
  columns: SubmissionColumns;
  tagIds: string[];
  answers: AnswerMap;
};

function asText(value: AnswerValue): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function asIdList(value: AnswerValue): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const single = asText(value);
  return single ? [single] : [];
}

/**
 * The split the whole hybrid table rests on: the six locked built-ins become real columns, tags
 * become `submission_tag` rows, and every other answer stays in `answers`. Hidden answers are
 * dropped first so a question the submitter never saw cannot reach either destination.
 */
export function prepareSubmission(fields: RuntimeField[], rawValues: AnswerMap): PreparedSubmission {
  const values = clearHiddenAnswers(fields, rawValues);
  validateAnswers(fields, values);

  const { builtins, answers } = splitAnswers(fields, values);

  return {
    columns: {
      title: asText(builtins.title ?? null) ?? 'Untitled submission',
      descriptionMarkdown: asText(builtins.description ?? null),
      formatId: asText(builtins.format ?? null),
      trackId: asText(builtins.track ?? null),
      level: asText(builtins.level ?? null),
    },
    tagIds: asIdList(builtins.tags ?? null),
    answers,
  };
}

export type SubmissionLimits = {
  /** `F-14`: false disables save-as-draft entirely; true allows any number of simultaneous drafts. */
  allowDrafts: boolean;
  /** `F-13`: null means unlimited. */
  maxSubmissionsPerUser: number | null;
};

/**
 * `F-13`. Counted per form and per submitter, excluding withdrawn rows — a submitter who pulled a
 * talk should get that slot back rather than being permanently charged for it.
 */
export function assertWithinSubmissionLimit(
  limits: SubmissionLimits,
  existingCount: number,
  isNew: boolean,
): void {
  if (!isNew) return;
  const max = limits.maxSubmissionsPerUser;
  if (max !== null && max !== undefined && existingCount >= max) {
    throw conflict(
      max === 1
        ? 'You have already submitted to this call for speakers'
        : `You have reached this event's limit of ${max} submissions`,
    );
  }
}

export function assertDraftsAllowed(limits: SubmissionLimits): void {
  if (!limits.allowDrafts) {
    throw invalid('This form does not allow saving a draft');
  }
}

export function remainingSubmissions(
  limits: SubmissionLimits,
  existingCount: number,
): number | null {
  const max = limits.maxSubmissionsPerUser;
  if (max === null || max === undefined) return null;
  return Math.max(0, max - existingCount);
}

/** `F-10`: a form only takes answers while it is open and inside its window. */
export function isAcceptingSubmissions(
  form: { status: 'draft' | 'open' | 'closed'; opensAt: Date | null; closesAt: Date | null },
  now = new Date(),
): boolean {
  if (form.status !== 'open') return false;
  if (form.opensAt && form.opensAt.getTime() > now.getTime()) return false;
  if (form.closesAt && form.closesAt.getTime() <= now.getTime()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Loading the public form
// ---------------------------------------------------------------------------

/**
 * `externalTitle` carries `F-9`'s public title, resolved with the same fallback `loadPublicForm`
 * uses. `name` is left exactly as it was — the internal label — so the surfaces already reading it
 * are untouched and a caller that must not leak it has something else to read.
 */
export type OpenCallSummary = {
  slug: string;
  name: string;
  externalTitle: string;
  closesAt: Date | null;
};

/**
 * The open calls for speakers on an event's public front door. A call nobody can find is a call
 * nobody answers, and until this existed the only route to a published form was a link the
 * organizer had pasted somewhere else.
 *
 * Soonest deadline first, because that is the one a speaker has to act on.
 */
export async function listOpenCalls(eventId: string, now = new Date()): Promise<OpenCallSummary[]> {
  const rows = await getDb().query.form.findMany({
    where: and(eq(form.eventId, eventId), eq(form.kind, 'cfp'), eq(form.status, 'open')),
  });

  return rows
    .filter((row) => isAcceptingSubmissions(row, now))
    .sort((a, b) => (a.closesAt?.getTime() ?? Infinity) - (b.closesAt?.getTime() ?? Infinity))
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      externalTitle: row.externalTitle?.trim() || row.name,
      closesAt: row.closesAt,
    }));
}

export type PublicFormBundle = {
  event: {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
    timezone: string;
  };
  form: {
    id: string;
    slug: string;
    /** `F-9`: the internal name. Never rendered on the public page. */
    name: string;
    /** `F-9`: what the submitter sees. Falls back to `name` until the organizer sets one. */
    externalTitle: string;
    /** `F-9`: the welcome screen's heading, at most 15 characters. */
    pageHeading: string | null;
    /** `F-9`: false hides the welcome copy without the organizer having to delete it. */
    showWelcome: boolean;
    status: 'draft' | 'open' | 'closed';
    /** `F-4` */
    targetType: 'abstract' | 'session';
    /** `F-4` */
    collectsParticipants: boolean;
    introMarkdown: string | null;
    opensAt: Date | null;
    closesAt: Date | null;
    allowDrafts: boolean;
    maxSubmissionsPerUser: number | null;
    /** `F-7` */
    maxParticipants: number | null;
  };
  fields: RuntimeField[];
  /** `F-6` */
  participantFields: ParticipantField[];
  /** `F-7` */
  roles: ParticipantRoleSpec[];
  taxonomy: Taxonomy;
};

/**
 * `cache()`-wrapped: `generateMetadata` and the page body on the public CFP route both call this for
 * the same request, and without request-scoped memoization each call re-runs all six queries.
 */
export const loadPublicForm = cache(async (
  eventSlug: string,
  formSlug: string,
): Promise<PublicFormBundle | null> => {
  const db = getDb();

  const eventRow = await db.query.event.findFirst({ where: eq(event.slug, eventSlug) });
  if (!eventRow) return null;

  const formRow = await db.query.form.findFirst({
    where: and(eq(form.eventId, eventRow.id), eq(form.slug, formSlug)),
  });
  if (!formRow) return null;

  const [fieldRows, roleRows, formats, tracks, tags] = await Promise.all([
    db.query.formField.findMany({
      where: eq(formField.formId, formRow.id),
      orderBy: [asc(formField.step), asc(formField.position)],
    }),
    db.query.formParticipantRole.findMany({
      where: eq(formParticipantRole.formId, formRow.id),
      orderBy: [asc(formParticipantRole.position)],
    }),
    db.query.sessionFormat.findMany({
      where: eq(sessionFormat.eventId, eventRow.id),
      orderBy: [asc(sessionFormat.position)],
    }),
    db.query.track.findMany({
      where: eq(trackTable.eventId, eventRow.id),
      orderBy: [asc(trackTable.position)],
    }),
    db.query.tag.findMany({ where: eq(tagTable.eventId, eventRow.id), orderBy: [asc(tagTable.name)] }),
  ]);

  const taxonomy: Taxonomy = {
    formats: formats.map((row) => ({ id: row.id, name: row.name })),
    tracks: tracks.map((row) => ({ id: row.id, name: row.name })),
    tags: tags.map((row) => ({ id: row.id, name: row.name })),
  };

  return {
    event: {
      id: eventRow.id,
      slug: eventRow.slug,
      name: eventRow.name,
      tagline: eventRow.tagline,
      timezone: eventRow.timezone,
    },
    form: {
      id: formRow.id,
      slug: formRow.slug,
      name: formRow.name,
      externalTitle: formRow.externalTitle?.trim() || formRow.name,
      pageHeading: formRow.pageHeading,
      showWelcome: formRow.showWelcome,
      status: formRow.status,
      targetType: formRow.targetType,
      collectsParticipants: formRow.collectsParticipants,
      introMarkdown: formRow.introMarkdown,
      opensAt: formRow.opensAt,
      closesAt: formRow.closesAt,
      allowDrafts: formRow.allowDrafts,
      maxSubmissionsPerUser: formRow.maxSubmissionsPerUser,
      maxParticipants: formRow.maxParticipants,
    },
    fields: buildFieldSpecs(toFieldRows(fieldRows.filter((row) => row.entity === 'abstract')), taxonomy),
    participantFields: buildParticipantSpecs(
      toFieldRows(fieldRows.filter((row) => row.entity === 'participant')),
    ),
    roles: roleRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      position: row.position,
      minCount: row.minCount,
      maxCount: row.maxCount,
    })),
    taxonomy,
  };
});

function toFieldRows(rows: Array<typeof formField.$inferSelect>): FieldRow[] {
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    step: row.step,
    type: row.type,
    key: row.key,
    builtinKey: row.builtinKey,
    label: row.label,
    helpText: row.helpText,
    placeholder: row.placeholder,
    required: row.required,
    options: row.options ?? null,
    showIf: row.showIf ?? null,
    minLength: row.minLength,
    maxLength: row.maxLength,
    charLimitGroup: row.charLimitGroup,
  }));
}

export async function countSubmissionsForUser(formId: string, userId: string): Promise<number> {  const db = getDb();
  const rows = await db
    .select({ id: submission.id, status: submission.status })
    .from(submission)
    .where(and(eq(submission.formId, formId), eq(submission.submitterUserId, userId)));
  return rows.filter((row) => row.status !== 'withdrawn').length;
}

export type DraftSummary = {
  id: string;
  ref: string;
  title: string;
  updatedAt: Date;
};

export async function listDrafts(formId: string, userId: string): Promise<DraftSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: submission.id,
      ref: submission.ref,
      title: submission.title,
      updatedAt: submission.updatedAt,
      status: submission.status,
    })
    .from(submission)
    .where(and(eq(submission.formId, formId), eq(submission.submitterUserId, userId)));

  return rows
    .filter((row) => row.status === 'draft')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((row) => ({
      id: row.id,
      ref: formatRef('submission', row.ref),
      title: row.title,
      updatedAt: row.updatedAt,
    }));
}

export type LoadedDraft = {
  id: string;
  values: AnswerMap;
  fileNames: Record<string, string>;
};

export type DraftValueSource = {
  title: string;
  descriptionMarkdown: string | null;
  formatId: string | null;
  trackId: string | null;
  level: string | null;
  answers: AnswerMap;
};

export function rehydrateDraftValues(
  row: DraftValueSource,
  tagIds: string[],
  fields: RuntimeField[],
): AnswerMap {
  const values: AnswerMap = { ...row.answers };
  for (const field of fields) {
    switch (field.builtinKey) {
      case 'title':
        values[field.key] = row.title === 'Untitled submission' ? '' : row.title;
        break;
      case 'description':
        values[field.key] = row.descriptionMarkdown ?? '';
        break;
      case 'format':
        values[field.key] = row.formatId ?? '';
        break;
      case 'track':
        values[field.key] = row.trackId ?? '';
        break;
      case 'level':
        values[field.key] = row.level ?? '';
        break;
      case 'tags':
        values[field.key] = tagIds;
        break;
      default:
        break;
    }
  }
  return values;
}

/** Rehydrates a draft into the shape the runtime renders, built-in columns folded back in. */
export async function loadDraftValues(
  submissionId: string,
  userId: string,
  fields: RuntimeField[],
): Promise<LoadedDraft | null> {
  const db = getDb();
  const row = await db.query.submission.findFirst({ where: eq(submission.id, submissionId) });
  if (!row || row.submitterUserId !== userId) return null;

  const tagRows = await db
    .select({ tagId: submissionTag.tagId })
    .from(submissionTag)
    .where(eq(submissionTag.submissionId, row.id));

  const values = rehydrateDraftValues(
    { ...row, answers: row.answers as AnswerMap },
    tagRows.map((tagRow) => tagRow.tagId),
    fields,
  );

  return { id: row.id, values, fileNames: await resolveFileNames(fields, values) };
}

async function resolveFileNames(
  fields: RuntimeField[],
  values: AnswerMap,
): Promise<Record<string, string>> {
  const ids = fields
    .filter((field) => field.type === 'file')
    .map((field) => values[field.key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (ids.length === 0) return {};

  const db = getDb();
  const rows = await db
    .select({ id: file.id, filename: file.filename })
    .from(file)
    .where(inArray(file.id, ids));
  return Object.fromEntries(rows.map((row) => [row.id, row.filename]));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type SaveSubmissionInput = {
  eventId: string;
  formId: string;
  userId: string;
  fields: RuntimeField[];
  values: AnswerMap;
  limits: SubmissionLimits;
  mode: 'draft' | 'submit';
  /** Present when resuming; the row is updated in place rather than a second draft created. */
  submissionId?: string | null;
  /** `F-4`: what the completed submission becomes. Absent means an abstract, as it always did. */
  targetType?: 'abstract' | 'session';
};

export type SavedSubmission = {
  id: string;
  ref: number;
  displayRef: string;
  status: 'draft' | 'submitted' | 'accepted';
  title: string;
};

/**
 * `S-5`: the per-event counter is bumped in the same statement that reads it, so two submissions
 * landing together cannot be handed the same `ABS-` number.
 */
async function allocateRef(eventId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .update(event)
    .set({ submissionSeq: sql`${event.submissionSeq} + 1`, updatedAt: new Date() })
    .where(eq(event.id, eventId))
    .returning({ ref: event.submissionSeq });
  if (!row) throw notFound('That event');
  return row.ref;
}

export async function saveSubmission(input: SaveSubmissionInput): Promise<SavedSubmission> {
  const db = getDb();

  if (input.mode === 'draft') assertDraftsAllowed(input.limits);

  // A draft skips content validation so a half-filled form can always be parked; a real submit does
  // not, which is the only difference between the two paths.
  const prepared =
    input.mode === 'submit'
      ? prepareSubmission(input.fields, input.values)
      : prepareDraft(input.fields, input.values);

  const existing = input.submissionId
    ? await db.query.submission.findFirst({ where: eq(submission.id, input.submissionId) })
    : undefined;

  if (input.submissionId && !existing) throw notFound('That submission');
  if (existing && existing.submitterUserId !== input.userId) {
    throw forbidden('That submission belongs to someone else');
  }
  if (existing && existing.status !== 'draft') {
    throw conflict('That submission has already been sent');
  }

  if (!existing) {
    const count = await countSubmissionsForUser(input.formId, input.userId);
    assertWithinSubmissionLimit(input.limits, count, true);
  }

  /**
   * `F-4`. A form that targets Sessions is collecting the programme itself — an invited keynote, a
   * sponsor slot, a track chair's own panel — rather than a proposal somebody has to decide on. So it
   * lands accepted and mints its `scheduled_session` immediately, which puts it in the agenda's
   * unscheduled queue instead of in a review round nobody intends to run on it.
   *
   * A draft is a draft on either target; nothing is decided until it is sent.
   */
  const targetsSession = input.targetType === 'session';
  const status =
    input.mode !== 'submit' ? ('draft' as const) : targetsSession ? ('accepted' as const) : ('submitted' as const);
  const now = new Date();

  const row = existing
    ? (
        await db
          .update(submission)
          .set({
            ...prepared.columns,
            answers: prepared.answers,
            status,
            submittedAt: input.mode === 'submit' ? now : null,
            decidedAt: input.mode === 'submit' && targetsSession ? now : null,
            updatedAt: now,
          })
          .where(eq(submission.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(submission)
          .values({
            eventId: input.eventId,
            formId: input.formId,
            ref: await allocateRef(input.eventId),
            submitterUserId: input.userId,
            ...prepared.columns,
            answers: prepared.answers,
            status,
            submittedAt: input.mode === 'submit' ? now : null,
            decidedAt: input.mode === 'submit' && targetsSession ? now : null,
          })
          .returning()
      )[0];

  await db.delete(submissionTag).where(eq(submissionTag.submissionId, row.id));
  if (prepared.tagIds.length > 0) {
    await db
      .insert(submissionTag)
      .values(prepared.tagIds.map((tagId) => ({ submissionId: row.id, tagId })))
      .onConflictDoNothing();
  }

  if (input.mode === 'submit' && targetsSession) await ensureScheduledSession(input.eventId, row.id);

  return {
    id: row.id,
    ref: row.ref,
    displayRef: formatRef('submission', row.ref),
    status,
    title: row.title,
  };
}

/** Same split as a real submit, minus the validation a half-finished draft would always fail. */
function prepareDraft(fields: RuntimeField[], rawValues: AnswerMap): PreparedSubmission {
  const values = clearHiddenAnswers(fields, rawValues);
  const { builtins, answers } = splitAnswers(fields, values);
  return {
    columns: {
      title: asText(builtins.title ?? null) ?? 'Untitled submission',
      descriptionMarkdown: asText(builtins.description ?? null),
      formatId: asText(builtins.format ?? null),
      trackId: asText(builtins.track ?? null),
      level: asText(builtins.level ?? null),
    },
    tagIds: asIdList(builtins.tags ?? null),
    answers,
  };
}

/**
 * `P-3`: a cold submitter leaves with a real record in the event, not just a row in `submission`.
 * Idempotent, because a returning submitter hits this on every submit.
 */
export async function ensureParticipant(
  eventId: string,
  userId: string,
  displayName: string | null,
): Promise<string> {
  const db = getDb();
  const safeDisplayName = parseSpeakerName(displayName);
  const existing = await db.query.participant.findFirst({
    where: and(eq(participant.eventId, eventId), eq(participant.userId, userId)),
  });
  if (existing) {
    if (!existing.displayName && safeDisplayName) {
      await db
        .update(participant)
        .set({ displayName: safeDisplayName, updatedAt: new Date() })
        .where(eq(participant.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(participant)
    .values({ eventId, userId, displayName: safeDisplayName })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;

  const raced = await db.query.participant.findFirst({
    where: and(eq(participant.eventId, eventId), eq(participant.userId, userId)),
  });
  if (!raced) throw notFound('That participant');
  return raced.id;
}

export async function linkPrimarySpeaker(
  submissionId: string,
  participantId: string,
  kind: ParticipantRoleKind = 'speaker',
): Promise<void> {
  await getDb()
    .insert(participantRole)
    .values({ submissionId, participantId, kind, isPrimary: true, position: 0 })
    .onConflictDoNothing();
}

/**
 * `F-6`. One person, resolved to an account and a participant row.
 *
 * `user.name` is written from the two halves rather than left alone: it is what the roster, the
 * agenda, the exports and every merge field render, and a display name that disagrees with the first
 * and last name somebody just typed is the failure this whole split has to avoid. An account that
 * already exists keeps its email — the address is identity here, not a field to overwrite.
 */
async function upsertPerson(
  eventId: string,
  person: ParticipantInput,
): Promise<{ userId: string; participantId: string }> {
  const db = getDb();
  const email = person.email.trim().toLowerCase();
  const columns = personNameColumns(person);
  const phone = person.phone?.trim() ? normalizePhoneNumber(person.phone) : null;

  const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
  const userId = existing
    ? existing.id
    : ((
        await db
          .insert(user)
          .values({ email, ...columns, phone })
          .onConflictDoNothing()
          .returning()
      )[0]?.id ??
      (await db.query.user.findFirst({ where: eq(user.email, email) }))?.id);
  if (!userId) throw notFound('That account');

  if (existing) {
    await db
      .update(user)
      .set({
        ...columns,
        // A blank phone box does not erase a number the speaker gave the portal earlier.
        phone: phone ?? existing.phone,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  }

  // `P-3`: everyone named on a submission gets their own speaker portal, not a share of somebody
  // else's. That is the difference between a co-speaker whose bio is right and one whose is not.
  await db
    .insert(membership)
    .values({ userId, eventId, role: 'speaker' })
    .onConflictDoNothing();

  const participantId = await ensureParticipant(eventId, userId, columns.name);

  const biography = person.biography?.trim() || null;
  if (biography) {
    await db
      .update(participant)
      .set({ bioMarkdown: biography, updatedAt: new Date() })
      .where(eq(participant.id, participantId));
  }

  return { userId, participantId };
}

/**
 * `F-6` and `F-7`'s write half. The whole cast is replaced rather than merged, because the
 * participant stage shows the submitter the complete list and what they see is what they meant.
 * The submitter is always first and always primary — they are who the confirmation goes to and who
 * may later withdraw the talk.
 */
export async function saveParticipants(input: {
  eventId: string;
  formId: string;
  submissionId: string;
  submitterUserId: string;
  people: ParticipantInput[];
}): Promise<string[]> {
  const db = getDb();
  const participantIds: string[] = [];

  for (const [position, person] of input.people.entries()) {
    const { participantId } = await upsertPerson(input.eventId, person);
    participantIds.push(participantId);

    await db
      .insert(participantRole)
      .values({
        submissionId: input.submissionId,
        participantId,
        kind: person.role,
        isPrimary: position === 0,
        position,
      })
      .onConflictDoUpdate({
        target: [participantRole.submissionId, participantRole.participantId],
        set: { kind: person.role, isPrimary: position === 0, position },
      });
  }

  // Anyone the submitter took off the list loses their role on this submission. Their participant
  // row and their portal survive — they may still be on somebody else's talk.
  const stale = await db
    .select({ id: participantRole.id, participantId: participantRole.participantId })
    .from(participantRole)
    .where(eq(participantRole.submissionId, input.submissionId));
  const keep = new Set(participantIds);
  for (const role of stale) {
    if (!keep.has(role.participantId)) {
      await db.delete(participantRole).where(eq(participantRole.id, role.id));
    }
  }

  return participantIds;
}

/**
 * `F-4`, the session-target half. The row is `draft` and unscheduled, which is exactly what the
 * agenda's unscheduled queue is for: the organizer decides the room and the slot, not the submitter.
 *
 * The ref and the calendar UID come from `agenda-mutations` rather than being minted again here: two
 * ways to allocate a session ref is how two sessions end up sharing one, and a second UID format is
 * how a rescheduled invite stops updating in place instead of updating. The import is deferred
 * because that module reaches into the mail path, and every other caller of this file — the CSV
 * exporter, the draft loader, the public page — has no business dragging a mail transport in with it.
 */
async function ensureScheduledSession(eventId: string, submissionId: string): Promise<void> {
  const db = getDb();
  const existing = await db.query.scheduledSession.findFirst({
    where: eq(scheduledSession.submissionId, submissionId),
  });
  if (existing) return;

  const row = await db.query.submission.findFirst({ where: eq(submission.id, submissionId) });
  if (!row) throw notFound('That submission');

  const { allocateSessionRef, mintIcsUid } = await import('./agenda-mutations');

  await db.insert(scheduledSession).values({
    eventId,
    submissionId,
    ref: await allocateSessionRef(eventId),
    title: row.title,
    descriptionMarkdown: row.descriptionMarkdown,
    trackId: row.trackId,
    formatId: row.formatId,
    status: 'draft',
    icsUid: mintIcsUid(),
  });
}

/** `S-9`. A speaker withdraws their own talk; the row stays for the organizer's record. */
export async function withdrawSubmission(submissionId: string, userId: string): Promise<void> {
  const db = getDb();
  const row = await db.query.submission.findFirst({ where: eq(submission.id, submissionId) });
  if (!row) throw notFound('That submission');
  if (row.submitterUserId !== userId) throw forbidden('That submission belongs to someone else');
  if (row.status === 'withdrawn') return;

  await db
    .update(submission)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(eq(submission.id, submissionId));
}

// ---------------------------------------------------------------------------
// `V-8` CSV export
// ---------------------------------------------------------------------------

export type ExportRow = {
  ref: number;
  status: string;
  submittedAt: Date | null;
  submitterName: string | null;
  submitterEmail: string;
  title: string;
  descriptionMarkdown: string | null;
  formatId: string | null;
  trackId: string | null;
  level: string | null;
  tagIds: string[];
  answers: AnswerMap;
};

function csvCell(value: string): string {
  const text = spreadsheetSafeCellText(value);
  const needsQuotes = /[",\n\r]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function renderAnswer(
  field: RuntimeField,
  value: AnswerValue,
  fileNames: Record<string, string>,
): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((entry) => field.optionLabels?.[String(entry)] ?? String(entry)).join('; ');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = String(value);
  if (field.type === 'file') return fileNames[text] ?? text;
  if (field.type === 'markdown' || field.type === 'long_text') return markdownToText(text);
  return field.optionLabels?.[text] ?? text;
}

/**
 * One column per question, built-ins first in their real order. Written here rather than in the
 * organizer surface because the `answers` shape is this module's business and nowhere else's.
 */
export function buildCsv(
  fields: RuntimeField[],
  rows: ExportRow[],
  taxonomy: Taxonomy,
  fileNames: Record<string, string> = {},
): string {
  const custom = fields.filter((field) => !field.builtinKey && field.type !== 'section_break');
  const formats = labelMap(taxonomy.formats);
  const tracks = labelMap(taxonomy.tracks);
  const tags = labelMap(taxonomy.tags);

  const header = [
    'Ref',
    'Status',
    'Submitted at',
    'Submitter name',
    'Submitter email',
    'Title',
    'Description',
    'Format',
    'Track',
    'Level',
    'Tags',
    ...custom.map((field) => field.label),
  ];

  const lines = [header.map(csvCell).join(',')];

  for (const row of rows) {
    const cells = [
      formatRef('submission', row.ref),
      row.status,
      row.submittedAt ? row.submittedAt.toISOString() : '',
      row.submitterName ?? '',
      row.submitterEmail,
      row.title,
      markdownToText(row.descriptionMarkdown),
      row.formatId ? (formats[row.formatId] ?? row.formatId) : '',
      row.trackId ? (tracks[row.trackId] ?? row.trackId) : '',
      row.level ?? '',
      row.tagIds.map((id) => tags[id] ?? id).join('; '),
      ...custom.map((field) => renderAnswer(field, row.answers[field.key] ?? null, fileNames)),
    ];
    lines.push(cells.map(csvCell).join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}

export async function exportFormSubmissionsCsv(formId: string): Promise<{ filename: string; body: string }> {
  const db = getDb();

  const formRow = await db.query.form.findFirst({ where: eq(form.id, formId) });
  if (!formRow) throw notFound('That form');

  const eventRow = await db.query.event.findFirst({ where: eq(event.id, formRow.eventId) });
  if (!eventRow) throw notFound('That event');

  const bundle = await loadPublicForm(eventRow.slug, formRow.slug);
  if (!bundle) throw notFound('That form');

  const rows = await db
    .select({
      id: submission.id,
      ref: submission.ref,
      status: submission.status,
      submittedAt: submission.submittedAt,
      title: submission.title,
      descriptionMarkdown: submission.descriptionMarkdown,
      formatId: submission.formatId,
      trackId: submission.trackId,
      level: submission.level,
      answers: submission.answers,
      submitterName: user.name,
      submitterEmail: user.email,
    })
    .from(submission)
    .innerJoin(user, eq(user.id, submission.submitterUserId))
    .where(eq(submission.formId, formId))
    .orderBy(asc(submission.ref));

  const tagRows = rows.length
    ? await db
        .select({ submissionId: submissionTag.submissionId, tagId: submissionTag.tagId })
        .from(submissionTag)
        .where(
          inArray(
            submissionTag.submissionId,
            rows.map((row) => row.id),
          ),
        )
    : [];

  const tagsBySubmission = new Map<string, string[]>();
  for (const row of tagRows) {
    tagsBySubmission.set(row.submissionId, [
      ...(tagsBySubmission.get(row.submissionId) ?? []),
      row.tagId,
    ]);
  }

  const fileIds = new Set<string>();
  for (const row of rows) {
    for (const field of bundle.fields) {
      if (field.type !== 'file') continue;
      const value = (row.answers as AnswerMap)[field.key];
      if (typeof value === 'string' && value) fileIds.add(value);
    }
  }
  const fileRows = fileIds.size
    ? await db
        .select({ id: file.id, filename: file.filename })
        .from(file)
        .where(inArray(file.id, [...fileIds]))
    : [];

  const body = buildCsv(
    bundle.fields,
    rows.map((row) => ({
      ref: row.ref,
      status: row.status,
      submittedAt: row.submittedAt,
      submitterName: row.submitterName,
      submitterEmail: row.submitterEmail,
      title: row.title,
      descriptionMarkdown: row.descriptionMarkdown,
      formatId: row.formatId,
      trackId: row.trackId,
      level: row.level,
      tagIds: tagsBySubmission.get(row.id) ?? [],
      answers: row.answers as AnswerMap,
    })),
    bundle.taxonomy,
    Object.fromEntries(fileRows.map((row) => [row.id, row.filename])),
  );

  return { filename: `${eventRow.slug}-${formRow.slug}-submissions.csv`, body };
}
