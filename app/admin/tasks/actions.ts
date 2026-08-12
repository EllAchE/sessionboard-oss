'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '@/lib/errors';
import { currentEventContext } from '@/lib/services/events';
import { createTask, type CreateTaskInput } from '@/lib/services/tasks';

/**
 * Thin, like every other `/admin` action: resolve the event, call the service, translate a thrown
 * `AppError` into something the dialog can put under a field. The permission check and every rule
 * about what a task may be live in `lib/services/tasks.ts`.
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };

export type NewTaskInput = {
  name: string;
  description: string;
  requiresFile: boolean;
  audience: CreateTaskInput['audience'];
  required: boolean;
  /** Empty string means no deadline. */
  dueAt: string;
};

export async function createTaskAction(input: NewTaskInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await currentEventContext();
    const created = await createTask(ctx, {
      name: input.name,
      description: input.description,
      requiresFile: input.requiresFile,
      audience: input.audience,
      required: input.required,
      dueAt: input.dueAt.trim() ? new Date(input.dueAt) : null,
    });
    revalidatePath('/admin/tasks');
    revalidatePath('/admin');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`create task action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}
