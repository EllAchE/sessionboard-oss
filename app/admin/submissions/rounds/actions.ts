'use server';

import { revalidatePath } from 'next/cache';
import { magicLinkMayBeShown } from '../../../../lib/auth';
import { isAppError } from '../../../../lib/errors';
import { parseRoundDate } from '../../../../lib/review-round-dates';
import * as review from '../../../../lib/services/review';
import { decideContext } from '../context';
import type { ActionResult } from '../types';
import { inviteDelivery, type InviteDelivery } from './invite-delivery';

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

export type ReviewerInviteOutcome = {
  reviewer: review.ReviewerInviteResult['reviewer'];
  accessLink: string | null;
  delivery: InviteDelivery;
};

/**
 * Grants reviewer access and mails the link. Whether that link *also* comes back to the organizer
 * is decided by `lib/demo-access.ts` through `magicLinkMayBeShown` — the same single predicate the
 * sign-in page uses, so this surface cannot drift from it again.
 *
 * This used to read `activeTransportName() === 'log' || !invited.delivered`. The second clause was
 * a privilege escalation: `inviteReviewer` binds to an *existing* account when one already holds
 * the address, so an organizer who typed any real user's email and got a bounce received a working
 * magic link — a session as that person, carrying whatever access they hold on other events. A
 * failed send is now never a condition for revealing anything; it only changes the wording, and
 * the organizer is offered a re-send instead.
 */
export async function inviteReviewerAction(
  input: review.ReviewerInviteInput,
): Promise<ActionResult<ReviewerInviteOutcome>> {
  return run(async () => {
    const ctx = await decideContext();
    const invited = await review.inviteReviewer(ctx, input);
    const visibility = await magicLinkMayBeShown(invited.reviewer.email);
    return {
      reviewer: invited.reviewer,
      accessLink: visibility ? invited.link : null,
      delivery: inviteDelivery(visibility, invited.delivered),
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

/**
 * Frees a declined or stale assignment so the round can be topped up by auto-assign. It does not
 * touch the recusal — the reviewer who stepped back stays off that submission, and `ABS-12` is the
 * whole reason those two are separate clicks now.
 */
export async function releaseAssignmentAction(assignmentId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.unassignReviewer(ctx, assignmentId);
    return null;
  });
}

/**
 * `ABS-12`. The deliberate undo: this reviewer may be handed this submission again. Recorded as a
 * released recusal rather than a deleted one, so the decision sticks and is visible as a decision.
 */
export async function clearRecusalAction(recusalId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.clearRecusal(ctx, recusalId);
    return null;
  });
}
