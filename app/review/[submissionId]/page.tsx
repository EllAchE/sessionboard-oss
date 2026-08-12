import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import { renderMarkdown } from '@/lib/markdown';
import * as review from '@/lib/services/review';
import { reviewerSession } from '../context';
import { ReviewerScorecard } from './ReviewerScorecard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Score a submission · Cicero' };

export default async function ReviewerSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const session = await reviewerSession();
  if (!session) {
    const actor = await currentActor();
    redirect(actor ? '/' : '/signin?next=/review');
  }

  const [{ submissionId }, query] = await Promise.all([params, searchParams]);

  let detail: review.SubmissionReview;
  try {
    detail = await review.loadAssignedReview(session.ctx, submissionId, query.round ?? null);
  } catch {
    // An unassigned submission is not theirs to know about, so this is a 404 rather than a 403.
    notFound();
  }

  const queue = await review.loadReviewerQueue(session.ctx, detail.round?.id ?? null);
  const order = queue.assignments.map((row) => row.submissionId);
  const position = order.indexOf(submissionId);
  const href = (index: number) =>
    index >= 0 && index < order.length ? `/review/${order[index]}` : null;

  return (
    <ReviewerScorecard
      submissionId={detail.id}
      displayRef={detail.displayRef}
      title={detail.title}
      descriptionHtml={renderMarkdown(detail.descriptionMarkdown)}
      status={detail.status}
      level={detail.level}
      trackName={detail.trackName}
      formatName={detail.formatName}
      tags={detail.tags}
      answers={Object.entries(detail.answers).map(([key, value]) => ({
        key,
        label: detail.answerLabels[key] ?? key,
        value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
      }))}
      authorHidden={detail.authorHidden}
      submitterName={detail.submitterName}
      speakers={detail.speakers.map((speaker) => ({
        participantId: speaker.participantId,
        name: speaker.name,
        affiliation: [speaker.jobTitle, speaker.company].filter(Boolean).join(', '),
        bioHtml: renderMarkdown(speaker.bioMarkdown),
      }))}
      round={
        detail.round
          ? {
              id: detail.round.id,
              name: detail.round.name,
              status: detail.round.status,
              blindUntilClose: detail.round.blindUntilClose,
              anonymized: detail.round.anonymized,
            }
          : null
      }
      criteria={detail.criteria.map((criterion) => ({
        id: criterion.id,
        label: criterion.label,
        description: criterion.description,
        weight: criterion.weight,
        maxScore: criterion.maxScore,
      }))}
      myScores={detail.myScores}
      myComment={detail.myComment}
      myAssignmentId={detail.myAssignmentId}
      mySubmitted={detail.myAssignmentStatus === 'completed'}
      blinded={detail.blinded}
      peerCount={detail.reviewers.filter((row) => row.reviewerUserId !== session.ctx.actor.userId).length}
      prevHref={position > 0 ? href(position - 1) : null}
      nextHref={position >= 0 ? href(position + 1) : null}
      position={position >= 0 ? position + 1 : null}
      total={order.length}
    />
  );
}
