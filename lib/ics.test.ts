import { describe, expect, it } from 'vitest';
import {
  buildCancellation,
  buildDownload,
  buildInvite,
  formatIcsDate,
  icsFilename,
  newIcsUid,
  readCalendarMethod,
  type CalendarEvent,
} from './ics';

/**
 * A malformed VCALENDAR renders as a plausible invite everywhere except inside the calendar client
 * that matters, so these assert bytes rather than behaviour.
 *
 * Goldens are written as *logical* lines and compared after unfolding, with folding checked
 * separately as an invariant. Both halves are hand-written: a golden captured from the
 * implementation's own output would agree with any bug the implementation already has.
 */

const STAMP = new Date('2026-08-11T09:00:00Z');

const BASE: CalendarEvent = {
  uid: 'sess-7@cicero.events',
  sequence: 0,
  summary: 'Rhetoric for engineers',
  startsAt: new Date('2026-09-14T17:00:00Z'),
  endsAt: new Date('2026-09-14T17:45:00Z'),
  description: 'A talk about persuasion.',
  location: 'Forum Hall',
  url: 'https://cicero.events/e/demo/sessions/SESS-7',
  organizer: { email: 'programme@cicero.events', name: 'Cicero Programme Team' },
  attendees: [{ email: 'marcus@example.com', name: 'Marcus Tullius' }],
  stamp: STAMP,
};

/** Reverses RFC 5545 folding: a CRLF followed by exactly one space is not content. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').replace(/\r\n$/, '').split('\r\n');
}

function octets(line: string): number {
  return new TextEncoder().encode(line).length;
}

const ATTENDEE_MARCUS =
  'ATTENDEE;CN=Marcus Tullius;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;' +
  'PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:marcus@example.com';

const ORGANIZER_LINE = 'ORGANIZER;CN=Cicero Programme Team:mailto:programme@cicero.events';

describe('the initial invitation', () => {
  const ics = buildInvite(BASE);

  it('matches the golden REQUEST', () => {
    expect(unfold(ics)).toEqual([
      'BEGIN:VCALENDAR',
      'PRODID:-//Cicero//Speaker Management//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:sess-7@cicero.events',
      'SEQUENCE:0',
      'DTSTAMP:20260811T090000Z',
      'DTSTART:20260914T170000Z',
      'DTEND:20260914T174500Z',
      'SUMMARY:Rhetoric for engineers',
      'DESCRIPTION:A talk about persuasion.',
      'LOCATION:Forum Hall',
      'URL:https://cicero.events/e/demo/sessions/SESS-7',
      ORGANIZER_LINE,
      ATTENDEE_MARCUS,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'LAST-MODIFIED:20260811T090000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ]);
  });

  it('is a REQUEST with a real organizer and attendee, not a bare attachment', () => {
    const logical = unfold(ics).join('\n');
    expect(logical).toContain('METHOD:REQUEST');
    expect(logical).toContain('mailto:programme@cicero.events');
    expect(logical).toContain('RSVP=TRUE');
    expect(logical).toContain('PARTSTAT=NEEDS-ACTION');
  });

  it('terminates every line with CRLF, including the last', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('a rescheduled session', () => {
  const initial = buildInvite(BASE);
  const update = buildInvite({
    ...BASE,
    sequence: 1,
    startsAt: new Date('2026-09-15T21:30:00Z'),
    endsAt: new Date('2026-09-15T22:15:00Z'),
    location: 'Basilica Room',
    stamp: new Date('2026-08-11T14:20:00Z'),
  });

  it('matches the golden SEQUENCE-bumped REQUEST', () => {
    expect(unfold(update)).toEqual([
      'BEGIN:VCALENDAR',
      'PRODID:-//Cicero//Speaker Management//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:sess-7@cicero.events',
      'SEQUENCE:1',
      'DTSTAMP:20260811T142000Z',
      'DTSTART:20260915T213000Z',
      'DTEND:20260915T221500Z',
      'SUMMARY:Rhetoric for engineers',
      'DESCRIPTION:A talk about persuasion.',
      'LOCATION:Basilica Room',
      'URL:https://cicero.events/e/demo/sessions/SESS-7',
      ORGANIZER_LINE,
      ATTENDEE_MARCUS,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'LAST-MODIFIED:20260811T142000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ]);
  });

  /** The whole of `C-3`: same identity, higher revision, so the entry moves instead of duplicating. */
  it('keeps the UID and raises the SEQUENCE', () => {
    expect(unfold(initial)).toContain('UID:sess-7@cicero.events');
    expect(unfold(update)).toContain('UID:sess-7@cicero.events');
    expect(unfold(initial)).toContain('SEQUENCE:0');
    expect(unfold(update)).toContain('SEQUENCE:1');
  });
});

