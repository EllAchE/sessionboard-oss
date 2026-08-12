import * as review from '../../../../lib/services/review';
import { decideContext } from '../context';
import { RoundsManager, type RoundWire } from './RoundsManager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Review rounds · Cicero' };

export default async function ReviewRoundsPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const [ctx, params] = await Promise.all([decideContext(), searchParams]);

  const rounds = await review.listRounds(ctx);
  const selected =
    rounds.find((round) => round.id === params.round) ??
    rounds.find((round) => round.status === 'open') ??
    rounds[rounds.length - 1] ??
    null;

  // Per-round totals come from the same workload report the panel below renders, so the two can
  // never disagree about how much is outstanding.
  const workloads = await Promise.all(
    rounds.map(async (round) => ({
      roundId: round.id,
      rows: await review.reviewerWorkload(ctx, round.id),
    })),
  );

  const [reviewers, queue] = await Promise.all([
    review.listReviewers(ctx),
    review.loadQueue(ctx, {
      statuses: review.statusesForTab('pending'),
      roundId: selected?.id ?? null,
    }),
  ]);

  const [criteria, declined, outstanding] = await Promise.all([
    selected ? review.listCriteria(selected.id) : [],
    selected ? review.listRoundAssignments(ctx, selected.id, ['declined']) : [],
    selected ? review.outstandingReviewers(ctx, selected.id) : [],
  ]);

  const roundRows: RoundWire[] = rounds.map((round) => {
    const rows = workloads.find((entry) => entry.roundId === round.id)?.rows ?? [];
    return {
      id: round.id,
      name: round.name,
      status: round.status,
      blindUntilClose: round.blindUntilClose,
      anonymized: round.anonymized,
      assignedCount: rows.reduce((sum, row) => sum + row.assigned, 0),
      completedCount: rows.reduce((sum, row) => sum + row.completed, 0),
      declinedCount: round.id === selected?.id ? declined.length : 0,
    };
  });

  const selectedWorkload = selected
    ? (workloads.find((entry) => entry.roundId === selected.id)?.rows ?? [])
    : [];

  return (
    <RoundsManager
      rounds={roundRows}
      selectedRoundId={selected?.id ?? null}
      criteria={criteria.map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        description: criterion.description,
        weight: criterion.weight,
        maxScore: criterion.maxScore,
      }))}
      reviewers={reviewers.map((reviewer) => ({
        userId: reviewer.userId,
        name: reviewer.name,
        email: reviewer.email,
        roles: reviewer.roles,
      }))}
      workload={selectedWorkload.map((row) => ({
        reviewerUserId: row.reviewerUserId,
        name: row.name,
        email: row.email,
        assigned: row.assigned,
        completed: row.completed,
        pending: row.pending,
        averageGiven: row.averageGiven,
      }))}
      pendingSubmissionIds={queue.rows.map((row) => row.id)}
      recusals={declined.map((row) => ({
        assignmentId: row.assignmentId,
        displayRef: row.displayRef,
        title: row.title,
        reviewerName: row.reviewerName,
        reason: row.comment,
      }))}
      outstandingReviewerCount={outstanding.length}
    />
  );
}
