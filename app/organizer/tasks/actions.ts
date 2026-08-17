'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability, type EventContext } from '@/lib/context';
import { isAppError } from '@/lib/errors';
import { currentEventContext } from '@/lib/services/events';
import * as tasks from '@/lib/services/tasks';

/**
 * Thin, like the rest of `/organizer`: the rules about what a task may be live in
 * `lib/services/tasks.ts`, and these only resolve the event and translate a thrown `AppError`.
 */

export type TaskActionResult = { ok: true } | { ok: false; message: string };

export type TaskFormInput = {
  name: string;
  descriptionMarkdown: string;
  kind: tasks.TaskKind;
  audience: tasks.TaskAudience;
  scope: tasks.TaskScope;
  submissionId: string;
  participantIds: string[];
  dueAt: string;
  required: boolean;
  linkUrl: string;
  formId: string;
  /** `file_upload` only. One of `ACCEPTED_TYPE_PRESETS`, stored `|`-joined; blank is unconstrained. */
  acceptedTypes: string;
  reminderDaysBefore: string;
  reminderDaysAfterSend: string;
};

const PATH = '/organizer/tasks';

async function manageContext(): Promise<EventContext> {
  const ctx = await currentEventContext();
  requireCapability(ctx, 'task:manage');
  return ctx;
}

async function run(work: () => Promise<unknown>): Promise<TaskActionResult> {
  try {
    await work();
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message };
    console.error(`task action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

/**
 * A bare `YYYY-MM-DD` from `<input type="date">` parses as UTC midnight, which renders as the day
 * before anywhere west of Greenwich. A deadline is also owed by the *end* of its day, so the date
 * becomes 23:59 local rather than the start of it.
 */
function parseDeadline(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!parts) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 23, 59, 0, 0);
}

/** The panel posts strings because that is what an input holds; parsing belongs on this side. */
function toServiceInput(input: TaskFormInput): tasks.TaskInput {
  const due = parseDeadline(input.dueAt);
  const afterSend = Number(input.reminderDaysAfterSend.trim());
  return {
    name: input.name,
    descriptionMarkdown: input.descriptionMarkdown,
    kind: input.kind,
    audience: input.audience,
    scope: input.scope,
    // A contact-scoped task has no session to be about, and the panel keeps the picker's last
    // value when the organizer changes their mind — so it is dropped here rather than refused.
    submissionId: input.scope === 'contact' ? null : input.submissionId || null,
    participantIds: input.participantIds,
    dueAt: due,
    required: input.required,
    linkUrl: input.linkUrl,
    formId: input.formId || null,
    acceptedTypes: input.acceptedTypes.split('|').filter((entry) => entry.trim() !== ''),
    reminderDaysBefore: input.reminderDaysBefore
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((days) => Number.isInteger(days) && days > 0),
    reminderDaysAfterSend:
      input.reminderDaysAfterSend.trim() !== '' && Number.isInteger(afterSend) && afterSend > 0
        ? afterSend
        : null,
  };
}

export async function createTaskAction(input: TaskFormInput): Promise<TaskActionResult> {
  return run(async () => tasks.createTask(await manageContext(), toServiceInput(input)));
}

export async function updateTaskAction(
  taskId: string,
  input: TaskFormInput,
): Promise<TaskActionResult> {
  return run(async () => tasks.updateTask(await manageContext(), taskId, toServiceInput(input)));
}

export async function deleteTaskAction(taskId: string): Promise<TaskActionResult> {
  return run(async () => tasks.deleteTask(await manageContext(), taskId));
}

export async function copyTasksAction(sourceEventId: string): Promise<TaskActionResult> {
  return run(async () => tasks.copyTasksFromEvent(await manageContext(), sourceEventId));
}
