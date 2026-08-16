import { describe, expect, it } from 'vitest';
import { buildScheduleCalendar, calendarEventFor } from './calendar';
import type { PublicEvent, PublicSession } from './model';

/**
 * The multi-session download used to mint its own `${session.id}@cicero.events` UID at a hardcoded
 * `SEQUENCE:0`, which made it a second, unrelated calendar identity for a session the speaker
 * invite and the `C-3a` per-session download already name by `scheduled_session.ics_uid`. These
 * assert the one identity, because the failure mode is invisible in the app and only shows up as a
 * duplicate entry inside somebody's calendar client.
 */

const EVENT: PublicEvent = {
  id: 'event-1',
  slug: 'orator-2026',
  name: 'Orator 2026',
  tagline: null,
  timezone: 'UTC',
  startsOn: '2026-09-08',
  endsOn: '2026-09-09',
  websiteUrl: 'https://cicero.events/e/orator-2026',
  venueName: 'The Forum',
};

function session(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    id: 'session-1',
    ref: 12,
    title: 'On duties in public life',
    descriptionHtml: '<p>Practical ethics.</p>',
    descriptionText: 'Practical ethics.',
    descriptionExcerpt: 'Practical ethics.',
    startsAt: '2026-09-08T14:00:00.000Z',
    endsAt: '2026-09-08T15:00:00.000Z',
    room: 'Curia',
    track: 'Leadership',
    trackId: 'track-1',
    format: 'Talk',
    ceuCredits: null,
    icsUid: '4a1f-canonical@cicero.events',
    icsSequence: 0,
    tags: [],
    speakers: [],
    ...overrides,
  };
}

/** Reverses RFC 5545 folding, so an assertion is about content rather than line width. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').replace(/\r\n$/, '').split('\r\n');
}

function linesStartingWith(ics: string, prefix: string): string[] {
  return unfold(ics).filter((line) => line.startsWith(prefix));
}

describe('calendarEventFor', () => {
  it('carries the stored ics_uid rather than minting one from the row id', () => {
    const built = calendarEventFor(session(), EVENT);

    expect(built.uid).toBe('4a1f-canonical@cicero.events');
    expect(built.uid).not.toContain('session-1');
  });

  it('carries the stored sequence so a revision supersedes the copy already on the calendar', () => {
    expect(calendarEventFor(session({ icsSequence: 3 }), EVENT).sequence).toBe(3);
  });
});

describe('buildScheduleCalendar', () => {
  it('gives every VEVENT its own canonical UID and SEQUENCE', () => {
    const ics = buildScheduleCalendar(
      [
        session(),
        session({
          id: 'session-2',
          title: 'On the orator',
          icsUid: 'b77c-canonical@cicero.events',
          icsSequence: 2,
          startsAt: '2026-09-08T16:00:00.000Z',
          endsAt: '2026-09-08T17:00:00.000Z',
        }),
      ],
      EVENT,
    );

    expect(linesStartingWith(ics, 'UID:')).toEqual([
      'UID:4a1f-canonical@cicero.events',
      'UID:b77c-canonical@cicero.events',
    ]);
    expect(linesStartingWith(ics, 'SEQUENCE:')).toEqual(['SEQUENCE:0', 'SEQUENCE:2']);
    expect(unfold(ics).filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('agrees with the per-session download on the identity of the same session', () => {
    const one = session({ icsSequence: 5 });
    const bundled = buildScheduleCalendar([one, session({ id: 'session-2', icsUid: 'other@cicero.events' })], EVENT);
    const single = buildScheduleCalendar([one], EVENT);

    const identityOf = (ics: string) =>
      unfold(ics).filter((line) => line.startsWith('UID:') || line.startsWith('SEQUENCE:'))[0];

    expect(identityOf(single)).toBe('UID:4a1f-canonical@cicero.events');
    expect(linesStartingWith(bundled, 'UID:')).toContain('UID:4a1f-canonical@cicero.events');
    expect(linesStartingWith(bundled, 'SEQUENCE:')).toContain('SEQUENCE:5');
  });

  it('skips undated sessions and returns nothing when none are dated', () => {
    expect(buildScheduleCalendar([session({ startsAt: null })], EVENT)).toBe('');
    expect(
      linesStartingWith(
        buildScheduleCalendar([session(), session({ id: 'session-2', startsAt: null })], EVENT),
        'UID:',
      ),
    ).toEqual(['UID:4a1f-canonical@cicero.events']);
  });
});
