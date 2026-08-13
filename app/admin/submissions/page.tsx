import { aiReviewEnabled } from '../../../lib/ai/review';
import { can } from '../../../lib/context';
import * as review from '../../../lib/services/review';
import { reviewContext } from './context';
import { SubmissionQueue, type QueueRowWire } from './SubmissionQueue';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Submissions · Cicero' };

const SORTS: review.QueueSort[] = [
  'score_desc',
  'score_asc',
  'ref_asc',
  'ref_desc',
  'title_asc',
  'newest',
];

type Search = {
  tab?: string;
  sort?: string;
  track?: string;
  format?: string;
  tag?: string;
  q?: string;
  round?: string;
};

function resolveTab(value: string | undefined): string {
  return review.STATUS_TABS.some((tab) => tab.id === value) ? (value as string) : 'pending';
}

function resolveSort(value: string | undefined): review.QueueSort {
  return SORTS.includes(value as review.QueueSort) ? (value as review.QueueSort) : 'score_desc';
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [ctx, params] = await Promise.all([reviewContext(), searchParams]);

  const tab = resolveTab(params.tab);
  const sort = resolveSort(params.sort);
  const trackId = params.track ?? '';
  const formatId = params.format ?? '';
  const tagId = params.tag ?? '';
  const search = params.q ?? '';

  const [rounds, savedViews, bundle] = await Promise.all([
    review.listRounds(ctx),
    review.listSavedViews(ctx),
    review.loadQueue(ctx, {
      ...review.filtersForTab(tab),
      trackId: trackId || null,
      formatId: formatId || null,
      tagId: tagId || null,
      search: search || null,
      sort,
      roundId: params.round || null,
    }),
  ]);

  const rows: QueueRowWire[] = bundle.rows.map((row) => ({
    id: row.id,
    ref: row.ref,
    displayRef: row.displayRef,
    title: row.title,
    status: row.status,
    trackId: row.trackId,
    trackName: row.trackName,
    formatId: row.formatId,
    formatName: row.formatName,
    tagIds: row.tagIds,
    submitterName: row.submitterName,
    averageScore: row.averageScore,
    spread: row.spread,
    assignedCount: row.assignedCount,
    completedCount: row.completedCount,
    hasAiReview: row.hasAiReview,
  }));

  return (
    <SubmissionQueue
      rows={rows}
      counts={bundle.counts}
      tabs={review.STATUS_TABS.map((entry) => ({
        id: entry.id,
        label: entry.label,
        hint: entry.hint ?? null,
      }))}
      tab={tab}
      sort={sort}
      trackId={trackId}
      formatId={formatId}
      tagId={tagId}
      search={search}
      tracks={bundle.tracks}
      formats={bundle.formats}
      tags={bundle.tags}
      rounds={rounds.map((round) => ({ id: round.id, name: round.name, status: round.status }))}
      roundId={bundle.round?.id ?? null}
      canDecide={can(ctx, 'submission:decide')}
      aiEnabled={aiReviewEnabled()}
      savedViews={savedViews.map((view) => ({
        id: view.id,
        name: view.name,
        filters: view.filters,
      }))}
    />
  );
}
