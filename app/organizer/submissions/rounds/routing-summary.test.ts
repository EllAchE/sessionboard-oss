import { describe, expect, it } from 'vitest';
import type { UnroutableReason } from '../../../../lib/services/review';
import {
  UNROUTED_REASON_LABEL,
  coverageGaps,
  coverageSummary,
  strandedCount,
  type RoutingWire,
  type UnroutedReason,
} from './routing-summary';

/**
 * The client copy of the reason union has to stay exactly the service's. Assignable in both
 * directions is the whole assertion; it costs nothing at runtime and fails the build on drift.
 */
type Mirrors<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const REASONS_MATCH: Mirrors<UnroutedReason, UnroutableReason> = true;

const rule = (over: Partial<RoutingWire['rules'][number]> & { trackId: string }) => ({
  trackName: over.trackId,
  reviewerUserIds: [],
  pendingCount: 0,
  ...over,
});

describe('routing coverage summary', () => {
  it('shares its reason vocabulary with the routing service', () => {
    expect(REASONS_MATCH).toBe(true);
  });

  it('points a recusal-stranded submission at the thing an organizer can actually undo', () => {
    // The other three reasons describe a configuration; this one describes a decision, and saying
    // so is the difference between an organizer clearing it and hunting through track coverage.
    expect(UNROUTED_REASON_LABEL.all_recused).toContain('recused');
    expect(UNROUTED_REASON_LABEL.all_recused).toContain('clear');
    expect(UNROUTED_REASON_LABEL.all_recused).not.toBe(UNROUTED_REASON_LABEL.all_conflicted);
  });

  it('names an uncovered track even when nothing is waiting behind it', () => {
    expect(coverageGaps([rule({ trackId: 'infra' }), rule({ trackId: 'law', reviewerUserIds: ['r1'] })])).toEqual([
      { trackName: 'infra', pendingCount: 0 },
    ]);
  });

  it('counts uncovered and untracked work as stranded', () => {
    const routing: RoutingWire = {
      configured: true,
      rules: [rule({ trackId: 'infra', pendingCount: 3 }), rule({ trackId: 'law', reviewerUserIds: ['r1'], pendingCount: 5 })],
      untrackedPending: 2,
    };
    expect(strandedCount(routing)).toBe(5);
    expect(coverageSummary(routing)).toContain('5 waiting submissions cannot be routed');
  });

  it('strands nothing while routing is unconfigured', () => {
    const routing: RoutingWire = {
      configured: false,
      rules: [rule({ trackId: 'infra', pendingCount: 3 })],
      untrackedPending: 2,
    };
    expect(strandedCount(routing)).toBe(0);
    expect(coverageSummary(routing)).toContain('every reviewer you select');
  });

  it('says so plainly when every waiting submission has a pool', () => {
    const routing: RoutingWire = {
      configured: true,
      rules: [rule({ trackId: 'infra', reviewerUserIds: ['r1'], pendingCount: 4 })],
      untrackedPending: 0,
    };
    expect(coverageSummary(routing)).toBe(
      '1 of 1 track routed. Every waiting submission has a reviewer pool.',
    );
  });
});
