import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  event,
  file,
  form,
  formField,
  participant,
  participantRole,
  sessionFormat,
  submission,
  submissionTag,
  tag as tagTable,
  track as trackTable,
  user,
} from '../../db/schema';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { spreadsheetSafeCellText } from '../csv';
import {
  BUILTIN_META,
  clearHiddenAnswers,
  splitAnswers,
  validateAnswers,
  type AnswerMap,
  type AnswerValue,
  type BuiltinKey,
  type Condition,
  type FieldType,
  type FormFieldSpec,
} from '../forms/contract';
import { formatRef } from '../ids';
import { markdownToText } from '../markdown';

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
    const meta = builtinKey ? BUILTIN_META[builtinKey] : null;

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
      type: (meta?.type ?? row.type) as FieldType,
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
      title: asText(builtins.title ?? null) ?? 'Untitled petition',
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
        ? 'You have already filed a petition with this call for orators'
        : `You have reached this event's limit of ${max} petitions`,
    );
  }
}

export function assertDraftsAllowed(limits: SubmissionLimits): void {
  if (!limits.allowDrafts) {
    throw invalid('This scroll does not permit unfiled drafts');
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

export type OpenCallSummary = { slug: string; name: string; closesAt: Date | null };

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
    .map((row) => ({ slug: row.slug, name: row.name, closesAt: row.closesAt }));
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
    name: string;
    status: 'draft' | 'open' | 'closed';
    introMarkdown: string | null;
    opensAt: Date | null;
    closesAt: Date | null;
    allowDrafts: boolean;
    maxSubmissionsPerUser: number | null;
  };
  fields: RuntimeField[];
  taxonomy: Taxonomy;
};

export async function loadPublicForm(
  eventSlug: string,
  formSlug: string,
): Promise<PublicFormBundle | null> {
  const db = getDb();

  const eventRow = await db.query.event.findFirst({ where: eq(event.slug, eventSlug) });
  if (!eventRow) return null;

  const formRow = await db.query.form.findFirst({
    where: and(eq(form.eventId, eventRow.id), eq(form.slug, formSlug)),
  });
  if (!formRow) return null;

  const [fieldRows, formats, tracks, tags] = await Promise.all([
    db.query.formField.findMany({
      where: eq(formField.formId, formRow.id),
      orderBy: [asc(formField.step), asc(formField.position)],
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
      status: formRow.status,
      introMarkdown: formRow.introMarkdown,
      opensAt: formRow.opensAt,
      closesAt: formRow.closesAt,
      allowDrafts: formRow.allowDrafts,
      maxSubmissionsPerUser: formRow.maxSubmissionsPerUser,
    },
    fields: buildFieldSpecs(
      fieldRows.map((row) => ({
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
      })),
      taxonomy,
    ),
    taxonomy,
  };
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
        values[field.key] = ['Untitled submission', 'Untitled petition'].includes(row.title)
          ? ''
          : row.title;
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
};

export type SavedSubmission = {
  id: string;
  ref: number;
  displayRef: string;
  status: 'draft' | 'submitted';
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

  if (input.submissionId && !existing) throw notFound('That petition');
  if (existing && existing.submitterUserId !== input.userId) {
    throw forbidden('That petition belongs to another petitioner');
  }
  if (existing && existing.status !== 'draft') {
    throw conflict('That petition has already been filed');
  }

  if (!existing) {
    const count = await countSubmissionsForUser(input.formId, input.userId);
    assertWithinSubmissionLimit(input.limits, count, true);
  }

  const status = input.mode === 'submit' ? ('submitted' as const) : ('draft' as const);
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
      title: asText(builtins.title ?? null) ?? 'Untitled petition',
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
  const existing = await db.query.participant.findFirst({
    where: and(eq(participant.eventId, eventId), eq(participant.userId, userId)),
  });
  if (existing) {
    if (!existing.displayName && displayName) {
      await db
        .update(participant)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(participant.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(participant)
    .values({ eventId, userId, displayName })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;

  const raced = await db.query.participant.findFirst({
    where: and(eq(participant.eventId, eventId), eq(participant.userId, userId)),
  });
  if (!raced) throw notFound('That orator');
  return raced.id;
}

export async function linkPrimarySpeaker(
  submissionId: string,
  participantId: string,
): Promise<void> {
  await getDb()
    .insert(participantRole)
    .values({ submissionId, participantId, kind: 'speaker', isPrimary: true, position: 0 })
    .onConflictDoNothing();
}

/** `S-9`. A speaker withdraws their own talk; the row stays for the organizer's record. */
export async function withdrawSubmission(submissionId: string, userId: string): Promise<void> {
  const db = getDb();
  const row = await db.query.submission.findFirst({ where: eq(submission.id, submissionId) });
  if (!row) throw notFound('That petition');
  if (row.submitterUserId !== userId) throw forbidden('That petition belongs to another petitioner');
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
 * admin surface because the `answers` shape is this module's business and nowhere else's.
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
    'Lodged at',
    'Petitioner name',
    'Petitioner dispatch address',
    'Title',
    'Description',
    'Oration format',
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
  if (!formRow) throw notFound('That scroll');

  const eventRow = await db.query.event.findFirst({ where: eq(event.id, formRow.eventId) });
  if (!eventRow) throw notFound('That event');

  const bundle = await loadPublicForm(eventRow.slug, formRow.slug);
  if (!bundle) throw notFound('That scroll');

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
