import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  aiReview,
  event,
  file,
  formField,
  membership,
  participant,
  participantRole,
  reviewAssignment,
  reviewRound,
  savedView,
  score as scoreTable,
  scorecardCriterion,
  sessionFormat,
  submission,
  submissionTag,
  tag as tagTable,
  track as trackTable,
  user,
} from '../../db/schema';
import { ensureUserAccount, grantRole, requestMagicLink } from '../auth';
import type { EventContext } from '../context';
import { can, requireCapability } from '../context';
import { toCsv } from '../csv';
import { appUrl } from '../env';
import { conflict, forbidden, invalid, notFound } from '../errors';
import { formatRef, slugify } from '../ids';
import { sendMail } from '../mail';
import { markdownToText, renderMarkdown } from '../markdown';
import { parseSpeakerName } from '../speaker-name';
import { assertRoundDateOrder } from '../review-round-dates';
import { weightedScore } from '../review-scoring';
import { loadCommsContext, wrapInBranding } from './comms';
import { ensureParticipant, linkPrimarySpeaker } from './submissions';

/**
 * `V-1`–`V-12`. The review half of the admin: the queue, the scorecard, rounds and assignment, and
 * the decision that makes a submission eligible for the agenda. Pure TypeScript throughout — the
 * pages and Server Actions above it only resolve an `EventContext` and translate errors.
 */

// ---------------------------------------------------------------------------
// Scoring arithmetic — pure, and the part everything downstream trusts
// ---------------------------------------------------------------------------

/** Every average is reported on the same 1–5 scale the stars render, whatever a criterion's max. */
export const SCORE_SCALE = 5;

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'declined'
  | 'waitlisted'
  | 'withdrawn';

export type AssignmentStatus = 'pending' | 'completed' | 'declined';

export type CriterionSpec = {
  id: string;
  label: string;
  description: string | null;
  weight: number;
  maxScore: number;
  position: number;
};

export type ScoreValue = { criterionId: string; value: number };

export type ScoreAggregate = {
  /** Weighted mean rescaled to 1–5, or null when nothing on this scorecard has been scored. */
  average: number | null;
  /** The same number as a 0–1 fraction of the achievable maximum. */
  fraction: number | null;
  scoredCount: number;
  criterionCount: number;
  complete: boolean;
  weightScored: number;
  weightTotal: number;
};

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Weighted across criteria and renormalised over the criteria actually scored, which is the whole
 * subtlety: a reviewer who scored 5 on the one criterion they filled in has an average of 5, not a
 * 5 diluted by zeroes for the ones they skipped. Weight and max are per criterion, so each score
 * contributes `weight × value/max` and the divisor is the weight that was answered, never the total.
 */
export function aggregateScorecard(
  criteria: CriterionSpec[],
  scores: ScoreValue[],
): ScoreAggregate {
  const result = weightedScore(criteria, scores);
  const answered = new Set(result.answeredIds);
  const weightTotal = criteria.reduce((sum, criterion) => sum + Math.max(0, criterion.weight), 0);

  return {
    average: result.average,
    fraction: result.fraction,
    scoredCount: answered.size,
    criterionCount: criteria.length,
    complete: criteria.length > 0 && criteria.every((criterion) => answered.has(criterion.id)),
    weightScored: result.weightScored,
    weightTotal,
  };
}

export type ReviewerScorecard = {
  assignmentId: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerEmail: string;
  status: AssignmentStatus;
  comment: string | null;
  completedAt: Date | null;
  scores: ScoreValue[];
};

export type ReviewerAverage = {
  assignmentId: string;
  reviewerUserId: string;
  reviewerName: string;
  status: AssignmentStatus;
  aggregate: ScoreAggregate;
};

export type ReviewSummary = {
  /** Mean of the per-reviewer averages: one reviewer, one vote, however many criteria they filled. */
  average: number | null;
  assignedCount: number;
  completedCount: number;
  scoredCount: number;
  /** High minus low across reviewers — the disagreement an organizer wants surfaced. */
  spread: number | null;
  perReviewer: ReviewerAverage[];
};

export function summarizeReviews(
  criteria: CriterionSpec[],
  reviewers: ReviewerScorecard[],
): ReviewSummary {
  const perReviewer = reviewers.map((reviewer) => ({
    assignmentId: reviewer.assignmentId,
    reviewerUserId: reviewer.reviewerUserId,
    reviewerName: reviewer.reviewerName,
    status: reviewer.status,
    aggregate: aggregateScorecard(criteria, reviewer.scores),
  }));

  const averages = perReviewer
    .map((entry) => entry.aggregate.average)
    .filter((value): value is number => value !== null);

  return {
    average:
      averages.length > 0
        ? round(averages.reduce((sum, value) => sum + value, 0) / averages.length, 2)
        : null,
    assignedCount: reviewers.length,
    completedCount: reviewers.filter((reviewer) => reviewer.status === 'completed').length,
    scoredCount: averages.length,
    spread: averages.length > 1 ? round(Math.max(...averages) - Math.min(...averages), 2) : null,
    perReviewer,
  };
}

// ---------------------------------------------------------------------------
// Decisions — `V-2`, `V-7`
// ---------------------------------------------------------------------------

export type Decision = 'accept' | 'decline' | 'waitlist' | 'reset';

export const DECISION_LABEL: Record<Decision, string> = {
  accept: 'Accepted',
  decline: 'Declined',
  waitlist: 'Waitlisted',
  reset: 'Back to review',
};

const DECISION_STATUS: Record<Decision, SubmissionStatus> = {
  accept: 'accepted',
  decline: 'declined',
  waitlist: 'waitlisted',
  reset: 'under_review',
};

/**
 * A decision is only meaningful on a submission that was actually submitted. A draft was never sent
 * and a withdrawn talk was pulled by its speaker; deciding either would put a row on the agenda's
 * eligibility list that no one ever offered.
 */
export function nextStatusForDecision(
  current: SubmissionStatus,
  decision: Decision,
): SubmissionStatus {
  if (current === 'draft') throw conflict('That submission is still a draft');
  if (current === 'withdrawn') throw conflict('That submission was withdrawn by its speaker');
  return DECISION_STATUS[decision];
}

/** `A-5` reads this: only an accepted submission is eligible for a schedule slot. */
export function isAgendaEligible(status: SubmissionStatus): boolean {
  return status === 'accepted';
}

// ---------------------------------------------------------------------------
// Assignment planning — `V-5`
// ---------------------------------------------------------------------------

export type AssignmentPair = { submissionId: string; reviewerUserId: string };

/**
 * Balanced round-robin: each submission is topped up to `reviewersPerSubmission` by repeatedly
 * taking the least-loaded reviewer who is not already on it. Existing assignments count towards the
 * load so a second pass after new submissions arrive does not pile everything on one person.
 */
export function planAssignments(
  submissionIds: string[],
  reviewerUserIds: string[],
  reviewersPerSubmission: number,
  existing: AssignmentPair[] = [],
): AssignmentPair[] {
  if (reviewerUserIds.length === 0 || submissionIds.length === 0) return [];
  const perSubmission = Math.max(1, Math.min(reviewerUserIds.length, reviewersPerSubmission));

  const load = new Map(reviewerUserIds.map((reviewerUserId) => [reviewerUserId, 0]));
  const assigned = new Map<string, Set<string>>();
  for (const pair of existing) {
    load.set(pair.reviewerUserId, (load.get(pair.reviewerUserId) ?? 0) + 1);
    const set = assigned.get(pair.submissionId) ?? new Set<string>();
    set.add(pair.reviewerUserId);
    assigned.set(pair.submissionId, set);
  }

  const planned: AssignmentPair[] = [];
  for (const submissionId of submissionIds) {
    const already = assigned.get(submissionId) ?? new Set<string>();
    while (already.size < perSubmission) {
      const candidate = reviewerUserIds
        .filter((reviewerUserId) => !already.has(reviewerUserId))
        .sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
      if (!candidate) break;
      already.add(candidate);
      load.set(candidate, (load.get(candidate) ?? 0) + 1);
      planned.push({ submissionId, reviewerUserId: candidate });
    }
    assigned.set(submissionId, already);
  }
  return planned;
}

// ---------------------------------------------------------------------------
// Rounds and criteria — `V-4`, `V-5`
// ---------------------------------------------------------------------------

export type ReviewRoundRecord = {
  id: string;
  name: string;
  position: number;
  status: 'draft' | 'open' | 'closed';
  blindUntilClose: boolean;
  /** Reviewers score without an author attached; organizers still see one. */
  anonymized: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
};

export type RoundDetail = ReviewRoundRecord & {
  criteria: CriterionSpec[];
  assignedCount: number;
  completedCount: number;
};

/** What a fresh event gets so the scorecard is never an empty screen on the first submission. */
export const DEFAULT_CRITERIA: Array<Omit<CriterionSpec, 'id'>> = [
  {
    label: 'Relevance',
    description: 'Fit with the track and the audience this event is for.',
    weight: 2,
    maxScore: 5,
    position: 0,
  },
  {
    label: 'Originality',
    description: 'Says something the audience has not already heard three times.',
    weight: 1,
    maxScore: 5,
    position: 1,
  },
  {
    label: 'Speaker readiness',
    description: 'Evidence this speaker can deliver the talk they described.',
    weight: 1,
    maxScore: 5,
    position: 2,
  },
];

function toRoundRecord(row: typeof reviewRound.$inferSelect): ReviewRoundRecord {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    status: row.status,
    blindUntilClose: row.blindUntilClose,
    anonymized: row.anonymized,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
  };
}

function toCriterionSpec(row: typeof scorecardCriterion.$inferSelect): CriterionSpec {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    weight: row.weight,
    maxScore: row.maxScore,
    position: row.position,
  };
}

export async function listRounds(ctx: EventContext): Promise<ReviewRoundRecord[]> {
  requireCapability(ctx, 'submission:review');
  const rows = await getDb()
    .select()
    .from(reviewRound)
    .where(eq(reviewRound.eventId, ctx.eventId))
    .orderBy(asc(reviewRound.position), asc(reviewRound.createdAt));
  return rows.map(toRoundRecord);
}

export async function listCriteria(roundId: string): Promise<CriterionSpec[]> {
  const rows = await getDb()
    .select()
    .from(scorecardCriterion)
    .where(eq(scorecardCriterion.reviewRoundId, roundId))
    .orderBy(asc(scorecardCriterion.position));
  return rows.map(toCriterionSpec);
}

/**
 * The round a surface should show when the URL names none: the first open round, else the newest.
 * Creating the default round here rather than in a seed keeps a cold event usable (`D-3`).
 */
export async function resolveRound(
  ctx: EventContext,
  roundId?: string | null,
): Promise<ReviewRoundRecord | null> {
  const rounds = await listRounds(ctx);
  if (roundId) {
    const named = rounds.find((round) => round.id === roundId);
    if (!named) throw notFound('That review round');
    return named;
  }
  return rounds.find((round) => round.status === 'open') ?? rounds[rounds.length - 1] ?? null;
}