describe('a cancelled session', () => {
  const ics = buildCancellation({ ...BASE, sequence: 2 });

  it('matches the golden CANCEL', () => {
    expect(unfold(ics)).toEqual([
      'BEGIN:VCALENDAR',
      'PRODID:-//Cicero//Speaker Management//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:CANCEL',
      'BEGIN:VEVENT',
      'UID:sess-7@cicero.events',
      'SEQUENCE:2',
      'DTSTAMP:20260811T090000Z',
      'DTSTART:20260914T170000Z',
      'DTEND:20260914T174500Z',
      'SUMMARY:Rhetoric for engineers',
      'DESCRIPTION:A talk about persuasion.',
      'LOCATION:Forum Hall',
      'URL:https://cicero.events/e/demo/sessions/SESS-7',
      ORGANIZER_LINE,
      'ATTENDEE;CN=Marcus Tullius;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;' +
        'PARTSTAT=NEEDS-ACTION:mailto:marcus@example.com',
      'STATUS:CANCELLED',
      'TRANSP:TRANSPARENT',
      'LAST-MODIFIED:20260811T090000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ]);
  });

  it('drops RSVP, since there is nothing left to reply to', () => {
    expect(ics).not.toContain('RSVP=TRUE');
  });
});

describe('the add-to-calendar download', () => {
  const ics = buildDownload(BASE);

  /** Short enough that nothing folds, so this pins the literal byte layout. */
  it('matches the golden PUBLISH byte for byte', () => {
    expect(ics).toBe(
      [
        'BEGIN:VCALENDAR',
        'PRODID:-//Cicero//Speaker Management//EN',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:sess-7@cicero.events',
        'SEQUENCE:0',
        'DTSTAMP:20260811T090000Z',
        'DTSTART:20260914T170000Z',
        'DTEND:20260914T174500Z',
        'SUMMARY:Rhetoric for engineers',
        'DESCRIPTION:A talk about persuasion.',
        'LOCATION:Forum Hall',
        'URL:https://cicero.events/e/demo/sessions/SESS-7',
        ORGANIZER_LINE,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'LAST-MODIFIED:20260811T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
  });

  it('carries no ATTENDEE, so a client files it instead of trying to RSVP', () => {
    expect(ics).not.toContain('ATTENDEE');
  });
});

describe('line folding', () => {
  const long = buildInvite({
    ...BASE,
    summary:
      'An unreasonably long session title that exists purely to push this property line well past ' +
      'the seventy-five octet limit that RFC 5545 imposes on a content line',
    description: `Paragraph one.\n\nParagraph two, which also runs long enough to fold at least once and contains a comma.`,
    attendees: [
      { email: 'marcus@example.com', name: 'Marcus Tullius' },
      { email: 'livia.drusilla@a-rather-long-domain-name.example.org', name: 'Livia Drusilla' },
    ],
  });

  it('keeps every physical line within 75 octets', () => {
    for (const line of long.split('\r\n')) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
  });

  it('marks continuations with a leading space', () => {
    const physical = long.split('\r\n');
    const continuations = physical.filter((line) => line.startsWith(' '));
    expect(continuations.length).toBeGreaterThan(0);
    expect(physical.length).toBeGreaterThan(unfold(long).length);
  });

  it('unfolds back to the logical value', () => {
    expect(unfold(long)).toContain(
      'SUMMARY:An unreasonably long session title that exists purely to push this property ' +
        'line well past the seventy-five octet limit that RFC 5545 imposes on a content line',
    );
  });

  /** Folding on characters instead of octets corrupts the codepoint that straddles the boundary. */
  it('never splits a multi-byte character', () => {
    const accented = buildInvite({
      ...BASE,
      summary: `Ünïcödé ${'é'.repeat(80)} tail`,
    });
    for (const line of accented.split('\r\n')) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(unfold(accented)).toContain(`SUMMARY:Ünïcödé ${'é'.repeat(80)} tail`);
    expect(accented).not.toContain('�');
  });
});

describe('escaping', () => {
  it('escapes commas, semicolons, backslashes and newlines in TEXT values', () => {
    const ics = buildInvite({
      ...BASE,
      summary: 'Stone, mortar; and migrations',
      description: 'Line one\nLine two; with a semicolon, a comma and a \\ backslash',
      location: 'Room 3, Floor 2',
    });
    const lines = unfold(ics);
    expect(lines).toContain('SUMMARY:Stone\\, mortar\\; and migrations');
    expect(lines).toContain(
      'DESCRIPTION:Line one\\nLine two\\; with a semicolon\\, a comma and a \\\\ backslash',
    );
    expect(lines).toContain('LOCATION:Room 3\\, Floor 2');
  });

  it('does not escape a URI value', () => {
    const ics = buildInvite({ ...BASE, url: 'https://example.org/a?b=1,2&c=3' });
    expect(unfold(ics)).toContain('URL:https://example.org/a?b=1,2&c=3');
  });

  it('quotes a CN that contains a comma', () => {
    const ics = buildInvite({
      ...BASE,
      attendees: [{ email: 'maria@example.com', name: 'Díaz, María' }],
    });
    expect(ics).toContain('CN="Díaz, María"');
  });

  it('caret-escapes a quote in a CN rather than closing the parameter', () => {
    const ics = buildInvite({
      ...BASE,
      organizer: { email: 'p@example.com', name: 'The "Programme" Team' },
    });
    expect(unfold(ics)).toContain("ORGANIZER;CN=The ^'Programme^' Team:mailto:p@example.com");
  });
});

describe('helpers', () => {
  it('formats UTC stamps without punctuation', () => {
    expect(formatIcsDate(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z');
  });

  it('mints unique UIDs', () => {
    expect(newIcsUid()).not.toBe(newIcsUid());
    expect(newIcsUid()).toMatch(/@cicero\.events$/);
  });

  it('derives a safe filename', () => {
    expect(icsFilename('Stone, mortar & migrations')).toBe('stone-mortar-migrations.ics');
    expect(icsFilename('***')).toBe('session.ics');
  });

  /**
   * The MIME part repeats the method, and a strict client trusts that copy over the body. Reading
   * it back out of the body is what keeps the two from drifting apart.
   */
  it('reads back the method each builder declares', () => {
    expect(readCalendarMethod(buildInvite(BASE))).toBe('REQUEST');
    expect(readCalendarMethod(buildCancellation(BASE))).toBe('CANCEL');
    expect(readCalendarMethod(buildDownload(BASE))).toBe('PUBLISH');
  });

  it('unfolds before reading the method', () => {
    expect(readCalendarMethod('BEGIN:VCALENDAR\r\nMET\r\n HOD:CANCEL\r\nEND:VCALENDAR\r\n')).toBe(
      'CANCEL',
    );
  });

  it('returns null rather than guessing when no usable method is declared', () => {
    expect(readCalendarMethod('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')).toBeNull();
    expect(readCalendarMethod('METHOD:COUNTER\r\n')).toBeNull();
  });
});
