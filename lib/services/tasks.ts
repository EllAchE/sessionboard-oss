import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client';
import {
  event,
  fileRequest,
  form,
  formField,
  membership,
  participant,
  participantRole,
  submission,
  task,
  taskAssignment,
  taskStatus as taskStatusEnum,
  taskKind as taskKindEnum,
  user,
} from '../../db/schema';
import type { EventContext } from '../context';
import { can, requireCapability } from '../context';
import { appUrl } from '../env';
import { conflict, forbidden, invalid, notFound } from '../errors';
import type { AnswerMap, FormFieldSpec } from '../forms/contract';
import { clearHiddenAnswers, validateAnswers } from '../forms/contract';
import { sendMail } from '../mail';
import { markdownToText, renderMarkdown } from '../markdown';
import type { FileRecord, FileRequestSpec, UploadInput } from './files';
import { deleteFile, listFiles, uploadForRequest } from './files';

/**
 * `S-14`–`S-20`. The speaker completes a task in place and the assignment's status is what the
 * organizer's `B-1` dashboard counts, so the transitions below are the contract between the two
 * surfaces rather than a portal detail.
 */

export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskKind = (typeof taskKindEnum.enumValues)[number];

/**
 * What a speaker can do to their own assignment. `waive` is deliberately absent: waiving is an
 * organizer's judgment that the work is not needed, and a speaker who could waive their own task
 * would make the dashboard's numbers meaningless.
 */
export type TaskAction = 'start' | 'save_progress' | 'complete' | 'reopen';

const TRANSITIONS: Record<TaskStatus, Record<TaskAction, TaskStatus | null>> = {
  not_started: {
    start: 'in_progress',
    save_progress: 'in_progress',
    complete: 'completed',
    reopen: null,
  },
  in_progress: {
    start: 'in_progress',
    save_progress: 'in_progress',
    complete: 'completed',
    reopen: 'in_progress',
  },
  /** Editing a finished answer drops it back to in_progress; the organizer should see the churn. */
  completed: {
    start: 'completed',
    save_progress: 'in_progress',
    complete: 'completed',
    reopen: 'in_progress',
  },
  /** Terminal for the speaker. Only an organizer put it here and only an organizer takes it back. */
  waived: { start: null, save_progress: null, complete: null, reopen: null },
};

export function nextTaskStatus(current: TaskStatus, action: TaskAction): TaskStatus {
  const next = TRANSITIONS[current][action];
  if (next === null) {
    if (current === 'waived') {
      throw conflict('The magistrates waived this duty, so nothing remains to be done');
    }
    throw conflict(`A duty that is ${current.replace('_', ' ')} cannot be reopened`);
  }
  return next;
}

export function isTerminal(status: TaskStatus): boolean {
  return status === 'completed' || status === 'waived';
}

export function isOverdue(status: TaskStatus, dueAt: Date | null, now = new Date()): boolean {
  if (!dueAt || isTerminal(status)) return false;
  return dueAt.getTime() < now.getTime();
}

export type CompletionEvidence = {
  kind: TaskKind;
  fileCount: number;
  answers: AnswerMap | null;
  acknowledged: boolean;
};

/**
 * A status is only worth as much as the evidence behind it. `B-1` reads "completed" as "this work is
 * done", so an empty file upload or an unanswered form must not be able to reach it.
 */
export function assertCompletable(evidence: CompletionEvidence): void {
  switch (evidence.kind) {
    case 'file_upload':
      if (evidence.fileCount < 1) throw invalid('Lodge at least one scroll to fulfill this duty');
      return;
    case 'form':
      if (!evidence.answers) throw invalid('Answer the scroll before lodging it');
      return;
    case 'acknowledge':
    case 'link':
      if (!evidence.acknowledged) throw invalid('Affirm this duty before marking it fulfilled');
      return;
  }
}

/**
 * `assertCompletable` guarantees this on every write path: a `file_upload` or `form` assignment
 * cannot reach `completed` without the evidence — a file, an answer set — sitting beside it. That
 * guarantee only holds for rows written through this service, though. A row written directly (seed
 * data, a migration, a hand edit in the database) can still land with the flag set and nothing behind
 * it, and `/portal/[eventSlug]/tasks` and `/portal/[eventSlug]/files` both read `listPortalTasks`, so
 * either both screens are wrong together or neither is. Reading resolves that by re-deriving the
 * status from the evidence instead of trusting the stored flag: a kind that needs evidence to
 * complete is only shown as `completed` when the evidence is actually present.
 */
