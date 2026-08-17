import { describe, expect, it } from 'vitest';
import { resolveWindow, unavailabilityInputSchema } from './speaker-availability';

/**
 * `AD-2`, the write side. Only the pure half is covered here — the database half is a `.sql` file
 * test under `db/migrations/`, because CI has no Postgres. What matters in this half is that the
 * wall clock a speaker types becomes exactly one instant, and that the blank fields mean what the
 * portal tells the speaker they mean.
 */
describe('resolveWindow', () => {
  const ROME = 'Europe/Rome';
  const LA = 'America/Los_Angeles';

  it('turns a wall clock into an instant in the stated zone', () => {
    const { startsAt, endsAt } = resolveWindow({
      startDate: '2026-10-12',
      startTime: '09:00',
      endDate: '',
      endTime: '12:00',
      timezone: ROME,
    });
    // CEST is UTC+2 on 12 October 2026.
    expect(startsAt.toISOString()).toBe('2026-10-12T07:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-10-12T10:00:00.000Z');
  });

  /** The same numbers in two zones are two different windows. That is the entire point of the field. */
  it('produces different instants for the same wall clock in different zones', () => {
    const input = { startDate: '2026-10-12', startTime: '09:00', endTime: '12:00' };
    const rome = resolveWindow({ ...input, timezone: ROME });
    const losAngeles = resolveWindow({ ...input, timezone: LA });
    expect(losAngeles.startsAt.getTime() - rome.startsAt.getTime()).toBe(9 * 3_600_000);
  });

  /**
   * A blank end time is the *end* of the day, and the end of a half-open day is the next midnight —
   * not 23:59, which would leave a one-minute hole a session could technically be scheduled into.
   */
  it('reads blank times as the whole day, ending at the next midnight', () => {
    const { startsAt, endsAt } = resolveWindow({
      startDate: '2026-10-12',
      startTime: '',
      endDate: '',
      endTime: '',
      timezone: ROME,
    });
    expect(startsAt.toISOString()).toBe('2026-10-11T22:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-10-12T22:00:00.000Z');
    expect(endsAt.getTime() - startsAt.getTime()).toBe(24 * 3_600_000);
  });

  it('reads a blank end date as the same day', () => {
    const sameDay = resolveWindow({
      startDate: '2026-10-12',
      startTime: '09:00',
      endTime: '12:00',
      timezone: ROME,
    });
    const spelledOut = resolveWindow({
      startDate: '2026-10-12',
      startTime: '09:00',
      endDate: '2026-10-12',
      endTime: '12:00',
      timezone: ROME,
    });
    expect(sameDay).toEqual(spelledOut);
  });

  it('spans multiple days when an end date is given', () => {
    const { startsAt, endsAt } = resolveWindow({
      startDate: '2026-10-12',
      endDate: '2026-10-14',
      timezone: ROME,
    });
    expect(endsAt.getTime() - startsAt.getTime()).toBe(3 * 24 * 3_600_000);
  });

  /**
   * The bug nobody finds until the conference is in November: 1 Nov 2026 is 25 hours long in Los
   * Angeles. An all-day window there is 25 hours, not 24, and a speaker who said "I am away all
   * day" means the whole of the day that actually happened.
   */
  it('covers the real length of a day on a DST changeover', () => {
    const { startsAt, endsAt } = resolveWindow({ startDate: '2026-11-01', timezone: LA });
    expect(endsAt.getTime() - startsAt.getTime()).toBe(25 * 3_600_000);
  });
});

describe('unavailabilityInputSchema', () => {
  it('requires a start date in day-key form', () => {
    expect(unavailabilityInputSchema.safeParse({ startDate: '', timezone: 'UTC' }).success).toBe(
      false,
    );
    expect(
      unavailabilityInputSchema.safeParse({ startDate: '12/10/2026', timezone: 'UTC' }).success,
    ).toBe(false);
    expect(
      unavailabilityInputSchema.safeParse({ startDate: '2026-10-12', timezone: 'UTC' }).success,
    ).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const parsed = unavailabilityInputSchema.safeParse({
      startDate: '2026-10-12',
      endDate: '2026-10-11',
      timezone: 'UTC',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].path).toEqual(['endDate']);
  });

  it('accepts the blank optional fields the portal sends for an all-day window', () => {
    const parsed = unavailabilityInputSchema.safeParse({
      startDate: '2026-10-12',
      startTime: '',
      endDate: '',
      endTime: '',
      note: '',
      timezone: 'UTC',
    });
    expect(parsed.success).toBe(true);
  });

  it('keeps the note short enough to read on a conflict row', () => {
    const parsed = unavailabilityInputSchema.safeParse({
      startDate: '2026-10-12',
      note: 'x'.repeat(281),
      timezone: 'UTC',
    });
    expect(parsed.success).toBe(false);
  });
});
