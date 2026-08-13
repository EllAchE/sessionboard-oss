import { aiModelConfigured } from '../../../../lib/ai/notice';
import { aiReviewEnabled } from '../../../../lib/ai/review';
import { can } from '../../../../lib/context';
import { renderMarkdown } from '../../../../lib/markdown';
import * as review from '../../../../lib/services/review';
import { reviewContext } from '../context';
import { ReviewDetail } from './ReviewDetail';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Review submission · Cicero' };

type Search = {
  tab?: string;
  sort?: string;
  track?: string;
  format?: string;
  tag?: string;
  q?: string;
  round?: string;
};

const SORTS: review.QueueSort[] = [
  'score_desc',
  'score_asc',
  'ref_asc',
  'ref_desc',
  'title_asc',
  'newest',
];

function queryString(params: Search): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value) search.set(key, value);
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : '';
}

/** Answers are speaker-authored and of unknown shape; they render as text, never as markup. */
function answerEntries(
  answers: Record<string, unknown>,
  labels: Record<string, string>,
): Array<{ key: string; label: string; value: string }> {
  return Object.entries(answers)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      label: labels[key] ?? key,
      value: Array.isArray(value)
        ? value.map((entry) => String(entry)).join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
    }));
}

export default async function SubmissionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<Search>;
}) {
  const [ctx, { submissionId }, search] = await Promise.all([
    reviewContext(),
    params,
    searchParams,
  ]);

  const tab = review.STATUS_TABS.some((entry) => entry.id === search.tab)
    ? (search.tab as string)
    : 'pending';
  const sort = SORTS.includes(search.sort as review.QueueSort)
    ? (search.sort as review.QueueSort)
    : 'score_desc';

  const filters: review.QueueFilters = {
    ...review.filtersForTab(tab),
    trackId: search.track || null,
    formatId: search.format || null,
    tagId: search.tag || null,
    search: search.q || null,
    sort,
    roundId: search.round || null,
  };
  const canDecide = can(ctx, 'submission:decide');
  const availableReviewerRequest = canDecide
    ? review.listReviewers(ctx)
    : Promise.resolve([] as review.ReviewerRow[]);

  const [detail, queue, availableReviewers] = await Promise.all([
    review.loadSubmissionReview(ctx, submissionId, search.round || null),
    review.loadQueue(ctx, filters),
    availableReviewerRequest,
  ]);

  // A link opened outside the queue's current tab still deserves working j/k, so fall back to the
  // full list rather than stranding the reviewer on an island.
  let siblings = queue.rows;
  if (!siblings.some((row) => row.id === submissionId)) {
    const wide = await review.loadQueue(ctx, { ...filters, statuses: [] });
    if (wide.rows.some((row) => row.id === submissionId)) siblings = wide.rows;
  }

  const index = siblings.findIndex((row) => row.id === submissionId);
  const suffix = queryString(search);
  const hrefFor = (offset: number): string | null => {
    if (index < 0) return null;
    const target = siblings[index + offset];
    return target ? `/admin/submissions/${target.id}${suffix}` : null;
  };

  const averageByAssignment = new Map(
    detail.summary.perReviewer.map((entry) => [entry.assignmentId, entry.aggregate.average]),
  );
  const myAggregate = review.aggregateScorecard(detail.criteria, detail.myScores);
  const myReviewer = detail.reviewers.find(
    (reviewer) => reviewer.reviewerUserId === ctx.actor.userId,
  );

  return (
    <ReviewDetail
      submissionId={detail.id}
      displayRef={detail.displayRef}
      title={detail.title}
      status={detail.status}
      descriptionHtml={renderMarkdown(detail.descriptionMarkdown)}
      level={detail.level}
      trackName={detail.trackName}
      formatName={detail.formatName}
      tags={detail.tags}
      answers={answerEntries(detail.answers, detail.answerLabels)}
      submittedAt={detail.submittedAt ? detail.submittedAt.toISOString() : null}
      decidedAt={detail.decidedAt ? detail.decidedAt.toISOString() : null}
      decisionNote={detail.decisionNote}
      submitterName={detail.submitterName}
      submitterEmail={detail.submitterEmail}
      speakers={detail.speakers.map((speaker) => ({
        participantId: speaker.participantId,
        name: speaker.name,
        email: speaker.email,
        jobTitle: speaker.jobTitle,
        company: speaker.company,
        bioHtml: renderMarkdown(speaker.bioMarkdown),
        isPrimary: speaker.isPrimary,
      }))}
      round={
        detail.round
          ? {
              id: detail.round.id,
              name: detail.round.name,
              status: detail.round.status,
              blindUntilClose: detail.round.blindUntilClose,
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
      myScores={detail.myScores.map((entry) => ({
        criterionId: entry.criterionId,
        value: entry.value,
      }))}
      myComment={detail.myComment}
      mySubmitted={myReviewer?.status === 'completed'}
      myAverage={myAggregate.average}
      reviewers={detail.reviewers.map((reviewer) => ({
        assignmentId: reviewer.assignmentId,
        reviewerUserId: reviewer.reviewerUserId,
        reviewerName: reviewer.reviewerName,
        status: reviewer.status,
        comment: reviewer.comment,
        completedAt: reviewer.completedAt ? reviewer.completedAt.toISOString() : null,
        average: averageByAssignment.get(reviewer.assignmentId) ?? null,
        isMe: reviewer.reviewerUserId === ctx.actor.userId,
      }))}
      availableReviewers={availableReviewers.map((reviewer) => ({
        userId: reviewer.userId,
        name: reviewer.name,
        email: reviewer.email,
      }))}
      summary={{
        average: detail.summary.average,
        spread: detail.summary.spread,
        assignedCount: detail.summary.assignedCount,
        completedCount: detail.summary.completedCount,
        scoredCount: detail.summary.scoredCount,
      }}
      blinded={detail.blinded}
      ai={
        detail.ai
          ? {
              id: detail.ai.id,
              model: detail.ai.model,
              rationaleHtml: renderMarkdown(detail.ai.rationaleMarkdown),
              criterionScores: detail.ai.criterionScores,
              createdAt: detail.ai.createdAt.toISOString(),
            }
          : null
      }
      aiEnabled={aiReviewEnabled()}
      aiModelConfigured={aiModelConfigured()}
      canDecide={canDecide}
      prevHref={hrefFor(-1)}
      nextHref={hrefFor(1)}
      position={index >= 0 ? index + 1 : null}
      total={siblings.length}
      backHref={`/admin/submissions${suffix}`}
    />
  );
}
