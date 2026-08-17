export type RoutingRuleWire = {
  trackId: string;
  trackName: string;
  reviewerUserIds: string[];
  pendingCount: number;
};

export type RoutingWire = {
  configured: boolean;
  rules: RoutingRuleWire[];
  untrackedPending: number;
};

/**
 * Mirrors `UnroutableReason` in `lib/services/review.ts`. It is restated here rather than imported
 * because this module is loaded by a client component and that one reaches the database; the test
 * beside this file asserts the two stay the same union.
 */
export type UnroutedReason =
  | 'no_track'
  | 'track_uncovered'
  | 'all_conflicted'
  | 'all_recused';

export const UNROUTED_REASON_LABEL: Record<UnroutedReason, string> = {
  no_track: 'No track on the submission',
  track_uncovered: 'No reviewer covers this track',
  all_conflicted: 'Everyone covering this track wrote it or speaks on it',
  // The only reason on this list an organizer can undo, so it says so rather than making them
  // hunt through coverage for a problem that is one click away in Recusals.
  all_recused: 'Everyone else covering this track has recused themselves. Clear one to reopen it',
};

export type UnroutedWire = {
  submissionId: string;
  displayRef: string;
  title: string;
  trackName: string | null;
  reason: UnroutedReason;
};

export type CoverageGap = { trackName: string; pendingCount: number };

/**
 * Tracks nobody covers. Reported whether or not anything is waiting behind them, because a track
 * added today is a gap tomorrow, and an organizer who only hears about it when submissions are
 * already stuck hears about it too late.
 */
export function coverageGaps(rules: RoutingRuleWire[]): CoverageGap[] {
  return rules
    .filter((rule) => rule.reviewerUserIds.length === 0)
    .map((rule) => ({ trackName: rule.trackName, pendingCount: rule.pendingCount }));
}

/** Pending submissions that routing cannot place as things stand. */
export function strandedCount(routing: RoutingWire): number {
  if (!routing.configured) return 0;
  return (
    coverageGaps(routing.rules).reduce((sum, gap) => sum + gap.pendingCount, 0) +
    routing.untrackedPending
  );
}

/** One line under the heading, in the same register as the rest of the review surface. */
export function coverageSummary(routing: RoutingWire): string {
  if (!routing.configured) {
    return 'No track is routed yet, so auto-assign draws on every reviewer you select. Cover a track and it becomes the rule for this event.';
  }

  const gaps = coverageGaps(routing.rules);
  const covered = routing.rules.length - gaps.length;
  const head = `${covered} of ${routing.rules.length} track${routing.rules.length === 1 ? '' : 's'} routed`;
  const stranded = strandedCount(routing);
  if (stranded === 0) return `${head}. Every waiting submission has a reviewer pool.`;
  return `${head}. ${stranded} waiting submission${stranded === 1 ? '' : 's'} cannot be routed yet.`;
}
