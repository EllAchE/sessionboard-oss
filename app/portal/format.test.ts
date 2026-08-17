import { describe, expect, it } from 'vitest';
import { zonedTimeToUtc } from '@/lib/services/schedule';
import { formatUnavailabilityWindow, profileGapSummary } from './format';

describe('profileGapSummary', () => {
  it('uses complete, singular, and plural profile copy', () => {
    expect(profileGapSummary(0)).toBe('Your profile is complete');
    expect(profileGapSummary(1)).toBe('1 thing left');
    expect(profileGapSummary(2)).toBe('2 things left');
  });
});

/**
 * `AD-2`. The round trip that has to hold: whatever wall clock a speaker typed, the window they read
 * back says the same thing. Every case here authors through `zonedTimeToUtc` exactly as the portal
 * action does, so the assertion is on the pair of conversions rather than on either one alone.
 */
describe('formatUnavailabilityWindow', () => {
  const ROME = 'Europe/Rome';
  const LA = 'America/Los_Angeles';

  function authored(dayKey: string, from: number, to: number, timezone: string, endDay = dayKey) {
    return [zonedTimeToUtc(dayKey, from, timezone), zonedTimeToUtc(endDay, to, timezone)] as const;
  }

  it('reads a part-day window back as the hours the speaker typed', () => {
    const [start, end] = authored('2026-10-12', 9 * 60, 12 * 60, ROME);
    expect(formatUnavailabilityWindow(start, end, ROME)).toBe('Oct 12, 2026, 09:00–12:00');
  });

  /** Half-open means an all-day block ends at the next local midnight; it must not read as two days. */
  it('collapses a midnight-to-midnight window into a single all-day label', () => {
    const [start, end] = authored('2026-10-12', 0, 24 * 60, ROME);
    expect(formatUnavailabilityWindow(start, end, ROME)).toBe('All day, Oct 12, 2026');
  });

  it('labels a multi-day absence by its two ends', () => {
    const [start, end] = authored('2026-10-12', 0, 24 * 60, ROME, '2026-10-14');
    expect(formatUnavailabilityWindow(start, end, ROME)).toBe(
      'Oct 12, 2026 – Oct 14, 2026, all day',
    );
  });

  it('spells out both ends when a window crosses midnight part-way', () => {
    const [start, end] = authored('2026-10-12', 22 * 60, 6 * 60, ROME, '2026-10-13');
    expect(formatUnavailabilityWindow(start, end, ROME)).toBe(
      'Oct 12, 2026 22:00 – Oct 13, 2026 06:00',
    );
  });

  /**
   * The load-bearing one. The same instant is a Roman morning and a Californian small hours, and a
   * speaker must be shown the one they authored — showing them the other makes a correctly stored
   * window look wrong and invites them to "fix" it into a genuinely wrong one.
   */
  it('renders in the authoring zone rather than any other', () => {
    const [start, end] = authored('2026-10-12', 9 * 60, 12 * 60, ROME);
    expect(formatUnavailabilityWindow(start, end, ROME)).toBe('Oct 12, 2026, 09:00–12:00');
    expect(formatUnavailabilityWindow(start, end, LA)).toBe('Oct 12, 2026, 00:00–03:00');
  });

  /** Authored on the day US DST ends, so the two ends sit on different UTC offsets. */
  it('survives a window spanning a DST changeover', () => {
    const [start, end] = authored('2026-10-31', 20 * 60, 10 * 60, LA, '2026-11-01');
    expect(formatUnavailabilityWindow(start, end, LA)).toBe(
      'Oct 31, 2026 20:00 – Nov 1, 2026 10:00',
    );
  });
});
