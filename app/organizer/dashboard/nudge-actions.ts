'use server';

import { revalidatePath } from 'next/cache';
import { requireCapability, type EventContext } from '@/lib/context';
import { isAppError } from '@/lib/errors';
import { currentEventContext } from '@/lib/services/events';
import {
  draftTaskNudge,
  sendTaskNudge,
  type TaskNudgeDraft,
  type TaskNudgeSendResult,
} from '@/lib/services/task-nudge';

/**
 * Assisted chasing, wired the way every other write in `/organizer` is: the client calls a Server
 * Action which calls the service directly. It does not fetch `/api/v1` — the UI never calls its
 * own HTTP API, because then there would be two implementations of the "a human read this before
 * it went out" rule and only one of them would stay correct.
 */

export type NudgeActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function sendableContext(): Promise<EventContext> {
  const ctx = await currentEventContext();
  requireCapability(ctx, 'comms:send');
  return ctx;
}

/** Never throws into the error boundary: the organizer may have just typed a paragraph. */
function fail(error: unknown): { ok: false; message: string } {
  if (isAppError(error)) return { ok: false, message: error.message };
  console.error(`nudge action failed: ${String(error)}`);
  return { ok: false, message: 'Something went wrong. Try again.' };
}

/**
 * Compose or re-render a draft. Called once when the composer opens, and again after every edit,
 * because the rendered text it returns is what the send action demands back.
 */
export async function draftNudgeAction(input: {
  assignmentId: string;
  subject?: string;
  bodyMarkdown?: string;
}): Promise<NudgeActionResult<TaskNudgeDraft>> {
  try {
    return { ok: true, data: await draftTaskNudge(await sendableContext(), input) };
  } catch (error) {
    return fail(error);
  }
}

export async function sendNudgeAction(input: {
  assignmentId: string;
  subject: string;
  bodyMarkdown: string;
  reviewedRecipientEmail: string;
  reviewedSubject: string;
  reviewedBodyText: string;
}): Promise<NudgeActionResult<TaskNudgeSendResult>> {
  try {
    const result = await sendTaskNudge(await sendableContext(), input);
    revalidatePath('/organizer');
    revalidatePath('/organizer/tasks');
    revalidatePath('/organizer/mail');
    return { ok: true, data: result };
  } catch (error) {
    return fail(error);
  }
}
