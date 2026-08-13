import { describe, expect, it } from 'vitest';
import {
  assertRoundDateOrder,
  describeRoundDates,
  fromRoundDateDraft,
  roundDatesAreOutOfOrder,
  toRoundDateDraft,
} from './review-round-dates';

describe('review round dates', () => {
  it('round-trips created and edited browser-local values through persisted ISO instants', () => {
    const created = fromRoundDateDraft({
      opensAt: '2026-09-01T09:30',
      closesAt: '2026-09-15T17:00',
    });
    expect(toRoundDateDraft(created)).toEqual({
      opensAt: '2026-09-01T09:30',
      closesAt: '2026-09-15T17:00',
    });

    const edited = fromRoundDateDraft({
      ...toRoundDateDraft(created),
      closesAt: '2026-09-16T18:15',
    });
    expect(toRoundDateDraft(edited).closesAt).toBe('2026-09-16T18:15');
  });

  it('rejects a close date that is equal to or before the open date', () => {
    expect(roundDatesAreOutOfOrder('2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z')).toBe(true);
    expect(roundDatesAreOutOfOrder('2026-09-01T10:00:00Z', '2026-09-01T09:59:00Z')).toBe(true);
    expect(roundDatesAreOutOfOrder('2026-09-01T10:00:00Z', '2026-09-01T10:01:00Z')).toBe(false);
    expect(() =>
      assertRoundDateOrder('2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z'),
    ).toThrow('The close date has to come after the open date');
  });

  it('restores persisted values for inputs and a readable summary', () => {
    const stored = fromRoundDateDraft({
      opensAt: '2026-10-03T08:45',
      closesAt: '2026-10-10T17:30',
    });
    const reloaded = toRoundDateDraft(stored);

    expect(reloaded).toEqual({ opensAt: '2026-10-03T08:45', closesAt: '2026-10-10T17:30' });
    expect(describeRoundDates(stored)).toMatch(/^Opens .+ · Closes .+$/);
  });
});
