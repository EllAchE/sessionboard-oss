'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '../../../../lib/errors';
import { activeTransportName } from '../../../../lib/mail';
import { parseRoundDate } from '../../../../lib/review-round-dates';
import * as review from '../../../../lib/services/review';
import { decideContext } from '../context';
import type { ActionResult } from '../types';

/**
 * Round configuration writes. Same shape as the queue's actions: resolve the context, call the
 * service, translate a thrown `AppError`.
 */

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath('/admin/submissions/rounds');
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`round action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

export async function createRoundAction(input: {
  name: string;
  blindUntilClose?: boolean;
  anonymized?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await decideContext();
    const created = await review.createRound(ctx, {
      ...input,
      status: 'open',
      opensAt: parseRoundDate(input.opensAt, 'opensAt'),
      closesAt: parseRoundDate(input.closesAt, 'closesAt'),
    });
    return { id: created.id };
  });
}

export async function inviteReviewerAction(input: review.ReviewerInviteInput): Promise<
  ActionResult<{
    reviewer: review.ReviewerInviteResult['reviewer'];
    accessLink: string | null;
  }>
> {
  return run(async () => {
    const ctx = await decideContext();
    const invited = await review.inviteReviewer(ctx, input);
    return {
      reviewer: invited.reviewer,
      accessLink: activeTransportName() === 'log' || !invited.delivered ? invited.link : null,
    };
  });
}

/** `ABS-08`: one nudge per reviewer with pending assignments, recorded in `email_log`. */
export async function remindReviewersAction(
  roundId: string,
  options: { reviewerUserIds?: string[]; note?: string | null } = {},
): Promise<ActionResult<review.ReminderOutcome>> {
  return run(async () => {
    const ctx = await decideContext();
    return review.remindOutstandingReviewers(ctx, roundId, options);
  });
}

/** Frees a declined or stale assignment so the round can be topped up by auto-assign. */
export async function releaseAssignmentAction(assignmentId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.unassignReviewer(ctx, assignmentId);
    return null;
  });
}
