import { and, asc, eq, inArray, or } from 'drizzle-orm';
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
  taskScope as taskScopeEnum,
  user,
} from '../../db/schema';
import type { EventContext } from '../context';
import { can } from '../context';
import { appUrl } from '../env';
import { conflict, forbidden, invalid, notFound } from '../errors';
import type { AnswerMap, FormFieldSpec } from '../forms/contract';
import { clearHiddenAnswers, validateAnswers } from '../forms/contract';
import { formatRef } from '../ids';
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
export type TaskScope = (typeof taskScopeEnum.enumValues)[number];

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
      throw conflict('An organizer waived this task, so there is nothing left to do');
    }
    throw conflict(`A task that is ${current.replace('_', ' ')} cannot be reopened`);
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
      if (evidence.fileCount < 1) throw invalid('Upload at least one file to finish this task');
      return;
    case 'form':
      if (!evidence.answers) throw invalid('Answer the form before submitting it');
      return;
    case 'acknowledge':
    case 'link':
      if (!evidence.acknowledged) throw invalid('Confirm this task before marking it done');
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
  scope: TaskScope;
  /** True when this row is the whole session team's, so the portal can say so before they type. */
  shared: boolean;
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

/**
 * Materialises the assignments the scoping rules imply, for the whole event. `B-1` counts assignment
 * rows, so a task that exists only as a rule is invisible to the organizer until someone opens the
 * portal — which is exactly the reporting gap the dashboard was built to close.
 *
 * It resolves every task against the same pure function the organizer's own save path uses, so a
 * row created lazily on a portal visit and a row created eagerly on a task edit cannot disagree
 * about who owes what. `manual` tasks are still left alone here: their membership is a list the
 * organizer typed, and only the save path knows it.
 */
export async function ensureAssignments(eventId: string, participantId?: string): Promise<void> {
  const db = getDb();
  const tasks = await db.select().from(task).where(eq(task.eventId, eventId));
  if (tasks.length === 0) return;

  const { participantIds, roles } = await eventRoster(eventId);
  const existing = await db
    .select({
      taskId: taskAssignment.taskId,
      participantId: taskAssignment.participantId,
      submissionId: taskAssignment.submissionId,
    })
    .from(taskAssignment)
    .where(
      inArray(
        taskAssignment.taskId,
        tasks.map((row) => row.id),
      ),
    );
  const held = new Set(existing.map((row) => `${row.taskId} ${targetKey(row)}`));

  /**
   * A group row is held by the session's primary speaker but read by the whole team, so a
   * co-speaker opening their portal has to be able to bring one into being — otherwise the task is
   * invisible until the lead signs in, which on a panel of four is three people who cannot start.
   */
  const mySubmissions = participantId
    ? new Set(
        roles.filter((role) => role.participantId === participantId).map((role) => role.submissionId),
      )
    : null;
  const mine = (row: AssignmentTarget) =>
    !participantId ||
    row.participantId === participantId ||
    (row.scope === 'group' && row.submissionId !== null && mySubmissions!.has(row.submissionId));

  const missing = tasks
    .filter((row) => row.audience !== 'manual')
    .flatMap((row) =>
      resolveAssignmentTargets({
        scope: row.scope,
        audience: row.audience,
        pinnedSubmissionId: row.submissionId,
        selectedParticipantIds: [],
        participantIds,
        roles,
      })
        .filter((target) => mine(target) && !held.has(`${row.id} ${targetKey(target)}`))
        .map((target) => ({
          taskId: row.id,
          participantId: target.participantId,
          submissionId: target.submissionId,
          scope: target.scope,
          status: 'not_started' as const,
        })),
    );
  if (missing.length === 0) return;

  await db.insert(taskAssignment).values(missing).onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Organizer-authored task types
// ---------------------------------------------------------------------------

/** The sessions this participant speaks on, which is what makes a group task theirs to see. */
async function mySubmissionIds(participantId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: participantRole.submissionId })
    .from(participantRole)
    .where(eq(participantRole.participantId, participantId));
  return rows.map((row) => row.id);
}