export async function ensureDefaultRound(ctx: EventContext): Promise<ReviewRoundRecord> {
  const existing = await resolveRound(ctx);
  if (existing) return existing;
  return createRound(ctx, { name: 'Round 1', status: 'open' });
}

export type CreateRoundInput = {
  name: string;
  status?: 'draft' | 'open' | 'closed';
  blindUntilClose?: boolean;
  anonymized?: boolean;
  opensAt?: Date | null;
  closesAt?: Date | null;
  /** Omitted means the default scorecard; an explicit empty array means no criteria. */
  criteria?: Array<Omit<CriterionSpec, 'id'>>;
};

export async function createRound(
  ctx: EventContext,
  input: CreateRoundInput,
): Promise<ReviewRoundRecord> {
  requireCapability(ctx, 'submission:decide');
  const name = input.name.trim();
  if (!name) throw invalid('A round needs a name', { name: 'Name is required' });
  assertRoundDateOrder(input.opensAt, input.closesAt);

  const db = getDb();
  const existing = await listRounds(ctx);

  const [created] = await db
    .insert(reviewRound)
    .values({
      eventId: ctx.eventId,
      name,
      position: existing.length,
      status: input.status ?? 'draft',
      blindUntilClose: input.blindUntilClose ?? true,
      anonymized: input.anonymized ?? false,
      opensAt: input.opensAt ?? null,
      closesAt: input.closesAt ?? null,
    })
    .returning();

  const criteria = input.criteria ?? DEFAULT_CRITERIA;
  if (criteria.length > 0) {
    await db.insert(scorecardCriterion).values(
      criteria.map((criterion, index) => ({
        reviewRoundId: created.id,
        label: criterion.label,
        description: criterion.description ?? null,
        weight: criterion.weight,
        maxScore: criterion.maxScore,
        position: criterion.position ?? index,
      })),
    );
  }

  return toRoundRecord(created);
}

export type RoundPatch = {
  name?: string;
  status?: 'draft' | 'open' | 'closed';
  blindUntilClose?: boolean;
  anonymized?: boolean;
  opensAt?: Date | null;
  closesAt?: Date | null;
};

export async function updateRound(
  ctx: EventContext,
  roundId: string,
  patch: RoundPatch,
): Promise<ReviewRoundRecord> {
  requireCapability(ctx, 'submission:decide');
  const existing = await requireRound(ctx, roundId);

  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw invalid('A round needs a name', { name: 'Name is required' });
    values.name = name;
  }
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.blindUntilClose !== undefined) values.blindUntilClose = patch.blindUntilClose;
  if (patch.anonymized !== undefined) values.anonymized = patch.anonymized;
  if (patch.opensAt !== undefined) values.opensAt = patch.opensAt;
  if (patch.closesAt !== undefined) values.closesAt = patch.closesAt;

  const opensAt = patch.opensAt !== undefined ? patch.opensAt : existing.opensAt;
  const closesAt = patch.closesAt !== undefined ? patch.closesAt : existing.closesAt;
  assertRoundDateOrder(opensAt, closesAt);

  if (Object.keys(values).length === 0) return existing;

  const [updated] = await getDb()
    .update(reviewRound)
    .set(values)
    .where(eq(reviewRound.id, roundId))
    .returning();
  return toRoundRecord(updated);
}

export async function deleteRound(ctx: EventContext, roundId: string): Promise<void> {
  requireCapability(ctx, 'submission:decide');
  await requireRound(ctx, roundId);
  await getDb().delete(reviewRound).where(eq(reviewRound.id, roundId));
}

