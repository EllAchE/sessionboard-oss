'use server';

import { revalidatePath } from 'next/cache';
import { isAppError } from '../../../lib/errors';
import { renderMarkdown } from '../../../lib/markdown';
import { aiReviewEnabled, generateAiReview } from '../../../lib/ai/review';
import * as review from '../../../lib/services/review';
import { decideContext, reviewContext } from './context';
import type { ActionResult, AiReviewWire, ScoreWire } from './types';

/**
 * Thin by construction: resolve the context, call the service, translate a thrown `AppError`. Every
 * rule these actions appear to enforce lives in `lib/services/review.ts`, so a future REST surface
 * and these screens cannot drift apart.
 */

async function run<T>(work: () => Promise<T>, path = '/admin/submissions'): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidatePath(path);
    return { ok: true, data };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message, details: error.details };
    console.error(`review action failed: ${String(error)}`);
    return { ok: false, message: 'Something went wrong. Try again.' };
  }
}

export async function saveScorecardAction(input: {
  roundId: string;
  submissionId: string;
  scores: ScoreWire[];
  comment?: string | null;
  complete?: boolean;
}): Promise<ActionResult<{ average: number | null; complete: boolean }>> {
  return run(async () => {
    const ctx = await reviewContext();
    const result = await review.saveScorecard(ctx, input);
    return { average: result.aggregate.average, complete: result.aggregate.complete };
  }, `/admin/submissions/${input.submissionId}`);
}

export async function decideAction(
  submissionIds: string[],
  decision: review.Decision,
  note?: string | null,
): Promise<ActionResult<review.DecisionResult>> {
  return run(async () => {
    const ctx = await decideContext();
    return review.decideSubmissions(ctx, submissionIds, decision, note);
  });
}

export async function createRoundAction(input: {
  name: string;
  blindUntilClose?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await decideContext();
    const created = await review.createRound(ctx, { ...input, status: 'open' });
    return { id: created.id };
  }, '/admin/submissions/rounds');
}

export async function updateRoundAction(
  roundId: string,
  patch: review.RoundPatch,
): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.updateRound(ctx, roundId, patch);
    return null;
  }, '/admin/submissions/rounds');
}

export async function deleteRoundAction(roundId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.deleteRound(ctx, roundId);
    return null;
  }, '/admin/submissions/rounds');
}

export async function addCriterionAction(
  roundId: string,
  input: review.CriterionInput,
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await decideContext();
    const created = await review.addCriterion(ctx, roundId, input);
    return { id: created.id };
  }, '/admin/submissions/rounds');
}

export async function updateCriterionAction(
  criterionId: string,
  patch: Partial<review.CriterionInput>,
): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.updateCriterion(ctx, criterionId, patch);
    return null;
  }, '/admin/submissions/rounds');
}

export async function deleteCriterionAction(criterionId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.deleteCriterion(ctx, criterionId);
    return null;
  }, '/admin/submissions/rounds');
}

export async function autoAssignAction(
  roundId: string,
  input: review.AutoAssignInput,
): Promise<ActionResult<{ created: number }>> {
  return run(async () => {
    const ctx = await decideContext();
    const created = await review.autoAssignRound(ctx, roundId, input);
    return { created };
  }, '/admin/submissions/rounds');
}

export async function assignOneAction(
  roundId: string,
  submissionId: string,
  reviewerUserId: string,
): Promise<ActionResult<{ created: number }>> {
  return run(async () => {
    const ctx = await decideContext();
    const created = await review.assignReviewers(ctx, roundId, [{ submissionId, reviewerUserId }]);
    return { created };
  }, `/admin/submissions/${submissionId}`);
}

export async function unassignAction(assignmentId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await decideContext();
    await review.unassignReviewer(ctx, assignmentId);
    return null;
  });
}

export async function createSubmissionAction(
  input: review.NewSubmissionInput,
): Promise<ActionResult<{ id: string; displayRef: string }>> {
  return run(async () => {
    const ctx = await decideContext();
    return review.createSubmissionAsOrganizer(ctx, input);
  });
}

export async function importSubmissionsAction(
  formId: string,
  csv: string,
): Promise<ActionResult<{ created: number; failed: Array<{ title: string; message: string }>; errors: Array<{ line: number; message: string }> }>> {
  return run(async () => {
    const ctx = await decideContext();
    const parsed = review.parseSubmissionImport(csv);
    if (parsed.rows.length === 0) {
      return { created: 0, failed: [], errors: parsed.errors };
    }
    const result = await review.importSubmissions(ctx, formId, parsed.rows);
    return { ...result, errors: parsed.errors };
  }, '/admin/submissions/import');
}

export async function saveViewAction(
  name: string,
  filters: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await reviewContext();
    const created = await review.saveView(ctx, name, filters);
    return { id: created.id };
  });
}

export async function deleteViewAction(viewId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await reviewContext();
    await review.deleteSavedView(ctx, viewId);
    return null;
  });
}

/**
 * `V-9`. The model scores; nothing here decides. The result is stored in `ai_review` and returned
 * for display beside the organizer's own scorecard, labeled as a suggestion.
 */
export async function generateAiReviewAction(
  submissionId: string,
  roundId: string | null,
): Promise<ActionResult<AiReviewWire>> {
  return run(async () => {
    if (!aiReviewEnabled()) {
      throw new Error('AI review is not configured');
    }
    const ctx = await reviewContext();
    const subject = await review.loadAiReviewSubject(ctx, submissionId, roundId);
    const result = await generateAiReview(subject);
    const saved = await review.saveAiReview(ctx, {
      submissionId,
      reviewRoundId: subject.roundId,
      model: result.model,
      rationaleMarkdown: result.rationaleMarkdown,
      criterionScores: result.criterionScores,
    });
    return {
      id: saved.id,
      model: saved.model,
      rationaleHtml: renderMarkdown(saved.rationaleMarkdown),
      criterionScores: saved.criterionScores,
      createdAt: saved.createdAt.toISOString(),
    };
  }, `/admin/submissions/${submissionId}`);
}
