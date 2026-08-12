'use server';

import { revalidatePath } from 'next/cache';
import { isAppError, unauthorized } from '@/lib/errors';
import * as review from '@/lib/services/review';
import { reviewerSession } from './context';
import type { ActionResult, ScoreWire } from './types';

/**
 * The reviewer's two writes. Both resolve the same session the pages do and hand straight to the
 * service; the capability checks and the recusal rule live there, so this file adds no policy.
 */

async function run<T>(work: () => Promise<T>, path = '/review'): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(path, 'layout');
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message };
    console.error(`reviewer action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

async function requireSession() {
  const session = await reviewerSession();
  if (!session) throw unauthorized('Sign in as a reviewer to continue');
  return session;
}

export async function saveMyScorecardAction(input: {
  roundId: string;
  submissionId: string;
  scores: ScoreWire[];
  comment?: string | null;
  complete?: boolean;
}): Promise<ActionResult<{ average: number | null; complete: boolean }>> {
  return run(async () => {
    const { ctx } = await requireSession();
    const result = await review.saveScorecard(ctx, input);
    return { average: result.aggregate.average, complete: result.aggregate.complete };
  });
}

export async function recuseAction(
  assignmentId: string,
  reason?: string | null,
): Promise<ActionResult> {
  return run(async () => {
    const { ctx } = await requireSession();
    await review.declineAssignment(ctx, assignmentId, reason ?? null);
    return null;
  });
}