export async function listPortalTasks(eventId: string, participantId: string): Promise<PortalTask[]> {
  const db = getDb();
  const mySubmissions = await mySubmissionIds(participantId);
  /**
   * `S-16`. Two ways a row reaches a speaker: it is theirs, or it is their session's. A group
   * assignment is held by the primary speaker and shown to every co-speaker, so filtering on
   * `participantId` alone — which is all this read ever did — would hide the shared row from
   * everyone but the lead.
   */
  const visible =
    mySubmissions.length > 0
      ? or(
          eq(taskAssignment.participantId, participantId),
          and(
            eq(taskAssignment.scope, 'group'),
            inArray(taskAssignment.submissionId, mySubmissions),
          ),
        )
      : eq(taskAssignment.participantId, participantId);

  const rows = await db
    .select({ assignment: taskAssignment, task, fileRequest, form })
    .from(taskAssignment)
    .innerJoin(task, eq(task.id, taskAssignment.taskId))
    .leftJoin(fileRequest, eq(fileRequest.id, task.fileRequestId))
    .leftJoin(form, eq(form.id, task.formId))
    .where(and(visible, eq(task.eventId, eventId)))
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
      scope: assignment.scope,
      shared: assignment.scope === 'group',
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

  if (!row) throw notFound('That task');
  if (row.assignment.participantId === participantId || can(ctx, 'task:manage')) return row;

  /**
   * `S-16`. A group assignment is one row for a whole speaking team, so "is it yours" is answered
   * by the session rather than by the row's holder — otherwise the three co-speakers who are not
   * the primary could see the shared task and not touch it.
   */
  const shared =
    row.assignment.scope === 'group' &&
    row.assignment.submissionId !== null &&
    Boolean(
      await getDb().query.participantRole.findFirst({
        where: and(
          eq(participantRole.participantId, participantId),
          eq(participantRole.submissionId, row.assignment.submissionId),
        ),
      }),
    );
  if (!shared) throw forbidden('That task belongs to someone else');
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
    throw invalid('That task needs a file or a form, not a confirmation');
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
  if (row.kind !== 'file_upload') throw invalid('That task does not collect files');
  if (assignment.status === 'waived') {
    throw conflict('An organizer waived this task, so there is nothing left to do');
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
  if (!row) throw notFound('That file request');
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
  if (row.kind !== 'form' || !row.formId) throw invalid('That task is not a form');

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
    `Hi${recipient.name ? ` ${recipient.name}` : ''},`,
    '',
    configured?.confirmationBodyMarkdown?.trim() ||
      `Thanks — we have your answers for **${row.name}**. You can review or change them any time.`,
    '',
    `[Open your ${eventRow.name} portal](${portalLink})`,
  ].join('\n');

  await sendMail({
    to: recipient.email,
    subject: configured?.confirmationSubject?.trim() || `${row.name} — received`,
    html: renderMarkdown(body),
    text: markdownToText(body).replace(`Open your ${eventRow.name} portal`, portalLink),
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
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can copy tasks');
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
        scope: row.scope,
        // The pin names a session on the *source* event, which does not exist over here. The scope
        // carries over; the session it was about is this year's organizer to choose again.
        submissionId: null,
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

export type ScopableSubmission = { id: string; ref: string; title: string; accepted: boolean };

/**
 * `S-16`. The sessions an organizer can pin a task to. Everything with somebody speaking on it,
 * not only the accepted ones — "send the panel their briefing pack" is a thing to do while a talk
 * is still under review, and a picker that hid it would send the organizer back to the queue to
 * find out why.
 */
export async function listScopableSubmissions(ctx: EventContext): Promise<ScopableSubmission[]> {
  if (!can(ctx, 'task:manage')) return [];
  const rows = await getDb()
    .selectDistinct({
      id: submission.id,
      ref: submission.ref,
      title: submission.title,
      status: submission.status,
    })
    .from(submission)
    .innerJoin(participantRole, eq(participantRole.submissionId, submission.id))
    .where(eq(submission.eventId, ctx.eventId))
    .orderBy(asc(submission.ref));
  return rows.map((row) => ({
    id: row.id,
    ref: formatRef('submission', row.ref),
    title: row.title,
    accepted: row.status === 'accepted',
  }));
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
  /** `S-16`. Defaults to `contact`, which is what every task meant before scoping existed. */
  scope?: TaskScope;
  /** `S-16`. The session this task is about, when the organizer named one. */
  submissionId?: string | null;
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
  const scope = input.scope ?? 'contact';
  const submissionId = input.submissionId?.trim() || null;
  if (!name) throw invalid('Give the task a name');
  if (input.kind === 'link' && !input.linkUrl?.trim()) {
    throw invalid('A link task needs the URL the speaker should open');
  }
  if (input.kind === 'form' && !input.formId) {
    throw invalid('A form task needs a portal form to point at');
  }
  if (input.audience === 'manual' && participantIds.length === 0) {
    throw invalid('Choose at least one speaker for this task');
  }
  /**
   * A contact-scoped task is about the person, so a session on it would be decorative at best and
   * misleading at worst — which is precisely how the old auto-populated `submissionId` behaved.
   * Refusing it is kinder than quietly dropping it.
   */
  if (scope === 'contact' && submissionId) {
    throw invalid('Scope this task to a session or to a group before pinning it to one');
  }
  return {
    ...input,
    name,
    scope,
    submissionId,
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
  await ensureAssignments(eventId);
}

export type AssignmentTarget = {
  participantId: string;
  submissionId: string | null;
  scope: TaskScope;
};

/** One speaking role on this event: who, on what, and whether that talk was accepted. */
export type SpeakingRole = {
  participantId: string;
  submissionId: string;
  accepted: boolean;
  isPrimary: boolean;
  position: number;
};

export type ScopeResolution = {
  scope: TaskScope;
  audience: TaskAudience;
  /** `task.submissionId`. Null unless the organizer pinned the task to one session. */
  pinnedSubmissionId: string | null;
  /** Only consulted for the `manual` audience. */
  selectedParticipantIds: string[];
  participantIds: string[];
  roles: SpeakingRole[];
};

/**
 * `S-16`. The whole of task scoping, as one pure function — no database, no context, nothing to
 * stub. It is pure because it is the part that is easy to get subtly wrong and hard to notice:
 * whether a co-speaker on two accepted panels owes a task once or twice is not something a page
 * render makes obvious, and it was wrong here for as long as `audience` was the only axis.
 *
 * The two axes are independent and both are needed:
 *
 * - `audience` picks the **people** — everyone, everyone with an accepted talk, or a hand-picked
 *   list. Unchanged, and it still means exactly what it meant.
 * - `scope` picks **what a row is about**, and therefore how many rows those people generate.
 *
 * Pinning a task to a session narrows *both*. A task about `SESS-4` is not owed by speakers who are
 * not on `SESS-4`, whatever the audience says, so the pin intersects the audience rather than
 * sitting beside it. Without the pin, "the sessions in play" means the accepted ones — the pin is
 * the organizer naming a talk explicitly, so its status is their business rather than ours.
 */
export function resolveAssignmentTargets(input: ScopeResolution): AssignmentTarget[] {
  const { scope, audience, pinnedSubmissionId, selectedParticipantIds, participantIds } = input;
  const known = new Set(participantIds);
  const roles = input.roles.filter((role) => known.has(role.participantId));

  const inPlay = roles.filter((role) =>
    pinnedSubmissionId ? role.submissionId === pinnedSubmissionId : role.accepted,
  );

  const audienceIds =
    audience === 'all_participants'
      ? participantIds
      : audience === 'accepted_participants'
        ? roles.filter((role) => role.accepted).map((role) => role.participantId)
        : selectedParticipantIds;

  const onPinnedSession = pinnedSubmissionId
    ? new Set(inPlay.map((role) => role.participantId))
    : null;
  const people = [...new Set(audienceIds)].filter(
    (id) => known.has(id) && (!onPinnedSession || onPinnedSession.has(id)),
  );
  const audienceSet = new Set(people);

  if (scope === 'contact') {
    return people.map((participantId) => ({ participantId, submissionId: null, scope }));
  }

  const relevant = inPlay.filter((role) => audienceSet.has(role.participantId));

  if (scope === 'submission') {
    return relevant.map((role) => ({
      participantId: role.participantId,
      submissionId: role.submissionId,
      scope,
    }));
  }

  /**
   * One shared row per session, held by that session's primary speaker. The holder is picked by a
   * total order rather than by whatever the query returned first, because `reconcileAssignments`
   * diffs on it: a holder that moved between two saves would delete a completed group answer and
   * write a blank one in its place.
   */
  const bySubmission = new Map<string, SpeakingRole[]>();
  for (const role of relevant) {
    bySubmission.set(role.submissionId, [...(bySubmission.get(role.submissionId) ?? []), role]);
  }
  return [...bySubmission.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([submissionId, members]) => {
      const holder = [...members].sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.position - b.position ||
          a.participantId.localeCompare(b.participantId),
      )[0];
      return { participantId: holder.participantId, submissionId, scope };
    });
}

/** Everything `resolveAssignmentTargets` needs about one event, read once. */
async function eventRoster(
  eventId: string,
): Promise<{ participantIds: string[]; roles: SpeakingRole[] }> {
  const db = getDb();
  const [participants, roles] = await Promise.all([
    db.select({ id: participant.id }).from(participant).where(eq(participant.eventId, eventId)),
    db
      .select({
        participantId: participantRole.participantId,
        submissionId: submission.id,
        status: submission.status,
        isPrimary: participantRole.isPrimary,
        position: participantRole.position,
      })
      .from(participantRole)
      .innerJoin(submission, eq(submission.id, participantRole.submissionId))
      .where(eq(submission.eventId, eventId)),
  ]);

  return {
    participantIds: participants.map((row) => row.id),
    roles: roles.map((row) => ({
      participantId: row.participantId,
      submissionId: row.submissionId,
      accepted: row.status === 'accepted',
      isPrimary: row.isPrimary,
      position: row.position,
    })),
  };
}

async function assignmentTargets(eventId: string, input: TaskInput): Promise<AssignmentTarget[]> {
  const { participantIds, roles } = await eventRoster(eventId);

  const selectedIds = input.participantIds ?? [];
  const known = new Set(participantIds);
  if (input.audience === 'manual' && selectedIds.some((id) => !known.has(id))) {
    throw invalid('Every selected speaker must belong to this event');
  }
  if (input.submissionId && !roles.some((role) => role.submissionId === input.submissionId)) {
    throw invalid('That session has nobody speaking on it yet');
  }

  return resolveAssignmentTargets({
    scope: input.scope ?? 'contact',
    audience: input.audience,
    pinnedSubmissionId: input.submissionId ?? null,
    selectedParticipantIds: selectedIds,
    participantIds,
    roles,
  });
}

/** Identity of an assignment row under the widened key: a person, and the session it is about. */
function targetKey(row: { participantId: string; submissionId: string | null }): string {
  return `${row.participantId} ${row.submissionId ?? ''}`;
}

export function assignmentMembershipChanges(
  existing: Array<{
    id: string;
    participantId: string;
    submissionId: string | null;
    scope: TaskScope;
  }>,
  targets: AssignmentTarget[],
): {
  removeIds: string[];
  additions: AssignmentTarget[];
  updates: Array<{ id: string; scope: TaskScope }>;
} {
  const byKey = new Map(targets.map((row) => [targetKey(row), row]));
  const existingKeys = new Set(existing.map(targetKey));
  return {
    removeIds: existing.filter((row) => !byKey.has(targetKey(row))).map((row) => row.id),
    additions: targets.filter((row) => !existingKeys.has(targetKey(row))),
    /**
     * A row whose person and session both still match is kept rather than replaced, so a completed
     * status, an uploaded file and a set of answers all survive an organizer renaming the task or
     * moving it between scopes. Only the denormalised `scope` needs writing back.
     */
    updates: existing.flatMap((row) => {
      const target = byKey.get(targetKey(row));
      return target && target.scope !== row.scope ? [{ id: row.id, scope: target.scope }] : [];
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
      scope: taskAssignment.scope,
    })
    .from(taskAssignment)
    .where(eq(taskAssignment.taskId, taskId));
  const { removeIds, additions, updates } = assignmentMembershipChanges(existing, targets);

  // Removals go first and alone: a task moved from one scope to another can produce an addition
  // that collides with a row being dropped in the same pass, and the widened unique indexes would
  // reject the insert if the two raced.
  if (removeIds.length > 0) {
    await db.delete(taskAssignment).where(inArray(taskAssignment.id, removeIds));
  }

  await Promise.all([
    additions.length > 0
      ? db
          .insert(taskAssignment)
          .values(
            additions.map((row) => ({
              taskId,
              participantId: row.participantId,
              submissionId: row.submissionId,
              scope: row.scope,
              status: 'not_started' as const,
            })),
          )
          .onConflictDoNothing()
      : Promise.resolve(),
    ...updates.map((row) =>
      db.update(taskAssignment).set({ scope: row.scope }).where(eq(taskAssignment.id, row.id)),
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
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can create tasks');
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
      scope: clean.scope ?? 'contact',
      submissionId: clean.submissionId ?? null,
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
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can edit tasks');
  const clean = normalizeTaskInput(input);
  const db = getDb();
  const targets = await assignmentTargets(ctx.eventId, clean);

  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.eventId, ctx.eventId)))
    .limit(1);
  if (!row) throw notFound('That task');

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
      scope: clean.scope ?? 'contact',
      submissionId: clean.submissionId ?? null,
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
  if (!can(ctx, 'task:manage')) throw forbidden('Only organizers can delete tasks');
  const db = getDb();
  const [row] = await db
    .select({ id: task.id, fileRequestId: task.fileRequestId })
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.eventId, ctx.eventId)))
    .limit(1);
  if (!row) throw notFound('That task');
  await db.delete(task).where(eq(task.id, taskId));
  // The request only ever existed to serve this task; already-uploaded files hang off the
  // assignment, not the request, so they survive it.
  if (row.fileRequestId) {
    await db.delete(fileRequest).where(eq(fileRequest.id, row.fileRequestId));
  }
}