export function reconcileStatus(kind: TaskKind, status: TaskStatus, hasEvidence: boolean): TaskStatus {
  if (status !== 'completed' || hasEvidence) return status;
  return kind === 'file_upload' || kind === 'form' ? 'in_progress' : status;
}

export type PortalTask = {
  assignmentId: string;
  taskId: string;
  name: string;
  descriptionMarkdown: string | null;
  descriptionHtml: string;
  kind: TaskKind;
  status: TaskStatus;
  required: boolean;
  position: number;
  dueAt: Date | null;
  overdue: boolean;
  completedAt: Date | null;
  linkUrl: string | null;
  submissionId: string | null;
  submissionTitle: string | null;
  answers: AnswerMap | null;
  fileRequest: FileRequestSpec | null;
  files: FileRecord[];
  form: PortalTaskForm | null;
};

export type PortalTaskForm = {
  id: string;
  name: string;
  introMarkdown: string | null;
  fields: FormFieldSpec[];
  confirmationSubject: string | null;
  confirmationBodyMarkdown: string | null;
};

/** Where the assignment stashes uploaded file ids, since `task_assignment` holds only one `fileId`. */
const FILE_IDS_KEY = '__fileIds';

function fileIdsOf(answers: Record<string, unknown> | null): string[] {
  const raw = answers?.[FILE_IDS_KEY];
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
}

function formAnswersOf(answers: Record<string, unknown> | null): AnswerMap | null {
  if (!answers) return null;
  const entries = Object.entries(answers).filter(([key]) => key !== FILE_IDS_KEY);
  return entries.length === 0 ? null : (Object.fromEntries(entries) as AnswerMap);
}

async function acceptedSubmissionIds(participantId: string): Promise<{ id: string; title: string }[]> {
  const rows = await getDb()
    .select({ id: submission.id, title: submission.title, status: submission.status })
    .from(participantRole)
    .innerJoin(submission, eq(submission.id, participantRole.submissionId))
    .where(eq(participantRole.participantId, participantId));
  return rows.filter((row) => row.status === 'accepted').map(({ id, title }) => ({ id, title }));
}

/**
 * Materialises the assignments an audience rule implies. `B-1` counts assignment rows, so a task
 * that exists only as an audience rule is invisible to the organizer until someone opens the portal
 * — which is exactly the reporting gap the dashboard was built to close.
 */