async function requireRound(ctx: EventContext, roundId: string): Promise<ReviewRoundRecord> {
  const row = await getDb().query.reviewRound.findFirst({
    where: and(eq(reviewRound.id, roundId), eq(reviewRound.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That review round');
  return toRoundRecord(row);
}

export type CriterionInput = {
  label: string;
  description?: string | null;
  weight?: number;
  maxScore?: number;
};

export async function addCriterion(
  ctx: EventContext,
  roundId: string,
  input: CriterionInput,
): Promise<CriterionSpec> {
  requireCapability(ctx, 'submission:decide');
  await requireRound(ctx, roundId);
  const label = input.label.trim();
  if (!label) throw invalid('A criterion needs a label', { label: 'Label is required' });

  const existing = await listCriteria(roundId);
  const [created] = await getDb()
    .insert(scorecardCriterion)
    .values({
      reviewRoundId: roundId,
      label,
      description: input.description?.trim() || null,
      weight: clampWeight(input.weight ?? 1),
      maxScore: clampMax(input.maxScore ?? SCORE_SCALE),
      position: existing.length,
    })
    .returning();
  return toCriterionSpec(created);
}

export async function updateCriterion(
  ctx: EventContext,
  criterionId: string,
  patch: Partial<CriterionInput> & { position?: number },
): Promise<CriterionSpec> {
  requireCapability(ctx, 'submission:decide');
  await requireCriterion(ctx, criterionId);

  const values: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw invalid('A criterion needs a label', { label: 'Label is required' });
    values.label = label;
  }
  if (patch.description !== undefined) values.description = patch.description?.trim() || null;
  if (patch.weight !== undefined) values.weight = clampWeight(patch.weight);
  if (patch.maxScore !== undefined) values.maxScore = clampMax(patch.maxScore);
  if (patch.position !== undefined) values.position = patch.position;

  const [updated] = await getDb()
    .update(scorecardCriterion)
    .set(values)
    .where(eq(scorecardCriterion.id, criterionId))
    .returning();
  return toCriterionSpec(updated);
}

export async function deleteCriterion(ctx: EventContext, criterionId: string): Promise<void> {
  requireCapability(ctx, 'submission:decide');
  await requireCriterion(ctx, criterionId);
  await getDb().delete(scorecardCriterion).where(eq(scorecardCriterion.id, criterionId));
}

async function requireCriterion(ctx: EventContext, criterionId: string): Promise<CriterionSpec> {
  const rows = await getDb()
    .select({ criterion: scorecardCriterion })
    .from(scorecardCriterion)
    .innerJoin(reviewRound, eq(reviewRound.id, scorecardCriterion.reviewRoundId))
    .where(and(eq(scorecardCriterion.id, criterionId), eq(reviewRound.eventId, ctx.eventId)));
  if (rows.length === 0) throw notFound('That criterion');
  return toCriterionSpec(rows[0].criterion);
}

function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 1;
  return Math.max(0, Math.min(10, Math.round(weight)));
}

function clampMax(maxScore: number): number {
  if (!Number.isFinite(maxScore)) return SCORE_SCALE;
  return Math.max(2, Math.min(10, Math.round(maxScore)));
}

// ---------------------------------------------------------------------------
// Reviewers and assignment
// ---------------------------------------------------------------------------

export type ReviewerRow = {
  userId: string;
  name: string;
  email: string;
  roles: string[];
};

export type ReviewerInviteInput = {
  email: string;
  name?: string | null;
};

export type ReviewerInviteResult = {
  reviewer: Omit<ReviewerRow, 'roles'>;
  link: string;
  delivered: boolean;
};

export async function inviteReviewer(
  ctx: EventContext,
  input: ReviewerInviteInput,
): Promise<ReviewerInviteResult> {
  requireCapability(ctx, 'submission:decide');
  const name = input.name?.trim() || null;
  const account = await ensureUserAccount(input.email, name);
  await grantRole(account.id, ctx.eventId, 'reviewer');
  const invite = await requestMagicLink({
    email: account.email,
    name: account.name,
    eventId: ctx.eventId,
    redirectTo: '/review',
  });

  return {
    reviewer: {
      userId: account.id,
      name: account.name ?? account.email,
      email: account.email,
    },
    link: invite.link,
    delivered: invite.delivered,
  };
}

export async function listReviewers(ctx: EventContext): Promise<ReviewerRow[]> {
  requireCapability(ctx, 'submission:review');
  const rows = await getDb()
    .select({ userId: user.id, name: user.name, email: user.email, role: membership.role })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(
      and(
        eq(membership.eventId, ctx.eventId),
        inArray(membership.role, ['organizer', 'reviewer'] as const),
      ),
    );

  const byUser = new Map<string, ReviewerRow>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) {
      existing.roles.push(row.role);
      continue;
    }
    byUser.set(row.userId, {
      userId: row.userId,
      name: row.name ?? row.email,
      email: row.email,
      roles: [row.role],
    });
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function assignReviewers(
  ctx: EventContext,
  roundId: string,
  pairs: AssignmentPair[],
): Promise<number> {
  requireCapability(ctx, 'submission:decide');
  await requireRound(ctx, roundId);
  if (pairs.length === 0) return 0;

  const inserted = await getDb()
    .insert(reviewAssignment)
    .values(
      pairs.map((pair) => ({
        reviewRoundId: roundId,
        submissionId: pair.submissionId,
        reviewerUserId: pair.reviewerUserId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: reviewAssignment.id });
  return inserted.length;
}

export type AutoAssignInput = {
  submissionIds: string[];
  reviewerUserIds: string[];
  reviewersPerSubmission: number;
};

export async function autoAssignRound(
  ctx: EventContext,
  roundId: string,
  input: AutoAssignInput,
): Promise<number> {
  requireCapability(ctx, 'submission:decide');
  await requireRound(ctx, roundId);

  const existing = await getDb()
    .select({
      submissionId: reviewAssignment.submissionId,
      reviewerUserId: reviewAssignment.reviewerUserId,
    })
    .from(reviewAssignment)
    .where(eq(reviewAssignment.reviewRoundId, roundId));

  const planned = planAssignments(
    input.submissionIds,
    input.reviewerUserIds,
    input.reviewersPerSubmission,
    existing,
  );
  return assignReviewers(ctx, roundId, planned);
}

export async function unassignReviewer(ctx: EventContext, assignmentId: string): Promise<void> {
  requireCapability(ctx, 'submission:decide');
  const assignment = await loadAssignment(ctx, assignmentId);
  await getDb().delete(reviewAssignment).where(eq(reviewAssignment.id, assignment.id));
}

async function loadAssignment(ctx: EventContext, assignmentId: string) {
  const rows = await getDb()
    .select({ assignment: reviewAssignment })
    .from(reviewAssignment)
    .innerJoin(reviewRound, eq(reviewRound.id, reviewAssignment.reviewRoundId))
    .where(and(eq(reviewAssignment.id, assignmentId), eq(reviewRound.eventId, ctx.eventId)));
  if (rows.length === 0) throw notFound('That review assignment');
  return rows[0].assignment;
}

// ---------------------------------------------------------------------------
// Scoring — `V-3`
// ---------------------------------------------------------------------------

export type SaveScorecardInput = {
  roundId: string;
  submissionId: string;
  scores: ScoreValue[];
  comment?: string | null;
  /** Marks the assignment complete. A partial save keeps it pending so the queue stays honest. */
  complete?: boolean;
};

/**
 * Scores are written against the acting reviewer's own assignment, never against someone else's. An
 * organizer scoring a submission they were not formally assigned gets an assignment created on the
 * spot: the alternative is a decision-maker who cannot record why they decided.
 */
export async function saveScorecard(
  ctx: EventContext,
  input: SaveScorecardInput,
): Promise<{ assignmentId: string; aggregate: ScoreAggregate }> {
  requireCapability(ctx, 'submission:review');
  const round = await requireRound(ctx, input.roundId);
  if (round.status === 'closed' && !can(ctx, 'submission:decide')) {
    throw conflict('That review round is closed');
  }

  const db = getDb();
  const target = await db.query.submission.findFirst({
    where: and(eq(submission.id, input.submissionId), eq(submission.eventId, ctx.eventId)),
  });
  if (!target) throw notFound('That submission');

  let assignment = await db.query.reviewAssignment.findFirst({
    where: and(
      eq(reviewAssignment.reviewRoundId, input.roundId),
      eq(reviewAssignment.submissionId, input.submissionId),
      eq(reviewAssignment.reviewerUserId, ctx.actor.userId),
    ),
  });

  if (!assignment) {
    if (!can(ctx, 'submission:decide')) {
      throw conflict('You are not assigned to review that submission');
    }
    const [created] = await db
      .insert(reviewAssignment)
      .values({
        reviewRoundId: input.roundId,
        submissionId: input.submissionId,
        reviewerUserId: ctx.actor.userId,
      })
      .onConflictDoNothing()
      .returning();
    assignment =
      created ??
      (await db.query.reviewAssignment.findFirst({
        where: and(
          eq(reviewAssignment.reviewRoundId, input.roundId),
          eq(reviewAssignment.submissionId, input.submissionId),
          eq(reviewAssignment.reviewerUserId, ctx.actor.userId),
        ),
      }));
    if (!assignment) throw notFound('That review assignment');
  }

  if (assignment.status === 'declined' && !can(ctx, 'submission:decide')) {
    throw conflict('You recused yourself from that submission');
  }

  const criteria = await listCriteria(input.roundId);
  const byId = new Map(criteria.map((criterion) => [criterion.id, criterion]));

  const clean = input.scores.filter((entry) => byId.has(entry.criterionId));
  for (const entry of clean) {
    const criterion = byId.get(entry.criterionId) as CriterionSpec;
    const value = Math.max(0, Math.min(criterion.maxScore, Math.round(entry.value)));
    await db
      .insert(scoreTable)
      .values({ reviewAssignmentId: assignment.id, criterionId: entry.criterionId, value })
      .onConflictDoUpdate({
        target: [scoreTable.reviewAssignmentId, scoreTable.criterionId],
        set: { value },
      });
  }

  const cleared = criteria
    .map((criterion) => criterion.id)
    .filter((id) => !clean.some((entry) => entry.criterionId === id));
  if (cleared.length > 0) {
    await db
      .delete(scoreTable)
      .where(
        and(
          eq(scoreTable.reviewAssignmentId, assignment.id),
          inArray(scoreTable.criterionId, cleared),
        ),
      );
  }

  const aggregate = aggregateScorecard(criteria, clean);

  /**
   * A review with nothing scored is not a review, and letting one complete puts a row in the
   * reviewer-progress count that says an opinion exists where none does. A partial scorecard still
   * completes on request: skipping one criterion is a judgment, skipping all of them is a misclick.
   */
  if (input.complete === true && criteria.length > 0 && aggregate.scoredCount === 0) {
    throw invalid('Score at least one criterion before submitting the review');
  }

  const completing = input.complete ?? aggregate.complete;

  await db
    .update(reviewAssignment)
    .set({
      comment: input.comment === undefined ? assignment.comment : (input.comment?.trim() || null),
      status: completing ? 'completed' : 'pending',
      completedAt: completing ? new Date() : null,
    })
    .where(eq(reviewAssignment.id, assignment.id));

  // A first score is what moves a submission out of the untouched pile.
  if (target.status === 'submitted') {
    await db
      .update(submission)
      .set({ status: 'under_review', updatedAt: new Date() })
      .where(eq(submission.id, target.id));
  }

  return { assignmentId: assignment.id, aggregate };
}

/**
 * `ABS-12`. A reviewer who knows the author, or the subject, or simply cannot get to it, takes
 * themselves off the assignment rather than leaving it pending forever. The row survives in
 * `declined` so the organizer can see the gap and reassign it; deleting it would make a recusal
 * indistinguishable from an assignment that was never made.
 */
export async function declineAssignment(
  ctx: EventContext,
  assignmentId: string,
  reason?: string | null,
): Promise<void> {
  requireCapability(ctx, 'submission:review');
  const assignment = await loadAssignment(ctx, assignmentId);
  if (assignment.reviewerUserId !== ctx.actor.userId && !can(ctx, 'submission:decide')) {
    throw conflict('That assignment belongs to another reviewer');
  }
  const trimmed = reason?.trim();
  await getDb()
    .update(reviewAssignment)
    .set({
      status: 'declined',
      completedAt: new Date(),
      comment: trimmed ? trimmed : assignment.comment,
    })
    .where(eq(reviewAssignment.id, assignment.id));
}

// ---------------------------------------------------------------------------
// Anonymized review — `ABS-07`
// ---------------------------------------------------------------------------

export const ANONYMOUS_AUTHOR = 'Anonymous author';

/**
 * The rule, stated once. An anonymized round hides the author from whoever is scoring; an organizer
 * keeps identity because acceptance decisions and conflict checks need a name attached. Every
 * surface that hands a submission to a reviewer asks this rather than deciding for itself, so a
 * route added later cannot quietly opt out of it.
 */
export function hidesAuthorship(
  round: Pick<ReviewRoundRecord, 'anonymized'> | null | undefined,
  ctx: EventContext,
): boolean {
  return Boolean(round?.anonymized) && !can(ctx, 'submission:decide');
}

/**
 * Form metadata that names or locates a human. Custom fields have no profile schema, so an
 * over-redacted field costs a reviewer some context while an under-redacted one defeats the round.
 */
const IDENTITY_WORDS = new Set([
  'affiliation',
  'author',
  'authors',
  'avatar',
  'bio',
  'biography',
  'bluesky',
  'company',
  'email',
  'employer',
  'firstname',
  'fullname',
  'github',
  'handle',
  'headshot',
  'homepage',
  'instagram',
  'job',
  'jobtitle',
  'lastname',
  'linkedin',
  'mail',
  'mastodon',
  'mobile',
  'name',
  'org',
  'organisation',
  'organization',
  'phone',
  'photo',
  'picture',
  'pronouns',
  'speaker',
  'speakers',
  'surname',
  'telephone',
  'twitter',
  'url',
  'website',
]);

export function carriesIdentity(fieldMetadata: string): boolean {
  return fieldMetadata
    .split(/[^a-zA-Z0-9]+/)
    .some((word) => IDENTITY_WORDS.has(word.toLowerCase()));
}

export function redactSubmitter<T extends { submitterName: string; submitterEmail: string }>(
  subject: T,
): T {
  return { ...subject, submitterName: ANONYMOUS_AUTHOR, submitterEmail: '' };
}

export type AuthoredSubject = {
  submitterName: string;
  submitterEmail: string;
  speakers: ReviewSpeaker[];
  answers: Record<string, unknown>;
  answerLabels: Record<string, string>;
};

export type ReviewAnswerField = Pick<
  typeof formField.$inferSelect,
  'key' | 'label' | 'type' | 'builtinKey'
>;

function answerCarriesIdentity(
  answerFields: Map<string, ReviewAnswerField>,
  key: string,
): boolean {
  const field = answerFields.get(key);
  return (
    carriesIdentity(key) ||
    field?.type === 'email' ||
    carriesIdentity(field?.label ?? '') ||
    carriesIdentity(field?.builtinKey ?? '')
  );
}

/**
 * Strips every handle on the author: the submitter, each speaker's name, address, affiliation and
 * bio, the participant ids that would let an adjacent route re-resolve them, and any questionnaire
 * field whose stored key or human-facing metadata identifies a person.
 */
export function redactAuthorship<T extends AuthoredSubject>(
  subject: T,
  fields: ReviewAnswerField[],
): T {
  const many = subject.speakers.length > 1;
  const answerFields = new Map(fields.map((field) => [field.key, field]));
  const visibleAnswers = Object.entries(subject.answers).filter(
    ([key]) => !answerCarriesIdentity(answerFields, key),
  );
  const visibleLabels = Object.entries(subject.answerLabels).filter(
    ([key]) => !answerCarriesIdentity(answerFields, key),
  );
  return {
    ...redactSubmitter(subject),
    speakers: subject.speakers.map((speaker, index) => ({
      ...speaker,
      participantId: `anonymous-${index}`,
      name: many ? `${ANONYMOUS_AUTHOR} ${index + 1}` : ANONYMOUS_AUTHOR,
      email: '',
      jobTitle: null,
      company: null,
      bioMarkdown: null,
    })),
    answers: Object.fromEntries(visibleAnswers),
    answerLabels: Object.fromEntries(visibleLabels),
  };
}

// ---------------------------------------------------------------------------
// The queue — `V-1`, `V-6`
// ---------------------------------------------------------------------------

export type QueueFilters = {
  /** Empty means every status except drafts, which live behind their own tab. */
  statuses?: SubmissionStatus[];
  trackId?: string | null;
  formatId?: string | null;
  tagId?: string | null;
  search?: string | null;
  sort?: QueueSort;
  roundId?: string | null;
};

export type QueueSort = 'score_desc' | 'score_asc' | 'ref_asc' | 'ref_desc' | 'title_asc' | 'newest';

export type QueueRow = {
  id: string;
  ref: number;
  displayRef: string;
  title: string;
  status: SubmissionStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  trackId: string | null;
  trackName: string | null;
  formatId: string | null;
  formatName: string | null;
  level: string | null;
  tagIds: string[];
  submitterName: string;
  submitterEmail: string;
  averageScore: number | null;
  spread: number | null;
  assignedCount: number;
  completedCount: number;
  hasAiReview: boolean;
};

export type QueueBundle = {
  round: ReviewRoundRecord | null;
  criteria: CriterionSpec[];
  rows: QueueRow[];
  counts: Record<string, number>;
  tracks: Array<{ id: string; name: string }>;
  formats: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
};

const STATUS_TABS: Array<{ id: string; label: string; statuses: SubmissionStatus[] }> = [
  { id: 'all', label: 'All', statuses: [] },
  { id: 'pending', label: 'Pending', statuses: ['submitted', 'under_review'] },
  { id: 'accepted', label: 'Accepted', statuses: ['accepted'] },
  { id: 'waitlisted', label: 'Waitlist', statuses: ['waitlisted'] },
  { id: 'declined', label: 'Declined', statuses: ['declined'] },
  { id: 'withdrawn', label: 'Withdrawn', statuses: ['withdrawn'] },
  { id: 'drafts', label: 'Drafts', statuses: ['draft'] },
];

export function statusesForTab(tabId: string): SubmissionStatus[] {
  return STATUS_TABS.find((tab) => tab.id === tabId)?.statuses ?? [];
}

export { STATUS_TABS };

export function sortQueue(rows: QueueRow[], sort: QueueSort = 'score_desc'): QueueRow[] {
  const copy = [...rows];
  const byScore = (a: QueueRow, b: QueueRow, direction: number) => {
    // Unscored rows sink to the bottom either way; a null is not a zero.
    if (a.averageScore === null && b.averageScore === null) return a.ref - b.ref;
    if (a.averageScore === null) return 1;
    if (b.averageScore === null) return -1;
    return (b.averageScore - a.averageScore) * direction;
  };

  switch (sort) {
    case 'score_asc':
      return copy.sort((a, b) => byScore(a, b, -1));
    case 'ref_asc':
      return copy.sort((a, b) => a.ref - b.ref);
    case 'ref_desc':
      return copy.sort((a, b) => b.ref - a.ref);
    case 'title_asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'newest':
      return copy.sort(
        (a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0) || b.ref - a.ref,
      );
    case 'score_desc':
    default:
      return copy.sort((a, b) => byScore(a, b, 1));
  }
}

export type ReviewResultsExportSpeaker = {
  name: string;
  email: string;
  kind: string;
};

export type ReviewResultsExportSubmission = {
  ref: number;
  title: string;
  status: SubmissionStatus;
  speakers: ReviewResultsExportSpeaker[];
  reviewers: ReviewerScorecard[];
};

function exportIdentity(person: { name: string; email: string }): string {
  return person.name === person.email ? person.email : `${person.name} <${person.email}>`;
}

function exportScore(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}

/** One row per assignment preserves disagreement; the blank row keeps an unassigned proposal visible. */
export function reviewResultsCsv(
  round: Pick<ReviewRoundRecord, 'name'>,
  criteria: CriterionSpec[],
  submissions: ReviewResultsExportSubmission[],
): string {
  const orderedCriteria = [...criteria].sort((a, b) => a.position - b.position);
  const header = [
    'Submission ref',
    'Title',
    'Submission status',
    'Round',
    'Aggregate score (1-5)',
    'Reviews completed',
    'Reviews assigned',
    'Speakers',
    'Co-speakers',
    'Reviewer',
    'Reviewer email',
    'Review status',
    'Reviewer score (1-5)',
    ...orderedCriteria.map(
      (criterion) =>
        `${criterion.label} (max ${criterion.maxScore}; weight ${criterion.weight})`,
    ),
    'Reviewer comment',
    'Review completed at',
  ];

  const rows = [...submissions]
    .sort((a, b) => a.ref - b.ref)
    .flatMap((submission) => {
      const summary = summarizeReviews(criteria, submission.reviewers);
      const speakers = submission.speakers
        .filter((speaker) => speaker.kind === 'speaker')
        .map(exportIdentity)
        .join(' | ');
      const coSpeakers = submission.speakers
        .filter((speaker) => speaker.kind === 'co_speaker')
        .map(exportIdentity)
        .join(' | ');
      const reviewers =
        submission.reviewers.length > 0
          ? [...submission.reviewers].sort(
              (a, b) =>
                a.reviewerName.localeCompare(b.reviewerName) ||
                a.reviewerEmail.localeCompare(b.reviewerEmail),
            )
          : [null];

      return reviewers.map((reviewer) => {
        const reviewerAggregate = reviewer
          ? aggregateScorecard(criteria, reviewer.scores)
          : null;
        const scoreByCriterion = new Map(
          reviewer?.scores.map((entry) => [entry.criterionId, entry.value]) ?? [],
        );
        return [
          formatRef('submission', submission.ref),
          submission.title,
          submission.status,
          round.name,
          exportScore(summary.average),
          summary.completedCount,
          summary.assignedCount,
          speakers,
          coSpeakers,
          reviewer?.reviewerName ?? '',
          reviewer?.reviewerEmail ?? '',
          reviewer?.status ?? '',
          exportScore(reviewerAggregate?.average ?? null),
          ...orderedCriteria.map((criterion) => scoreByCriterion.get(criterion.id) ?? ''),
          reviewer?.comment ?? '',
          reviewer?.completedAt?.toISOString() ?? '',
        ];
      });
    });

  return toCsv([header, ...rows]);
}

export type ReviewResultsExport = {
  csv: string;
  filename: string;
};

export async function buildReviewResultsExport(
  ctx: EventContext,
  roundId: string,
): Promise<ReviewResultsExport> {
  requireCapability(ctx, 'submission:decide');
  const round = await requireRound(ctx, roundId);
  const db = getDb();
  const [criteria, allSubmissions] = await Promise.all([
    listCriteria(round.id),
    db
      .select({
        id: submission.id,
        ref: submission.ref,
        title: submission.title,
        status: submission.status,
      })
      .from(submission)
      .where(eq(submission.eventId, ctx.eventId))
      .orderBy(asc(submission.ref)),
  ]);
  const submissions = allSubmissions.filter((row) => row.status !== 'draft');
  const submissionIds = submissions.map((row) => row.id);

  const [assignments, speakers] = submissionIds.length
    ? await Promise.all([
        db
          .select({
            id: reviewAssignment.id,
            submissionId: reviewAssignment.submissionId,
            reviewerUserId: reviewAssignment.reviewerUserId,
            reviewerName: user.name,
            reviewerEmail: user.email,
            status: reviewAssignment.status,
            comment: reviewAssignment.comment,
            completedAt: reviewAssignment.completedAt,
          })
          .from(reviewAssignment)
          .innerJoin(user, eq(user.id, reviewAssignment.reviewerUserId))
          .where(
            and(
              eq(reviewAssignment.reviewRoundId, round.id),
              inArray(reviewAssignment.submissionId, submissionIds),
            ),
          ),
        db
          .select({
            submissionId: participantRole.submissionId,
            displayName: participant.displayName,
            accountName: user.name,
            email: user.email,
            kind: participantRole.kind,
            isPrimary: participantRole.isPrimary,
            position: participantRole.position,
          })
          .from(participantRole)
          .innerJoin(participant, eq(participant.id, participantRole.participantId))
          .innerJoin(user, eq(user.id, participant.userId))
          .where(
            and(
              inArray(participantRole.submissionId, submissionIds),
              eq(participant.eventId, ctx.eventId),
            ),
          )
          .orderBy(desc(participantRole.isPrimary), asc(participantRole.position)),
      ])
    : [[], []];

  const scores = assignments.length
    ? await db
        .select({
          assignmentId: scoreTable.reviewAssignmentId,
          criterionId: scoreTable.criterionId,
          value: scoreTable.value,
        })
        .from(scoreTable)
        .where(
          inArray(
            scoreTable.reviewAssignmentId,
            assignments.map((row) => row.id),
          ),
        )
    : [];

  const scoresByAssignment = groupBy(
    scores,
    (row) => row.assignmentId,
    (row) => ({ criterionId: row.criterionId, value: row.value }),
  );
  const assignmentsBySubmission = groupBy(
    assignments,
    (row) => row.submissionId,
    (row): ReviewerScorecard => ({
      assignmentId: row.id,
      reviewerUserId: row.reviewerUserId,
      reviewerName: row.reviewerName ?? row.reviewerEmail,
      reviewerEmail: row.reviewerEmail,
      status: row.status,
      comment: row.comment,
      completedAt: row.completedAt,
      scores: scoresByAssignment.get(row.id) ?? [],
    }),
  );
  const speakersBySubmission = groupBy(
    speakers,
    (row) => row.submissionId,
    (row): ReviewResultsExportSpeaker => ({
      name: row.displayName ?? row.accountName ?? row.email,
      email: row.email,
      kind: row.kind,
    }),
  );

  return {
    csv: reviewResultsCsv(
      round,
      criteria,
      submissions.map((row) => ({
        ref: row.ref,
        title: row.title,
        status: row.status,
        speakers: speakersBySubmission.get(row.id) ?? [],
        reviewers: assignmentsBySubmission.get(row.id) ?? [],
      })),
    ),
    filename: `review-results-${slugify(round.name) || round.id}.csv`,
  };
}

export async function loadQueue(
  ctx: EventContext,
  filters: QueueFilters = {},
): Promise<QueueBundle> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const round = await resolveRound(ctx, filters.roundId ?? null);
  const criteria = round ? await listCriteria(round.id) : [];

  const [rows, tracks, formats, tags] = await Promise.all([
    db
      .select({
        id: submission.id,
        ref: submission.ref,
        title: submission.title,
        status: submission.status,
        submittedAt: submission.submittedAt,
        decidedAt: submission.decidedAt,
        trackId: submission.trackId,
        formatId: submission.formatId,
        level: submission.level,
        submitterName: user.name,
        submitterEmail: user.email,
      })
      .from(submission)
      .innerJoin(user, eq(user.id, submission.submitterUserId))
      .where(eq(submission.eventId, ctx.eventId))
      .orderBy(asc(submission.ref)),
    db
      .select({ id: trackTable.id, name: trackTable.name })
      .from(trackTable)
      .where(eq(trackTable.eventId, ctx.eventId))
      .orderBy(asc(trackTable.position)),
    db
      .select({ id: sessionFormat.id, name: sessionFormat.name })
      .from(sessionFormat)
      .where(eq(sessionFormat.eventId, ctx.eventId))
      .orderBy(asc(sessionFormat.position)),
    db
      .select({ id: tagTable.id, name: tagTable.name })
      .from(tagTable)
      .where(eq(tagTable.eventId, ctx.eventId))
      .orderBy(asc(tagTable.name)),
  ]);

  const ids = rows.map((row) => row.id);
  const [tagRows, assignmentRows, scoreRows, aiRows] = await Promise.all([
    ids.length
      ? db
          .select({ submissionId: submissionTag.submissionId, tagId: submissionTag.tagId })
          .from(submissionTag)
          .where(inArray(submissionTag.submissionId, ids))
      : Promise.resolve([]),
    ids.length && round
      ? db
          .select({
            id: reviewAssignment.id,
            submissionId: reviewAssignment.submissionId,
            reviewerUserId: reviewAssignment.reviewerUserId,
            status: reviewAssignment.status,
          })
          .from(reviewAssignment)
          .where(
            and(
              eq(reviewAssignment.reviewRoundId, round.id),
              inArray(reviewAssignment.submissionId, ids),
            ),
          )
      : Promise.resolve([]),
    ids.length && round
      ? db
          .select({
            assignmentId: scoreTable.reviewAssignmentId,
            criterionId: scoreTable.criterionId,
            value: scoreTable.value,
            submissionId: reviewAssignment.submissionId,
          })
          .from(scoreTable)
          .innerJoin(reviewAssignment, eq(reviewAssignment.id, scoreTable.reviewAssignmentId))
          .where(
            and(
              eq(reviewAssignment.reviewRoundId, round.id),
              inArray(reviewAssignment.submissionId, ids),
            ),
          )
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ submissionId: aiReview.submissionId })
          .from(aiReview)
          .where(inArray(aiReview.submissionId, ids))
      : Promise.resolve([]),
  ]);

  const tagsBySubmission = groupBy(tagRows, (row) => row.submissionId, (row) => row.tagId);
  const scoresByAssignment = new Map<string, ScoreValue[]>();
  for (const row of scoreRows) {
    const list = scoresByAssignment.get(row.assignmentId) ?? [];
    list.push({ criterionId: row.criterionId, value: row.value });
    scoresByAssignment.set(row.assignmentId, list);
  }

  const assignmentsBySubmission = new Map<string, typeof assignmentRows>();
  for (const row of assignmentRows) {
    const list = assignmentsBySubmission.get(row.submissionId) ?? [];
    list.push(row);
    assignmentsBySubmission.set(row.submissionId, list);
  }

  const withAi = new Set(aiRows.map((row) => row.submissionId));
  const trackNames = new Map(tracks.map((row) => [row.id, row.name]));
  const formatNames = new Map(formats.map((row) => [row.id, row.name]));

  const all: QueueRow[] = rows.map((row) => {
    const assignments = assignmentsBySubmission.get(row.id) ?? [];
    const summary = summarizeReviews(
      criteria,
      assignments.map((assignment) => ({
        assignmentId: assignment.id,
        reviewerUserId: assignment.reviewerUserId,
        reviewerName: '',
        reviewerEmail: '',
        status: assignment.status,
        comment: null,
        completedAt: null,
        scores: scoresByAssignment.get(assignment.id) ?? [],
      })),
    );

    return {
      id: row.id,
      ref: row.ref,
      displayRef: formatRef('submission', row.ref),
      title: row.title,
      status: row.status,
      submittedAt: row.submittedAt,
      decidedAt: row.decidedAt,
      trackId: row.trackId,
      trackName: row.trackId ? (trackNames.get(row.trackId) ?? null) : null,
      formatId: row.formatId,
      formatName: row.formatId ? (formatNames.get(row.formatId) ?? null) : null,
      level: row.level,
      tagIds: tagsBySubmission.get(row.id) ?? [],
      submitterName: row.submitterName ?? row.submitterEmail,
      submitterEmail: row.submitterEmail,
      averageScore: summary.average,
      spread: summary.spread,
      assignedCount: summary.assignedCount,
      completedCount: summary.completedCount,
      hasAiReview: withAi.has(row.id),
    };
  });

  const counts: Record<string, number> = {};
  for (const tab of STATUS_TABS) {
    counts[tab.id] =
      tab.statuses.length === 0
        ? all.filter((row) => row.status !== 'draft').length
        : all.filter((row) => tab.statuses.includes(row.status)).length;
  }

  // Redacted before the filter runs, so a blind reviewer cannot recover a name by searching for it.
  const visible = hidesAuthorship(round, ctx) ? all.map(redactSubmitter) : all;

  return {
    round,
    criteria,
    rows: sortQueue(filterQueue(visible, filters), filters.sort),
    counts,
    tracks,
    formats,
    tags,
  };
}

export function filterQueue(rows: QueueRow[], filters: QueueFilters): QueueRow[] {
  const statuses = filters.statuses ?? [];
  const search = filters.search?.trim().toLowerCase() ?? '';

  return rows.filter((row) => {
    if (statuses.length === 0 ? row.status === 'draft' : !statuses.includes(row.status)) {
      return false;
    }
    if (filters.trackId && row.trackId !== filters.trackId) return false;
    if (filters.formatId && row.formatId !== filters.formatId) return false;
    if (filters.tagId && !row.tagIds.includes(filters.tagId)) return false;
    if (search) {
      const haystack =
        `${row.displayRef} ${row.title} ${row.submitterName} ${row.submitterEmail}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function groupBy<T, K, V>(rows: T[], key: (row: T) => K, value: (row: T) => V): Map<K, V[]> {
  const map = new Map<K, V[]>();
  for (const row of rows) {
    const list = map.get(key(row)) ?? [];
    list.push(value(row));
    map.set(key(row), list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// One submission, in full — the review detail view
// ---------------------------------------------------------------------------

export type ReviewSpeaker = {
  participantId: string;
  name: string;
  email: string;
  jobTitle: string | null;
  company: string | null;
  bioMarkdown: string | null;
  isPrimary: boolean;
  kind: string;
};

export type AiReviewRecord = {
  id: string;
  model: string;
  rationaleMarkdown: string;
  criterionScores: Array<{ criterionId: string; value: number; note?: string }>;
  createdAt: Date;
};

export type SubmissionReview = {
  id: string;
  ref: number;
  displayRef: string;
  title: string;
  descriptionMarkdown: string | null;
  status: SubmissionStatus;
  level: string | null;
  trackName: string | null;
  formatName: string | null;
  tags: Array<{ id: string; name: string }>;
  answers: Record<string, unknown>;
  /** Answer keys are form-local slugs; the question wording lives on the field row. */
  answerLabels: Record<string, string>;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  submitterName: string;
  submitterEmail: string;
  speakers: ReviewSpeaker[];
  round: ReviewRoundRecord | null;
  criteria: CriterionSpec[];
  /** Blinded to the actor's own row while an open round hides peer scores. */
  reviewers: ReviewerScorecard[];
  blinded: boolean;
  /** `ABS-07`: the author has been stripped out of everything above for this actor. */
  authorHidden: boolean;
  myAssignmentStatus: AssignmentStatus | null;
  summary: ReviewSummary;
  myScores: ScoreValue[];
  myComment: string | null;
  myAssignmentId: string | null;
  ai: AiReviewRecord | null;
};

export async function loadSubmissionReview(
  ctx: EventContext,
  submissionId: string,
  roundId?: string | null,
): Promise<SubmissionReview> {
  requireCapability(ctx, 'submission:read_all');
  const db = getDb();

  const row = await db.query.submission.findFirst({
    where: and(eq(submission.id, submissionId), eq(submission.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That submission');

  const round = await resolveRound(ctx, roundId ?? null);
  const criteria = round ? await listCriteria(round.id) : [];

  const [submitter, trackRow, formatRow, tagRows, speakerRows, assignmentRows, aiRow, fieldRows] =
    await Promise.all([
      db.query.user.findFirst({ where: eq(user.id, row.submitterUserId) }),
      row.trackId
        ? db.query.track.findFirst({ where: eq(trackTable.id, row.trackId) })
        : Promise.resolve(undefined),
      row.formatId
        ? db.query.sessionFormat.findFirst({ where: eq(sessionFormat.id, row.formatId) })
        : Promise.resolve(undefined),
      db
        .select({ id: tagTable.id, name: tagTable.name })
        .from(submissionTag)
        .innerJoin(tagTable, eq(tagTable.id, submissionTag.tagId))
        .where(eq(submissionTag.submissionId, row.id)),
      db
        .select({
          participantId: participant.id,
          displayName: participant.displayName,
          jobTitle: participant.jobTitle,
          company: participant.company,
          bioMarkdown: participant.bioMarkdown,
          email: user.email,
          name: user.name,
          isPrimary: participantRole.isPrimary,
          kind: participantRole.kind,
          position: participantRole.position,
        })
        .from(participantRole)
        .innerJoin(participant, eq(participant.id, participantRole.participantId))
        .innerJoin(user, eq(user.id, participant.userId))
        .where(eq(participantRole.submissionId, row.id))
        .orderBy(desc(participantRole.isPrimary), asc(participantRole.position)),
      round
        ? db
            .select({
              id: reviewAssignment.id,
              reviewerUserId: reviewAssignment.reviewerUserId,
              status: reviewAssignment.status,
              comment: reviewAssignment.comment,
              completedAt: reviewAssignment.completedAt,
              reviewerName: user.name,
              reviewerEmail: user.email,
            })
            .from(reviewAssignment)
            .innerJoin(user, eq(user.id, reviewAssignment.reviewerUserId))
            .where(
              and(
                eq(reviewAssignment.reviewRoundId, round.id),
                eq(reviewAssignment.submissionId, row.id),
              ),
            )
        : Promise.resolve([]),
      db.query.aiReview.findFirst({
        where: eq(aiReview.submissionId, row.id),
        orderBy: [desc(aiReview.createdAt)],
      }),
      db
        .select({
          key: formField.key,
          label: formField.label,
          type: formField.type,
          builtinKey: formField.builtinKey,
        })
        .from(formField)
        .where(eq(formField.formId, row.formId)),
    ]);

  const assignmentIds = assignmentRows.map((assignment) => assignment.id);
  const scoreRows = assignmentIds.length
    ? await db
        .select({
          assignmentId: scoreTable.reviewAssignmentId,
          criterionId: scoreTable.criterionId,
          value: scoreTable.value,
        })
        .from(scoreTable)
        .where(inArray(scoreTable.reviewAssignmentId, assignmentIds))
    : [];

  const scoresByAssignment = new Map<string, ScoreValue[]>();
  for (const entry of scoreRows) {
    const list = scoresByAssignment.get(entry.assignmentId) ?? [];
    list.push({ criterionId: entry.criterionId, value: entry.value });
    scoresByAssignment.set(entry.assignmentId, list);
  }

  const reviewers: ReviewerScorecard[] = assignmentRows.map((assignment) => ({
    assignmentId: assignment.id,
    reviewerUserId: assignment.reviewerUserId,
    reviewerName: assignment.reviewerName ?? assignment.reviewerEmail,
    reviewerEmail: assignment.reviewerEmail,
    status: assignment.status,
    comment: assignment.comment,
    completedAt: assignment.completedAt,
    scores: scoresByAssignment.get(assignment.id) ?? [],
  }));

  // Blind review hides peers from a reviewer, never from the organizer who has to decide.
  const blinded =
    Boolean(round?.blindUntilClose) && round?.status !== 'closed' && !can(ctx, 'submission:decide');
  const visible = blinded
    ? reviewers.filter((reviewer) => reviewer.reviewerUserId === ctx.actor.userId)
    : reviewers;

  const mine = reviewers.find((reviewer) => reviewer.reviewerUserId === ctx.actor.userId) ?? null;
  const authorHidden = hidesAuthorship(round, ctx);

  const detail: SubmissionReview = {
    id: row.id,
    ref: row.ref,
    displayRef: formatRef('submission', row.ref),
    title: row.title,
    descriptionMarkdown: row.descriptionMarkdown,
    status: row.status,
    level: row.level,
    trackName: trackRow?.name ?? null,
    formatName: formatRow?.name ?? null,
    tags: tagRows,
    answers: row.answers as Record<string, unknown>,
    answerLabels: Object.fromEntries(fieldRows.map((field) => [field.key, field.label])),
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    submitterName: submitter?.name ?? submitter?.email ?? 'Unknown',
    submitterEmail: submitter?.email ?? '',
    speakers: speakerRows.map((speaker) => ({
      participantId: speaker.participantId,
      name: speaker.displayName ?? speaker.name ?? speaker.email,
      email: speaker.email,
      jobTitle: speaker.jobTitle,
      company: speaker.company,
      bioMarkdown: speaker.bioMarkdown,
      isPrimary: speaker.isPrimary,
      kind: speaker.kind,
    })),
    round,
    criteria,
    reviewers: visible,
    blinded,
    authorHidden,
    summary: summarizeReviews(criteria, blinded ? visible : reviewers),
    myAssignmentStatus: mine?.status ?? null,
    myScores: mine?.scores ?? [],
    myComment: mine?.comment ?? null,
    myAssignmentId: mine?.assignmentId ?? null,
    ai: aiRow
      ? {
          id: aiRow.id,
          model: aiRow.model,
          rationaleMarkdown: aiRow.rationaleMarkdown,
          criterionScores: aiRow.criterionScores,
          createdAt: aiRow.createdAt,
        }
      : null,
  };

  return authorHidden ? redactAuthorship(detail, fieldRows) : detail;
}

// ---------------------------------------------------------------------------
// Decisions — `V-2`
// ---------------------------------------------------------------------------

export type DecisionResult = { updated: number; skipped: Array<{ id: string; reason: string }> };

/**
 * The transition that makes a session eligible for the agenda, so it is deliberately the only way
 * to set these statuses. Bulk and single share one path — a bulk decision that behaved differently
 * from twenty individual ones would be a bug nobody notices until the agenda is wrong.
 */
export async function decideSubmissions(
  ctx: EventContext,
  submissionIds: string[],
  decision: Decision,
  note?: string | null,
): Promise<DecisionResult> {
  requireCapability(ctx, 'submission:decide');
  if (submissionIds.length === 0) return { updated: 0, skipped: [] };

  const db = getDb();
  const rows = await db
    .select({ id: submission.id, status: submission.status })
    .from(submission)
    .where(and(eq(submission.eventId, ctx.eventId), inArray(submission.id, submissionIds)));

  const skipped: Array<{ id: string; reason: string }> = [];
  const eligible: string[] = [];
  for (const row of rows) {
    try {
      nextStatusForDecision(row.status, decision);
      eligible.push(row.id);
    } catch (error) {
      skipped.push({ id: row.id, reason: error instanceof Error ? error.message : 'Not eligible' });
    }
  }
  if (eligible.length === 0) return { updated: 0, skipped };

  const now = new Date();
  const status = DECISION_STATUS[decision];
  await db
    .update(submission)
    .set({
      status,
      decidedAt: decision === 'reset' ? null : now,
      decisionNote: note === undefined ? undefined : (note?.trim() || null),
      updatedAt: now,
    })
    .where(and(eq(submission.eventId, ctx.eventId), inArray(submission.id, eligible)));

  return { updated: eligible.length, skipped };
}

// ---------------------------------------------------------------------------
// `V-12` reviewer workload
// ---------------------------------------------------------------------------

export type WorkloadRow = {
  reviewerUserId: string;
  name: string;
  email: string;
  assigned: number;
  completed: number;
  declined: number;
  pending: number;
  /** Mean of the averages this reviewer gave, which is how a harsh or generous panelist shows up. */
  averageGiven: number | null;
  lastActivityAt: Date | null;
};

export async function reviewerWorkload(
  ctx: EventContext,
  roundId: string,
): Promise<WorkloadRow[]> {
  requireCapability(ctx, 'submission:review');
  await requireRound(ctx, roundId);
  const db = getDb();

  const [assignments, criteria] = await Promise.all([
    db
      .select({
        id: reviewAssignment.id,
        reviewerUserId: reviewAssignment.reviewerUserId,
        status: reviewAssignment.status,
        completedAt: reviewAssignment.completedAt,
        name: user.name,
        email: user.email,
      })
      .from(reviewAssignment)
      .innerJoin(user, eq(user.id, reviewAssignment.reviewerUserId))
      .where(eq(reviewAssignment.reviewRoundId, roundId)),
    listCriteria(roundId),
  ]);

  const scoreRows = assignments.length
    ? await db
        .select({
          assignmentId: scoreTable.reviewAssignmentId,
          criterionId: scoreTable.criterionId,
          value: scoreTable.value,
        })
        .from(scoreTable)
        .where(
          inArray(
            scoreTable.reviewAssignmentId,
            assignments.map((assignment) => assignment.id),
          ),
        )
    : [];

  const scoresByAssignment = new Map<string, ScoreValue[]>();
  for (const entry of scoreRows) {
    const list = scoresByAssignment.get(entry.assignmentId) ?? [];
    list.push({ criterionId: entry.criterionId, value: entry.value });
    scoresByAssignment.set(entry.assignmentId, list);
  }

  const byReviewer = new Map<string, WorkloadRow & { averages: number[] }>();
  for (const assignment of assignments) {
    const entry = byReviewer.get(assignment.reviewerUserId) ?? {
      reviewerUserId: assignment.reviewerUserId,
      name: assignment.name ?? assignment.email,
      email: assignment.email,
      assigned: 0,
      completed: 0,
      declined: 0,
      pending: 0,
      averageGiven: null,
      lastActivityAt: null,
      averages: [],
    };

    entry.assigned += 1;
    if (assignment.status === 'completed') entry.completed += 1;
    else if (assignment.status === 'declined') entry.declined += 1;
    else entry.pending += 1;

    if (
      assignment.completedAt &&
      (!entry.lastActivityAt || assignment.completedAt > entry.lastActivityAt)
    ) {
      entry.lastActivityAt = assignment.completedAt;
    }

    const aggregate = aggregateScorecard(criteria, scoresByAssignment.get(assignment.id) ?? []);
    if (aggregate.average !== null) entry.averages.push(aggregate.average);

    byReviewer.set(assignment.reviewerUserId, entry);
  }

  // Every reviewer on the event appears, including the ones with nothing assigned — an idle
  // reviewer is exactly what this report exists to surface.
  for (const reviewer of await listReviewers(ctx)) {
    if (byReviewer.has(reviewer.userId)) continue;
    byReviewer.set(reviewer.userId, {
      reviewerUserId: reviewer.userId,
      name: reviewer.name,
      email: reviewer.email,
      assigned: 0,
      completed: 0,
      declined: 0,
      pending: 0,
      averageGiven: null,
      lastActivityAt: null,
      averages: [],
    });
  }

  return [...byReviewer.values()]
    .map(({ averages, ...rest }) => ({
      ...rest,
      averageGiven:
        averages.length > 0
          ? round(averages.reduce((sum, value) => sum + value, 0) / averages.length, 2)
          : null,
    }))
    .sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// `V-7` manual add, `V-10` bulk import
// ---------------------------------------------------------------------------

export type NewSubmissionInput = {
  formId: string;
  title: string;
  descriptionMarkdown?: string | null;
  trackId?: string | null;
  formatId?: string | null;
  level?: string | null;
  speakerEmail: string;
  speakerName?: string | null;
  status?: Extract<SubmissionStatus, 'submitted' | 'accepted'>;
  tagIds?: string[];
};

/**
 * The per-event counter is bumped in the statement that reads it, so two imports running together
 * cannot be handed the same `ABS-` number. `lib/services/submissions.ts` keeps its own copy of this
 * for the public path; it is four lines and not exported — see `tasks/W3b-notes.md`.
 */
async function allocateRef(eventId: string): Promise<number> {
  const [row] = await getDb()
    .update(event)
    .set({ submissionSeq: sql`${event.submissionSeq} + 1`, updatedAt: new Date() })
    .where(eq(event.id, eventId))
    .returning({ ref: event.submissionSeq });
  if (!row) throw notFound('That event');
  return row.ref;
}

/**
 * `V-7`. Organizers always have invited talks that never touch the CFP, and an invited keynote that
 * cannot be scheduled because it has no submission row is the kind of gap that gets patched with a
 * spreadsheet. Creates the speaker's account and participant record if they have neither.
 */
export async function createSubmissionAsOrganizer(
  ctx: EventContext,
  input: NewSubmissionInput,
): Promise<{ id: string; displayRef: string }> {
  requireCapability(ctx, 'submission:decide');
  const db = getDb();

  const title = input.title.trim();
  if (!title) throw invalid('A submission needs a title', { title: 'Title is required' });

  const email = input.speakerEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw invalid('That does not look like an email address', {
      speakerEmail: 'Enter a valid email address',
    });
  }

  const speakerName = parseSpeakerName(input.speakerName);

  const existingUser = await db.query.user.findFirst({ where: eq(user.email, email) });
  const speaker =
    existingUser ??
    (
      await db
        .insert(user)
        .values({ email, name: speakerName })
        .returning()
    )[0];

  const now = new Date();
  const status = input.status ?? 'submitted';
  const [created] = await db
    .insert(submission)
    .values({
      eventId: ctx.eventId,
      formId: input.formId,
      ref: await allocateRef(ctx.eventId),
      submitterUserId: speaker.id,
      title,
      descriptionMarkdown: input.descriptionMarkdown?.trim() || null,
      trackId: input.trackId || null,
      formatId: input.formatId || null,
      level: input.level?.trim() || null,
      status,
      submittedAt: now,
      decidedAt: status === 'accepted' ? now : null,
    })
    .returning();

  const participantId = await ensureParticipant(
    ctx.eventId,
    speaker.id,
    speakerName ?? speaker.name,
  );
  await linkPrimarySpeaker(created.id, participantId);

  if (input.tagIds?.length) {
    await db
      .insert(submissionTag)
      .values(input.tagIds.map((tagId) => ({ submissionId: created.id, tagId })))
      .onConflictDoNothing();
  }

  return { id: created.id, displayRef: formatRef('submission', created.ref) };
}

export type ImportRow = {
  title: string;
  description: string | null;
  track: string | null;
  format: string | null;
  level: string | null;
  speakerEmail: string;
  speakerName: string | null;
  status: 'submitted' | 'accepted';
};

export type ImportParse = {
  rows: ImportRow[];
  errors: Array<{ line: number; message: string }>;
  headers: string[];
};

/**
 * RFC 4180 enough for a spreadsheet export: quoted cells, doubled quotes inside them, and newlines
 * inside quotes. Written by hand because the alternative is a dependency and `package.json` is
 * frozen.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const source = text.replace(/^﻿/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

const IMPORT_ALIASES: Record<string, keyof ImportRow> = {
  title: 'title',
  session: 'title',
  'session title': 'title',
  name: 'title',
  description: 'description',
  abstract: 'description',
  summary: 'description',
  track: 'track',
  format: 'format',
  'session format': 'format',
  type: 'format',
  level: 'level',
  audience: 'level',
  email: 'speakerEmail',
  'speaker email': 'speakerEmail',
  'speaker e-mail': 'speakerEmail',
  speaker: 'speakerName',
  'speaker name': 'speakerName',
  status: 'status',
};

/** `V-10`. Column order is irrelevant; a recognisable header in any of its usual spellings wins. */
export function parseSubmissionImport(text: string): ImportParse {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], headers: [], errors: [{ line: 0, message: 'That file is empty' }] };
  }

  const headers = table[0].map((header) => header.trim());
  const mapped = headers.map((header) => IMPORT_ALIASES[header.toLowerCase().trim()] ?? null);
  const errors: Array<{ line: number; message: string }> = [];

  if (!mapped.includes('title')) {
    errors.push({ line: 1, message: 'No Title column found' });
  }
  if (!mapped.includes('speakerEmail')) {
    errors.push({ line: 1, message: 'No Speaker email column found' });
  }
  if (errors.length > 0) return { rows: [], headers, errors };

  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const record: Record<string, string> = {};
    mapped.forEach((key, column) => {
      if (key) record[key] = (cells[column] ?? '').trim();
    });

    if (!record.title) {
      errors.push({ line, message: 'Missing title' });
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.speakerEmail ?? '')) {
      errors.push({ line, message: `Invalid speaker email for "${record.title}"` });
      return;
    }

    rows.push({
      title: record.title,
      description: record.description || null,
      track: record.track || null,
      format: record.format || null,
      level: record.level || null,
      speakerEmail: record.speakerEmail.toLowerCase(),
      speakerName: record.speakerName || null,
      status: record.status?.toLowerCase() === 'accepted' ? 'accepted' : 'submitted',
    });
  });

  return { rows, headers, errors };
}

export type ImportResult = { created: number; failed: Array<{ title: string; message: string }> };

export async function importSubmissions(
  ctx: EventContext,
  formId: string,
  rows: ImportRow[],
): Promise<ImportResult> {
  requireCapability(ctx, 'submission:decide');
  const db = getDb();

  const [tracks, formats] = await Promise.all([
    db
      .select({ id: trackTable.id, name: trackTable.name })
      .from(trackTable)
      .where(eq(trackTable.eventId, ctx.eventId)),
    db
      .select({ id: sessionFormat.id, name: sessionFormat.name })
      .from(sessionFormat)
      .where(eq(sessionFormat.eventId, ctx.eventId)),
  ]);

  const trackByName = new Map(tracks.map((row) => [row.name.toLowerCase(), row.id]));
  const formatByName = new Map(formats.map((row) => [row.name.toLowerCase(), row.id]));

  const failed: ImportResult['failed'] = [];
  let created = 0;

  for (const row of rows) {
    try {
      await createSubmissionAsOrganizer(ctx, {
        formId,
        title: row.title,
        descriptionMarkdown: row.description,
        trackId: row.track ? (trackByName.get(row.track.toLowerCase()) ?? null) : null,
        formatId: row.format ? (formatByName.get(row.format.toLowerCase()) ?? null) : null,
        level: row.level,
        speakerEmail: row.speakerEmail,
        speakerName: row.speakerName,
        status: row.status,
      });
      created += 1;
    } catch (error) {
      failed.push({
        title: row.title,
        message: error instanceof Error ? error.message : 'Could not import that row',
      });
    }
  }

  return { created, failed };
}

// ---------------------------------------------------------------------------
// `V-11` bulk file download
// ---------------------------------------------------------------------------

export type SubmissionFile = {
  fileId: string;
  submissionId: string;
  displayRef: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fileIdCandidates(answers: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const value of Object.values(answers)) {
    if (typeof value === 'string' && UUID.test(value)) found.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && UUID.test(entry)) found.push(entry);
      }
    }
  }
  return found;
}

/**
 * Which answers hold a file id is a property of the form, not of the submission, so rather than
 * reloading every form's field list this collects anything uuid-shaped and asks the `file` table
 * which of those actually exist in this event. A uuid that is not a file simply does not match.
 */
export async function listSubmissionFiles(
  ctx: EventContext,
  submissionIds: string[],
): Promise<SubmissionFile[]> {
  requireCapability(ctx, 'submission:read_all');
  if (submissionIds.length === 0) return [];
  const db = getDb();

  const rows = await db
    .select({ id: submission.id, ref: submission.ref, answers: submission.answers })
    .from(submission)
    .where(and(eq(submission.eventId, ctx.eventId), inArray(submission.id, submissionIds)));

  const owner = new Map<string, { submissionId: string; ref: number }>();
  for (const row of rows) {
    for (const candidate of fileIdCandidates(row.answers as Record<string, unknown>)) {
      owner.set(candidate, { submissionId: row.id, ref: row.ref });
    }
  }
  if (owner.size === 0) return [];

  const fileRows = await db
    .select()
    .from(file)
    .where(and(eq(file.eventId, ctx.eventId), inArray(file.id, [...owner.keys()])));

  return fileRows.map((row) => {
    const source = owner.get(row.id) as { submissionId: string; ref: number };
    return {
      fileId: row.id,
      submissionId: source.submissionId,
      displayRef: formatRef('submission', source.ref),
      filename: row.filename,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      storageKey: row.storageKey,
    };
  });
}

// ---------------------------------------------------------------------------
// `V-6` saved views
// ---------------------------------------------------------------------------

export const QUEUE_SURFACE = 'submissions';

export type SavedViewRecord = { id: string; name: string; filters: Record<string, unknown> };

export async function listSavedViews(ctx: EventContext): Promise<SavedViewRecord[]> {
  requireCapability(ctx, 'submission:read_all');
  const rows = await getDb()
    .select({ id: savedView.id, name: savedView.name, filters: savedView.filters })
    .from(savedView)
    .where(
      and(
        eq(savedView.eventId, ctx.eventId),
        eq(savedView.userId, ctx.actor.userId),
        eq(savedView.surface, QUEUE_SURFACE),
      ),
    )
    .orderBy(asc(savedView.name));
  return rows.map((row) => ({ id: row.id, name: row.name, filters: row.filters }));
}

export async function saveView(
  ctx: EventContext,
  name: string,
  filters: Record<string, unknown>,
): Promise<SavedViewRecord> {
  requireCapability(ctx, 'submission:read_all');
  const trimmed = name.trim();
  if (!trimmed) throw invalid('A view needs a name', { name: 'Name is required' });

  const [created] = await getDb()
    .insert(savedView)
    .values({
      eventId: ctx.eventId,
      userId: ctx.actor.userId,
      surface: QUEUE_SURFACE,
      name: trimmed,
      filters,
    })
    .returning();
  return { id: created.id, name: created.name, filters: created.filters };
}

export async function deleteSavedView(ctx: EventContext, viewId: string): Promise<void> {
  requireCapability(ctx, 'submission:read_all');
  await getDb()
    .delete(savedView)
    .where(and(eq(savedView.id, viewId), eq(savedView.userId, ctx.actor.userId)));
}

// ---------------------------------------------------------------------------
// `V-9` AI review persistence. The model call itself lives in `lib/ai/review.ts`.
// ---------------------------------------------------------------------------

export type AiReviewDraft = {
  submissionId: string;
  reviewRoundId: string | null;
  model: string;
  rationaleMarkdown: string;
  criterionScores: Array<{ criterionId: string; value: number; note?: string }>;
};

export async function saveAiReview(
  ctx: EventContext,
  draft: AiReviewDraft,
): Promise<AiReviewRecord> {
  requireCapability(ctx, 'submission:review');
  const owned = await getDb().query.submission.findFirst({
    where: and(eq(submission.id, draft.submissionId), eq(submission.eventId, ctx.eventId)),
  });
  if (!owned) throw notFound('That submission');

  const [created] = await getDb()
    .insert(aiReview)
    .values({
      submissionId: draft.submissionId,
      reviewRoundId: draft.reviewRoundId,
      model: draft.model,
      rationaleMarkdown: draft.rationaleMarkdown,
      criterionScores: draft.criterionScores,
    })
    .returning();

  return {
    id: created.id,
    model: created.model,
    rationaleMarkdown: created.rationaleMarkdown,
    criterionScores: created.criterionScores,
    createdAt: created.createdAt,
  };
}

/** The payload `lib/ai/review.ts` scores against, assembled here so the AI module owns no queries. */
export type AiReviewSubject = {
  title: string;
  descriptionMarkdown: string | null;
  trackName: string | null;
  formatName: string | null;
  level: string | null;
  answers: Record<string, unknown>;
  speakerBios: string[];
  criteria: CriterionSpec[];
  roundId: string | null;
};

export async function loadAiReviewSubject(
  ctx: EventContext,
  submissionId: string,
  roundId?: string | null,
): Promise<AiReviewSubject> {
  const detail = await loadSubmissionReview(ctx, submissionId, roundId);
  return {
    title: detail.title,
    descriptionMarkdown: detail.descriptionMarkdown,
    trackName: detail.trackName,
    formatName: detail.formatName,
    level: detail.level,
    answers: detail.answers,
    speakerBios: detail.speakers
      .map((speaker) => speaker.bioMarkdown)
      .filter((bio): bio is string => Boolean(bio)),
    criteria: detail.criteria,
    roundId: detail.round?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// The reviewer's own surface — `CFP-10`, `ABS-12`
// ---------------------------------------------------------------------------

export type ReviewerAssignmentRow = {
  assignmentId: string;
  submissionId: string;
  ref: number;
  displayRef: string;
  title: string;
  trackName: string | null;
  formatName: string | null;
  level: string | null;
  status: AssignmentStatus;
  comment: string | null;
  completedAt: Date | null;
  submitterName: string;
  average: number | null;
  scoredCount: number;
};

export type ReviewerQueue = {
  round: ReviewRoundRecord | null;
  rounds: ReviewRoundRecord[];
  criteria: CriterionSpec[];
  authorHidden: boolean;
  /** What is still theirs to do, in the order they should work through it. */
  assignments: ReviewerAssignmentRow[];
  recused: ReviewerAssignmentRow[];
  pendingCount: number;
  completedCount: number;
};

/**
 * Everything the reviewer dashboard renders, scoped to this reviewer's own assignments. It is
 * deliberately not `loadQueue` with a filter: a reviewer's working set is the assignment list, and
 * building it from the other direction is what keeps unassigned submissions off the screen.
 */
export async function loadReviewerQueue(
  ctx: EventContext,
  roundId?: string | null,
): Promise<ReviewerQueue> {
  requireCapability(ctx, 'submission:review');
  const db = getDb();

  const rounds = await listRounds(ctx);
  const round =
    rounds.find((candidate) => candidate.id === roundId) ??
    rounds.find((candidate) => candidate.status === 'open') ??
    rounds[rounds.length - 1] ??
    null;

  const empty: ReviewerQueue = {
    round,
    rounds,
    criteria: [],
    authorHidden: hidesAuthorship(round, ctx),
    assignments: [],
    recused: [],
    pendingCount: 0,
    completedCount: 0,
  };
  if (!round) return empty;

  const criteria = await listCriteria(round.id);
  const rows = await db
    .select({
      assignmentId: reviewAssignment.id,
      status: reviewAssignment.status,
      comment: reviewAssignment.comment,
      completedAt: reviewAssignment.completedAt,
      submissionId: submission.id,
      ref: submission.ref,
      title: submission.title,
      trackId: submission.trackId,
      formatId: submission.formatId,
      level: submission.level,
      submitterName: user.name,
      submitterEmail: user.email,
    })
    .from(reviewAssignment)
    .innerJoin(submission, eq(submission.id, reviewAssignment.submissionId))
    .innerJoin(user, eq(user.id, submission.submitterUserId))
    .where(
      and(
        eq(reviewAssignment.reviewRoundId, round.id),
        eq(reviewAssignment.reviewerUserId, ctx.actor.userId),
        eq(submission.eventId, ctx.eventId),
      ),
    )
    .orderBy(asc(submission.ref));

  if (rows.length === 0) return { ...empty, criteria };

  const [scoreRows, tracks, formats] = await Promise.all([
    db
      .select({
        assignmentId: scoreTable.reviewAssignmentId,
        criterionId: scoreTable.criterionId,
        value: scoreTable.value,
      })
      .from(scoreTable)
      .where(
        inArray(
          scoreTable.reviewAssignmentId,
          rows.map((row) => row.assignmentId),
        ),
      ),
    db
      .select({ id: trackTable.id, name: trackTable.name })
      .from(trackTable)
      .where(eq(trackTable.eventId, ctx.eventId)),
    db
      .select({ id: sessionFormat.id, name: sessionFormat.name })
      .from(sessionFormat)
      .where(eq(sessionFormat.eventId, ctx.eventId)),
  ]);

  const scoresByAssignment = new Map<string, ScoreValue[]>();
  for (const entry of scoreRows) {
    const list = scoresByAssignment.get(entry.assignmentId) ?? [];
    list.push({ criterionId: entry.criterionId, value: entry.value });
    scoresByAssignment.set(entry.assignmentId, list);
  }

  const trackNames = new Map(tracks.map((row) => [row.id, row.name]));
  const formatNames = new Map(formats.map((row) => [row.id, row.name]));
  const authorHidden = hidesAuthorship(round, ctx);

  const all: ReviewerAssignmentRow[] = rows.map((row) => {
    const aggregate = aggregateScorecard(criteria, scoresByAssignment.get(row.assignmentId) ?? []);
    const built: ReviewerAssignmentRow = {
      assignmentId: row.assignmentId,
      submissionId: row.submissionId,
      ref: row.ref,
      displayRef: formatRef('submission', row.ref),
      title: row.title,
      trackName: row.trackId ? (trackNames.get(row.trackId) ?? null) : null,
      formatName: row.formatId ? (formatNames.get(row.formatId) ?? null) : null,
      level: row.level,
      status: row.status,
      comment: row.comment,
      completedAt: row.completedAt,
      submitterName: row.submitterName ?? row.submitterEmail,
      average: aggregate.average,
      scoredCount: aggregate.scoredCount,
    };
    return authorHidden
      ? { ...built, submitterName: ANONYMOUS_AUTHOR }
      : built;
  });

  const active = all.filter((row) => row.status !== 'declined');

  return {
    round,
    rounds,
    criteria,
    authorHidden,
    // Unscored first: the point of the dashboard is the work that is left.
    assignments: [...active].sort(
      (a, b) => Number(a.status === 'completed') - Number(b.status === 'completed') || a.ref - b.ref,
    ),
    recused: all.filter((row) => row.status === 'declined'),
    pendingCount: active.filter((row) => row.status !== 'completed').length,
    completedCount: active.filter((row) => row.status === 'completed').length,
  };
}

/**
 * The detail a reviewer is allowed to open. Assignment is the gate: `submission:read_all` lets a
 * reviewer read the queue, but it does not entitle them to score a submission nobody gave them.
 */
export async function loadAssignedReview(
  ctx: EventContext,
  submissionId: string,
  roundId?: string | null,
): Promise<SubmissionReview> {
  requireCapability(ctx, 'submission:review');
  const round = await resolveRound(ctx, roundId ?? null);
  if (!round) throw notFound('A review round');

  if (!can(ctx, 'submission:decide')) {
    const assignment = await getDb().query.reviewAssignment.findFirst({
      where: and(
        eq(reviewAssignment.reviewRoundId, round.id),
        eq(reviewAssignment.submissionId, submissionId),
        eq(reviewAssignment.reviewerUserId, ctx.actor.userId),
      ),
    });
    if (!assignment) throw forbidden('That submission is not assigned to you');
    if (assignment.status === 'declined') {
      throw forbidden('You recused yourself from this submission');
    }
  }

  return loadSubmissionReview(ctx, submissionId, round.id);
}

export type RoundAssignmentRow = {
  assignmentId: string;
  submissionId: string;
  displayRef: string;
  title: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerEmail: string;
  status: AssignmentStatus;
  comment: string | null;
  completedAt: Date | null;
};

/** Assignment-level detail for the organizer, which is where a recusal has to become visible. */
export async function listRoundAssignments(
  ctx: EventContext,
  roundId: string,
  statuses?: AssignmentStatus[],
): Promise<RoundAssignmentRow[]> {
  requireCapability(ctx, 'submission:review');
  await requireRound(ctx, roundId);

  const rows = await getDb()
    .select({
      assignmentId: reviewAssignment.id,
      submissionId: submission.id,
      ref: submission.ref,
      title: submission.title,
      reviewerUserId: user.id,
      reviewerName: user.name,
      reviewerEmail: user.email,
      status: reviewAssignment.status,
      comment: reviewAssignment.comment,
      completedAt: reviewAssignment.completedAt,
    })
    .from(reviewAssignment)
    .innerJoin(submission, eq(submission.id, reviewAssignment.submissionId))
    .innerJoin(user, eq(user.id, reviewAssignment.reviewerUserId))
    .where(eq(reviewAssignment.reviewRoundId, roundId))
    .orderBy(asc(submission.ref));

  return rows
    .filter((row) => !statuses || statuses.includes(row.status))
    .map((row) => ({
      assignmentId: row.assignmentId,
      submissionId: row.submissionId,
      displayRef: formatRef('submission', row.ref),
      title: row.title,
      reviewerUserId: row.reviewerUserId,
      reviewerName: row.reviewerName ?? row.reviewerEmail,
      reviewerEmail: row.reviewerEmail,
      status: row.status,
      comment: row.comment,
      completedAt: row.completedAt,
    }));
}

// ---------------------------------------------------------------------------
// Reviewer reminders — `ABS-08`
// ---------------------------------------------------------------------------

export type OutstandingReviewer = {
  reviewerUserId: string;
  name: string;
  email: string;
  outstanding: Array<{ displayRef: string; title: string }>;
};

export type ReminderOutcome = {
  reviewers: number;
  assignments: number;
  sent: number;
  failed: number;
  logIds: string[];
};

/** Who still owes this round a score, and which submissions they owe it on. */
export async function outstandingReviewers(
  ctx: EventContext,
  roundId: string,
): Promise<OutstandingReviewer[]> {
  const pending = await listRoundAssignments(ctx, roundId, ['pending']);

  const byReviewer = new Map<string, OutstandingReviewer>();
  for (const row of pending) {
    const entry = byReviewer.get(row.reviewerUserId) ?? {
      reviewerUserId: row.reviewerUserId,
      name: row.reviewerName,
      email: row.reviewerEmail,
      outstanding: [],
    };
    entry.outstanding.push({ displayRef: row.displayRef, title: row.title });
    byReviewer.set(row.reviewerUserId, entry);
  }

  return [...byReviewer.values()].sort(
    (a, b) => b.outstanding.length - a.outstanding.length || a.name.localeCompare(b.name),
  );
}

export function reminderBody(
  reviewer: OutstandingReviewer,
  round: Pick<ReviewRoundRecord, 'name' | 'closesAt'>,
  link: string,
  note?: string | null,
): string {
  const count = reviewer.outstanding.length;
  const lines = [
    `Hi ${reviewer.name},`,
    '',
    `You have ${count} submission${count === 1 ? '' : 's'} still waiting for your score in **${round.name}**.`,
    '',
    ...reviewer.outstanding.map((row) => `- ${row.displayRef} — ${row.title}`),
    '',
    `[Open your review queue](${link})`,
  ];
  if (round.closesAt) {
    lines.push('', `The round closes on ${round.closesAt.toISOString().slice(0, 10)}.`);
  }
  if (note?.trim()) lines.push('', note.trim());
  return lines.join('\n');
}

/**
 * `ABS-08`. One message per reviewer listing exactly what they still owe, through the same
 * `sendMail` path as everything else — so the send lands in `email_log` and is readable at
 * `/admin/mail` whether or not the transport delivered it.
 */
export async function remindOutstandingReviewers(
  ctx: EventContext,
  roundId: string,
  options: { reviewerUserIds?: string[]; note?: string | null } = {},
): Promise<ReminderOutcome> {
  requireCapability(ctx, 'comms:send');
  const round = await requireRound(ctx, roundId);

  const all = await outstandingReviewers(ctx, roundId);
  const targets = options.reviewerUserIds?.length
    ? all.filter((reviewer) => options.reviewerUserIds?.includes(reviewer.reviewerUserId))
    : all;

  if (targets.length === 0) {
    throw invalid('Every reviewer on this round has finished. There is nothing to remind them of.');
  }

  const { branding } = await loadCommsContext(ctx.eventId);
  const link = `${appUrl()}/review?round=${round.id}`;
  const outcome: ReminderOutcome = {
    reviewers: targets.length,
    assignments: targets.reduce((sum, reviewer) => sum + reviewer.outstanding.length, 0),
    sent: 0,
    failed: 0,
    logIds: [],
  };

  for (const reviewer of targets) {
    const body = reminderBody(reviewer, round, link, options.note);
    const result = await sendMail({
      to: reviewer.email,
      subject: `${reviewer.outstanding.length} review${reviewer.outstanding.length === 1 ? '' : 's'} outstanding — ${round.name}`,
      html: wrapInBranding(branding, renderMarkdown(body)),
      text: markdownToText(body),
      eventId: ctx.eventId,
      templateKey: 'review.reminder',
    });

    outcome.logIds.push(result.id);
    if (result.sent) outcome.sent += 1;
    else outcome.failed += 1;
  }

  return outcome;
}
