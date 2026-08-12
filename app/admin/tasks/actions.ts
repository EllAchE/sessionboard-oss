'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability, type EventContext } from '@/lib/context';
import { isAppError } from '@/lib/errors';
import { currentEventContext } from '@/lib/services/events';
import * as tasks from '@/lib/services/tasks';

/**
 * Thin, like the rest of `/admin`: the rules about what a task may be live in
 * `lib/services/tasks.ts`, and these only resolve the event and translate a thrown `AppError`.
 */

export type TaskActionResult = { ok: true } | { ok: false; message: string };

export type TaskFormInput = {
  name: string;
  descriptionMarkdown: string;
  kind: tasks.TaskKind;
  audience: tasks.TaskAudience;
  dueAt: string;
  required: boolean;
  linkUrl: string;
  formId: string;
  reminderDaysBefore: string;
};

const PATH = '/admin/tasks';

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

/** The panel posts strings because that is what an input holds; parsing belongs on this side. */
function toServiceInput(input: TaskFormInput): tasks.TaskInput {
  const due = input.dueAt.trim() ? new Date(input.dueAt) : null;
  return {
    name: input.name,
    descriptionMarkdown: input.descriptionMarkdown,
    kind: input.kind,
    audience: input.audience,
    dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
    required: input.required,
    linkUrl: input.linkUrl,
    formId: input.formId || null,
    reminderDaysBefore: input.reminderDaysBefore
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((days) => Number.isFinite(days) && days > 0),
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