export async function ensureAssignments(eventId: string, participantId: string): Promise<void> {
  const db = getDb();
  const tasks = await db.select().from(task).where(eq(task.eventId, eventId));
  if (tasks.length === 0) return;

  const existing = await db
    .select({ taskId: taskAssignment.taskId })
    .from(taskAssignment)
    .where(
      and(
        eq(taskAssignment.participantId, participantId),
        inArray(
          taskAssignment.taskId,
          tasks.map((row) => row.id),
        ),
      ),
    );
  const assigned = new Set(existing.map((row) => row.taskId));
  const accepted = await acceptedSubmissionIds(participantId);

  const missing = tasks.filter((row) => {
    if (assigned.has(row.id)) return false;
    if (row.audience === 'all_participants') return true;
    if (row.audience === 'accepted_participants') return accepted.length > 0;
    return false;
  });
  if (missing.length === 0) return;

  await db
    .insert(taskAssignment)
    .values(
      missing.map((row) => ({
        taskId: row.id,
        participantId,
        status: 'not_started' as const,
        submissionId: accepted[0]?.id ?? null,
      })),
    )
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Organizer-authored task types
// ---------------------------------------------------------------------------

export async function listPortalTasks(eventId: string, participantId: string): Promise<PortalTask[]> {
  const db = getDb();
  const rows = await db
    .select({ assignment: taskAssignment, task, fileRequest, form })
    .from(taskAssignment)
    .innerJoin(task, eq(task.id, taskAssignment.taskId))
    .leftJoin(fileRequest, eq(fileRequest.id, task.fileRequestId))
    .leftJoin(form, eq(form.id, task.formId))
    .where(and(eq(taskAssignment.participantId, participantId), eq(task.eventId, eventId)))
    .orderBy(asc(task.position), asc(task.createdAt));

  const formIds = rows.map((row) => row.form?.id).filter((id): id is string => Boolean(id));
  const fields = formIds.length
    ? await db.select().from(formField).where(inArray(formField.formId, formIds)).orderBy(asc(formField.position))
    : [];

  const wantedFileIds = rows.flatMap((row) => fileIdsOf(row.assignment.answers));
  const files = await listFiles(eventId, wantedFileIds);
  const filesById = new Map(files.map((record) => [record.id, record]));

  const submissionIds = rows
    .map((row) => row.assignment.submissionId)
    .filter((id): id is string => Boolean(id));
  const submissions = submissionIds.length
    ? await db
        .select({ id: submission.id, title: submission.title })
        .from(submission)
        .where(inArray(submission.id, submissionIds))
    : [];
  const titleById = new Map(submissions.map((row) => [row.id, row.title]));

  const now = new Date();
  return rows.map(({ assignment, task: row, fileRequest: request, form: portalForm }) => {
    const taskFiles = fileIdsOf(assignment.answers)
      .map((id) => filesById.get(id))
      .filter((record): record is FileRecord => Boolean(record));
    const answers = formAnswersOf(assignment.answers);
    const hasEvidence =
      row.kind === 'file_upload' ? taskFiles.length > 0 : row.kind === 'form' ? answers !== null : true;
    const status = reconcileStatus(row.kind, assignment.status, hasEvidence);
    const completedAt = status === 'completed' ? assignment.completedAt : null;

    return {
      assignmentId: assignment.id,
      taskId: row.id,
      name: row.name,
      descriptionMarkdown: row.descriptionMarkdown,
      descriptionHtml: renderMarkdown(row.descriptionMarkdown),
      kind: row.kind,
      status,
      required: row.required,
      position: row.position,
      dueAt: row.dueAt,
      overdue: isOverdue(status, row.dueAt, now),
      completedAt,
      linkUrl: row.linkUrl,
      submissionId: assignment.submissionId,
      submissionTitle: assignment.submissionId ? (titleById.get(assignment.submissionId) ?? null) : null,
      answers,
      fileRequest: request
        ? {
            id: request.id,
            label: request.label,
            helpText: request.helpText,
            acceptedTypes: request.acceptedTypes ?? [],
            maxSizeMb: request.maxSizeMb,
            allowMultiple: request.allowMultiple,
          }
        : null,
      files: taskFiles,
      form: portalForm
        ? {
            id: portalForm.id,
            name: portalForm.name,
            introMarkdown: portalForm.introMarkdown,
            confirmationSubject: portalForm.confirmationSubject,
            confirmationBodyMarkdown: portalForm.confirmationBodyMarkdown,
            fields: fields
              .filter((field) => field.formId === portalForm.id)
              .map(
                (field): FormFieldSpec => ({
                  id: field.id,
                  key: field.key,
                  builtinKey: null,
                  type: field.type,
                  label: field.label,
                  position: field.position,
                  step: field.step,
                  required: field.required,
                  options: field.options ?? null,
                  showIf: field.showIf ?? null,
                  minLength: field.minLength,
                  maxLength: field.maxLength,
                  charLimitGroup: field.charLimitGroup,
                }),
              ),
          }
        : null,
    };
  });
}

export type TaskSummary = {
  total: number;
  outstanding: number;
  completed: number;
  waived: number;
  overdue: number;
  nextDueAt: Date | null;
};

export function summarize(tasks: PortalTask[]): TaskSummary {
  const outstanding = tasks.filter((entry) => !isTerminal(entry.status));
  const due = outstanding
    .map((entry) => entry.dueAt)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    total: tasks.length,
    outstanding: outstanding.length,
    completed: tasks.filter((entry) => entry.status === 'completed').length,
    waived: tasks.filter((entry) => entry.status === 'waived').length,
    overdue: tasks.filter((entry) => entry.overdue).length,
    nextDueAt: due[0] ?? null,
  };
}

/** Outstanding first, overdue at the very top, then by due date. Never an onboarding wizard order. */
export function sortForPortal(tasks: PortalTask[]): PortalTask[] {
  const weight = (entry: PortalTask) => {
    if (entry.overdue) return 0;
    if (!isTerminal(entry.status)) return entry.dueAt ? 1 : 2;
    return 3;
  };
  return [...tasks].sort((a, b) => {
    const byWeight = weight(a) - weight(b);
    if (byWeight !== 0) return byWeight;
    const aDue = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return a.position - b.position;
  });
}

