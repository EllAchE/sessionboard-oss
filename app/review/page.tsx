import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import * as review from '@/lib/services/review';
import { reviewerSession } from './context';
import { ReviewerDashboard } from './ReviewerDashboard';
import type { AssignmentWire, RoundWire } from './types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your deliberations · Cicero' };

function toWire(row: review.ReviewerAssignmentRow): AssignmentWire {
  return {
    assignmentId: row.assignmentId,
    submissionId: row.submissionId,
    displayRef: row.displayRef,
    title: row.title,
    trackName: row.trackName,
    formatName: row.formatName,
    level: row.level,
    status: row.status,
    comment: row.comment,
    submitterName: row.submitterName,
    average: row.average,
  };
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const session = await reviewerSession();
  if (!session) {
    const actor = await currentActor();
    redirect(actor ? '/' : '/signin?next=/review');
  }

  const params = await searchParams;
  const queue = await review.loadReviewerQueue(session.ctx, params.round ?? null);

  const rounds: RoundWire[] = queue.rounds.map((round) => ({
    id: round.id,
    name: round.name,
    status: round.status,
    blindUntilClose: round.blindUntilClose,
    anonymized: round.anonymized,
  }));

  return (
    <ReviewerDashboard
      eventName={session.event.name}
      round={rounds.find((round) => round.id === queue.round?.id) ?? null}
      rounds={rounds}
      authorHidden={queue.authorHidden}
      criterionCount={queue.criteria.length}
      assignments={queue.assignments.map(toWire)}
      recused={queue.recused.map(toWire)}
      pendingCount={queue.pendingCount}
      completedCount={queue.completedCount}
    />
  );
}