type AssignmentRow = typeof taskAssignment.$inferSelect;
type TaskRow = typeof task.$inferSelect;

async function loadAssignment(
  ctx: EventContext,
  participantId: string,
  assignmentId: string,
): Promise<{ assignment: AssignmentRow; task: TaskRow }> {
  const [row] = await getDb()
    .select({ assignment: taskAssignment, task })
    .from(taskAssignment)
    .innerJoin(task, eq(task.id, taskAssignment.taskId))
    .where(and(eq(taskAssignment.id, assignmentId), eq(task.eventId, ctx.eventId)));

  if (!row) throw notFound('That duty');
  if (row.assignment.participantId !== participantId && !can(ctx, 'task:manage')) {
    throw forbidden('That duty belongs to another orator');
  }
  return row;
}

async function applyStatus(
  assignment: AssignmentRow,
  action: TaskAction,
  patch: Partial<AssignmentRow> = {},
): Promise<TaskStatus> {
  const status = nextTaskStatus(assignment.status, action);
  await getDb()
    .update(taskAssignment)
    .set({
      ...patch,
      status,
      completedAt: status === 'completed' ? (assignment.completedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(taskAssignment.id, assignment.id));
  return status;
}

/** `acknowledge` and `link` both complete on an explicit confirmation, never on a page view. */
export async function completeSimpleTask(
  ctx: EventContext,
  participantId: string,
  assignmentId: string,
): Promise<TaskStatus> {
  const { assignment, task: row } = await loadAssignment(ctx, participantId, assignmentId);
  if (row.kind !== 'acknowledge' && row.kind !== 'link') {
    throw invalid('That duty calls for a record or a scroll, not an oath');
  }
  assertCompletable({ kind: row.kind, fileCount: 0, answers: null, acknowledged: true });
  return applyStatus(assignment, 'complete');
}

export async function reopenTask(
  ctx: EventContext,
  participantId: string,
  assignmentId: string,
): Promise<TaskStatus> {
  const { assignment } = await loadAssignment(ctx, participantId, assignmentId);
  return applyStatus(assignment, 'reopen');
}

export async function attachTaskFiles(
  ctx: EventContext,
  participantId: string,
  assignmentId: string,
  uploads: UploadInput[],
): Promise<TaskStatus> {
  const { assignment, task: row } = await loadAssignment(ctx, participantId, assignmentId);
  if (row.kind !== 'file_upload') throw invalid('That duty does not collect records');
  if (assignment.status === 'waived') {
    throw conflict('An organizer waived this duty, so nothing remains to be done');
  }

  const spec = row.fileRequestId
    ? await requestSpec(ctx.eventId, row.fileRequestId)
    : {
        id: 'adhoc',
        label: row.name,
        helpText: null,
        acceptedTypes: [] as string[],
        maxSizeMb: 25,
        allowMultiple: true,
      };

  const existing = fileIdsOf(assignment.answers);
  const stored = await uploadForRequest(ctx, spec, uploads, existing.length);
  const fileIds = [...existing, ...stored.map((record) => record.id)];

  assertCompletable({ kind: 'file_upload', fileCount: fileIds.length, answers: null, acknowledged: true });
  return applyStatus(assignment, 'complete', {
    answers: { ...(assignment.answers ?? {}), [FILE_IDS_KEY]: fileIds },
    fileId: fileIds[fileIds.length - 1] ?? null,
  });
}

export async function removeTaskFile(
  ctx: EventContext,
  participantId: string,
  assignmentId: string,
  fileId: string,
): Promise<TaskStatus> {
  const { assignment } = await loadAssignment(ctx, participantId, assignmentId);
  const remaining = fileIdsOf(assignment.answers).filter((id) => id !== fileId);
  await deleteFile(ctx, fileId);

  if (remaining.length === 0 && assignment.status === 'not_started') {
    return assignment.status;
  }
  const action: TaskAction = remaining.length > 0 ? 'complete' : 'reopen';
  return applyStatus(assignment, action, {
    answers: { ...(assignment.answers ?? {}), [FILE_IDS_KEY]: remaining },
    fileId: remaining[remaining.length - 1] ?? null,
  });
}

async function requestSpec(eventId: string, fileRequestId: string): Promise<FileRequestSpec> {
  const row = await getDb().query.fileRequest.findFirst({
    where: and(eq(fileRequest.id, fileRequestId), eq(fileRequest.eventId, eventId)),
  });
  if (!row) throw notFound('That request for records');
  return {
    id: row.id,
    label: row.label,
    helpText: row.helpText,
    acceptedTypes: row.acceptedTypes ?? [],
    maxSizeMb: row.maxSizeMb,
    allowMultiple: row.allowMultiple,
  };
}

async function fieldsFor(formId: string): Promise<FormFieldSpec[]> {
  const rows = await getDb()
    .select()
    .from(formField)
    .where(eq(formField.formId, formId))
    .orderBy(asc(formField.position));
  return rows.map((field) => ({
    id: field.id,
    key: field.key,
    builtinKey: null,
    type: field.type,
    label: field.label,
    position: field.position,
    step: field.step,
    required: field.required,
    options: field.options ?? null,
    showIf: field.showIf ?? null,
    minLength: field.minLength,
    maxLength: field.maxLength,
    charLimitGroup: field.charLimitGroup,
  }));
}

/**
 * `S-17`. Saving keeps the task in progress; submitting validates and completes it. Hidden answers
 * are cleared on the way in, so a conditional question the speaker never saw cannot be stored.
 */
export async function saveTaskForm(
  ctx: EventContext,
  participantId: string,
  assignmentId: string,
  values: AnswerMap,
  submit: boolean,
): Promise<TaskStatus> {
  const { assignment, task: row } = await loadAssignment(ctx, participantId, assignmentId);
  if (row.kind !== 'form' || !row.formId) throw invalid('That duty is not a scroll');

  const fields = await fieldsFor(row.formId);
  const cleaned = clearHiddenAnswers(fields, values);

  if (!submit) {
    return applyStatus(assignment, 'save_progress', {
      answers: { ...cleaned, [FILE_IDS_KEY]: fileIdsOf(assignment.answers) },
    });
  }

  validateAnswers(fields, cleaned);
  assertCompletable({ kind: 'form', fileCount: 0, answers: cleaned, acknowledged: true });
  const status = await applyStatus(assignment, 'complete', {
    answers: { ...cleaned, [FILE_IDS_KEY]: fileIdsOf(assignment.answers) },
  });
  await sendFormConfirmation(ctx, participantId, row);
  return status;
}

/**
 * `S-19`. Sent on submit with a link back into the portal, using the form's own confirmation copy
 * when the organizer wrote some. Never throws — `sendMail` already swallows transport failures, and
 * a completed task must not be lost to a mail outage.
 */
async function sendFormConfirmation(ctx: EventContext, participantId: string, row: TaskRow): Promise<void> {
  const db = getDb();
  const [recipient] = await db
    .select({ email: user.email, name: user.name })
    .from(participant)
    .innerJoin(user, eq(user.id, participant.userId))
    .where(eq(participant.id, participantId));
  if (!recipient) return;

  const [eventRow] = await db
    .select({ slug: event.slug, name: event.name })
    .from(event)
    .where(eq(event.id, ctx.eventId));
  if (!eventRow) return;

  const portalLink = `${appUrl()}/portal/${eventRow.slug}/tasks`;
  const configured = row.formId
    ? await db.query.form.findFirst({ where: eq(form.id, row.formId) })
    : undefined;

  const body = [
    `Salve${recipient.name ? ` ${recipient.name}` : ''},`,
    '',
    configured?.confirmationBodyMarkdown?.trim() ||
      `Your answers for **${row.name}** have entered the archive. You may inspect or amend them at any time.`,
    '',
    `[Enter your ${eventRow.name} atrium](${portalLink})`,
  ].join('\n');

  await sendMail({
    to: recipient.email,
    subject: configured?.confirmationSubject?.trim() || `${row.name} — received`,
    html: renderMarkdown(body),
    text: markdownToText(body).replace(`Enter your ${eventRow.name} atrium`, portalLink),
    eventId: ctx.eventId,
    templateKey: 'portal.form_confirmation',
  });
}

export type CopyTasksResult = { copied: number; skipped: string[] };

/**
 * `S-20`. Conferences run annually and rebuild the same onboarding checklist every year. File
 * requests are copied alongside their task, because a task pointing at another event's request would
 * collect files into the wrong event.
 */
export async function copyTasksFromEvent(
  ctx: EventContext,
  sourceEventId: string,
): Promise<CopyTasksResult> {
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can carry duties between events');
  if (sourceEventId === ctx.eventId) throw invalid('Pick a different event to copy from');

  const db = getDb();
  const sourceTasks = await db
    .select()
    .from(task)
    .where(eq(task.eventId, sourceEventId))
    .orderBy(asc(task.position));
  if (sourceTasks.length === 0) return { copied: 0, skipped: [] };

  const existing = await db.select({ name: task.name }).from(task).where(eq(task.eventId, ctx.eventId));
  const taken = new Set(existing.map((row) => row.name.toLowerCase()));

  const requestIds = sourceTasks
    .map((row) => row.fileRequestId)
    .filter((id): id is string => Boolean(id));
  const sourceRequests = requestIds.length
    ? await db.select().from(fileRequest).where(inArray(fileRequest.id, requestIds))
    : [];

  const requestMap = new Map<string, string>();
  for (const source of sourceRequests) {
    const [created] = await db
      .insert(fileRequest)
      .values({
        eventId: ctx.eventId,
        label: source.label,
        helpText: source.helpText,
        acceptedTypes: source.acceptedTypes,
        maxSizeMb: source.maxSizeMb,
        allowMultiple: source.allowMultiple,
      })
      .returning({ id: fileRequest.id });
    requestMap.set(source.id, created.id);
  }

  const skipped: string[] = [];
  const rows = sourceTasks.filter((row) => {
    if (taken.has(row.name.toLowerCase())) {
      skipped.push(`${row.name} — already on this event`);
      return false;
    }
    // A `form` task points at a form owned by the source event; copying the form is the form
    // builder's job, so the task would arrive pointing at nothing a speaker could open.
    if (row.kind === 'form') {
      skipped.push(`${row.name} — rebuild its portal form on this event first`);
      return false;
    }
    return true;
  });

  if (rows.length > 0) {
    await db.insert(task).values(
      rows.map((row) => ({
        eventId: ctx.eventId,
        name: row.name,
        descriptionMarkdown: row.descriptionMarkdown,
        kind: row.kind,
        audience: row.audience,
        formId: null,
        fileRequestId: row.fileRequestId ? (requestMap.get(row.fileRequestId) ?? null) : null,
        linkUrl: row.linkUrl,
        dueAt: null,
        required: row.required,
        position: row.position,
        reminderDaysBefore: row.reminderDaysBefore,
      })),
    );
  }

  return { copied: rows.length, skipped };
}

/** Events this organizer could copy from — anything they organize that has tasks, bar this one. */
export async function copyableEvents(ctx: EventContext): Promise<{ id: string; name: string }[]> {
  if (!can(ctx, 'task:manage')) return [];
  const rows = await getDb()
    .selectDistinct({ id: event.id, name: event.name })
    .from(task)
    .innerJoin(event, eq(event.id, task.eventId))
    .innerJoin(membership, eq(membership.eventId, event.id))
    .where(and(eq(membership.userId, ctx.actor.userId), eq(membership.role, 'organizer')));
  return rows.filter((row) => row.id !== ctx.eventId);
}

export { FILE_IDS_KEY };

// ---------------------------------------------------------------------------
// Organizer-side task authoring — S-14
// ---------------------------------------------------------------------------

export type TaskAudience = 'all_participants' | 'accepted_participants' | 'manual';

export type TaskInput = {
  name: string;
  descriptionMarkdown?: string | null;
  kind: TaskKind;
  audience: TaskAudience;
  participantIds?: string[];
  dueAt?: Date | null;
  required?: boolean;
  linkUrl?: string | null;
  formId?: string | null;
  reminderDaysBefore?: number[];
};

function normalizeTaskInput(input: TaskInput): TaskInput {
  const name = input.name.trim();
  const participantIds = [...new Set(input.participantIds?.filter(Boolean) ?? [])];
  if (!name) throw invalid('Give the duty a name');
  if (input.kind === 'link' && !input.linkUrl?.trim()) {
    throw invalid('A road duty needs the address the orator should follow');
  }
  if (input.kind === 'form' && !input.formId) {
    throw invalid('A scroll duty needs an atrium scroll to point at');
  }
  if (input.audience === 'manual' && participantIds.length === 0) {
    throw invalid('Choose at least one orator for this duty');
  }
  return {
    ...input,
    name,
    participantIds: input.audience === 'manual' ? participantIds : [],
    descriptionMarkdown: input.descriptionMarkdown?.trim() || null,
    linkUrl: input.kind === 'link' ? (input.linkUrl?.trim() ?? null) : null,
    formId: input.kind === 'form' ? (input.formId ?? null) : null,
    reminderDaysBefore: (input.reminderDaysBefore ?? [])
      .filter((days) => Number.isFinite(days) && days > 0)
      .sort((a, b) => b - a),
  };
}

/**
 * Fanning out on write rather than on portal open: `B-1` counts assignment rows, so an organizer
 * who adds a task mid-cycle should see the outstanding count move immediately instead of waiting
 * for every speaker to sign in.
 */
async function fanOutAssignments(eventId: string): Promise<void> {
  const participants = await getDb()
    .select({ id: participant.id })
    .from(participant)
    .where(eq(participant.eventId, eventId));
  await Promise.all(participants.map((row) => ensureAssignments(eventId, row.id)));
}

type AssignmentTarget = { participantId: string; submissionId: string | null };

async function assignmentTargets(eventId: string, input: TaskInput): Promise<AssignmentTarget[]> {
  const db = getDb();
  const [participants, accepted] = await Promise.all([
    db.select({ id: participant.id }).from(participant).where(eq(participant.eventId, eventId)),
    db
      .select({
        participantId: participantRole.participantId,
        submissionId: submission.id,
      })
      .from(participantRole)
      .innerJoin(submission, eq(submission.id, participantRole.submissionId))
      .where(and(eq(submission.eventId, eventId), eq(submission.status, 'accepted'))),
  ]);

  const eventParticipantIds = new Set(participants.map((row) => row.id));
  const selectedIds = input.participantIds ?? [];
  if (input.audience === 'manual' && selectedIds.some((id) => !eventParticipantIds.has(id))) {
    throw invalid('Every selected orator must belong to this event');
  }

  const acceptedSubmissionByParticipant = new Map<string, string>();
  for (const row of accepted) {
    if (
      eventParticipantIds.has(row.participantId) &&
      !acceptedSubmissionByParticipant.has(row.participantId)
    ) {
      acceptedSubmissionByParticipant.set(row.participantId, row.submissionId);
    }
  }

  const targetIds =
    input.audience === 'all_participants'
      ? participants.map((row) => row.id)
      : input.audience === 'accepted_participants'
        ? [...acceptedSubmissionByParticipant.keys()]
        : selectedIds;

  return targetIds.map((participantId) => ({
    participantId,
    submissionId:
      input.audience === 'manual'
        ? null
        : (acceptedSubmissionByParticipant.get(participantId) ?? null),
  }));
}

function assignmentMembershipChanges(
  existing: Array<{ id: string; participantId: string; submissionId: string | null }>,
  targets: AssignmentTarget[],
): {
  removeIds: string[];
  additions: AssignmentTarget[];
  updates: Array<{ id: string; submissionId: string | null }>;
} {
  const targetByParticipant = new Map(targets.map((row) => [row.participantId, row]));
  const targetIds = new Set(targets.map((row) => row.participantId));
  const existingIds = new Set(existing.map((row) => row.participantId));
  return {
    removeIds: existing.filter((row) => !targetIds.has(row.participantId)).map((row) => row.id),
    additions: targets.filter((row) => !existingIds.has(row.participantId)),
    updates: existing.flatMap((row) => {
      const target = targetByParticipant.get(row.participantId);
      return target && target.submissionId !== row.submissionId
        ? [{ id: row.id, submissionId: target.submissionId }]
        : [];
    }),
  };
}

async function reconcileAssignments(taskId: string, targets: AssignmentTarget[]): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({
      id: taskAssignment.id,
      participantId: taskAssignment.participantId,
      submissionId: taskAssignment.submissionId,
    })
    .from(taskAssignment)
    .where(eq(taskAssignment.taskId, taskId));
  const { removeIds, additions, updates } = assignmentMembershipChanges(existing, targets);

  await Promise.all([
    removeIds.length > 0
      ? db.delete(taskAssignment).where(inArray(taskAssignment.id, removeIds))
      : Promise.resolve(),
    additions.length > 0
      ? db
          .insert(taskAssignment)
          .values(
            additions.map((row) => ({
              taskId,
              participantId: row.participantId,
              submissionId: row.submissionId,
              status: 'not_started' as const,
            })),
          )
          .onConflictDoNothing()
      : Promise.resolve(),
    ...updates.map((row) =>
      db
        .update(taskAssignment)
        .set({ submissionId: row.submissionId })
        .where(eq(taskAssignment.id, row.id)),
    ),
  ]);
}

/**
 * A file-upload task without somewhere to put the file is a dead end in the portal, so the request
 * is created alongside it and named after it rather than being a second thing to configure. It
 * carries no help text of its own — the task's instructions already render directly above it.
 */
async function createRequestFor(eventId: string, clean: TaskInput): Promise<string> {
  const [created] = await getDb()
    .insert(fileRequest)
    .values({ eventId, label: clean.name })
    .returning({ id: fileRequest.id });
  return created.id;
}

export async function createTask(ctx: EventContext, input: TaskInput): Promise<{ id: string }> {
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can decree duties');
  const clean = normalizeTaskInput(input);
  const db = getDb();
  const targets = await assignmentTargets(ctx.eventId, clean);

  const existing = await db
    .select({ position: task.position })
    .from(task)
    .where(eq(task.eventId, ctx.eventId));
  const position = existing.reduce((max, row) => Math.max(max, row.position + 1), 0);

  const requestId = clean.kind === 'file_upload' ? await createRequestFor(ctx.eventId, clean) : null;

  const [created] = await db
    .insert(task)
    .values({
      eventId: ctx.eventId,
      name: clean.name,
      descriptionMarkdown: clean.descriptionMarkdown,
      kind: clean.kind,
      audience: clean.audience,
      formId: clean.formId ?? null,
      fileRequestId: requestId,
      linkUrl: clean.linkUrl ?? null,
      dueAt: clean.dueAt ?? null,
      required: clean.required ?? true,
      position,
      reminderDaysBefore: clean.reminderDaysBefore ?? [],
    })
    .returning({ id: task.id });

  await fanOutAssignments(ctx.eventId);
  await reconcileAssignments(created.id, targets);
  return { id: created.id };
}

export async function updateTask(
  ctx: EventContext,
  taskId: string,
  input: TaskInput,
): Promise<void> {
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can amend duties');
  const clean = normalizeTaskInput(input);
  const db = getDb();
  const targets = await assignmentTargets(ctx.eventId, clean);

  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.eventId, ctx.eventId)))
    .limit(1);
  if (!row) throw notFound('That duty');

  // Switching an existing task over to file upload has to grow it an upload target too, or the
  // portal renders a task the speaker cannot act on.
  const requestId =
    clean.kind === 'file_upload' && !row.fileRequestId
      ? await createRequestFor(ctx.eventId, clean)
      : row.fileRequestId;

  await db
    .update(task)
    .set({
      name: clean.name,
      descriptionMarkdown: clean.descriptionMarkdown,
      kind: clean.kind,
      audience: clean.audience,
      formId: clean.formId ?? null,
      fileRequestId: requestId,
      linkUrl: clean.linkUrl ?? null,
      dueAt: clean.dueAt ?? null,
      required: clean.required ?? true,
      reminderDaysBefore: clean.reminderDaysBefore ?? [],
    })
    .where(eq(task.id, taskId));

  if (row.fileRequestId && clean.kind === 'file_upload') {
    await db
      .update(fileRequest)
      .set({ label: clean.name })
      .where(eq(fileRequest.id, row.fileRequestId));
  }
  await fanOutAssignments(ctx.eventId);
  await reconcileAssignments(taskId, targets);
}

export async function deleteTask(ctx: EventContext, taskId: string): Promise<void> {
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can strike duties from the rolls');
  const db = getDb();
  const [row] = await db
    .select({ id: task.id, fileRequestId: task.fileRequestId })
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.eventId, ctx.eventId)))
    .limit(1);
  if (!row) throw notFound('That duty');
  await db.delete(task).where(eq(task.id, taskId));
  // The request only ever existed to serve this task; already-uploaded files hang off the
  // assignment, not the request, so they survive it.
  if (row.fileRequestId) {
    await db.delete(fileRequest).where(eq(fileRequest.id, row.fileRequestId));
  }
}
