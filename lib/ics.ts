/**
 * `C-3`. A hand-written VCALENDAR, because the thing that makes this requirement work is not
 * "produce an .ics" — every library does that — but produce one a mail client treats as an
 * *invitation* that **updates the existing entry** when a talk moves.
 *
 * Three properties carry that behaviour and all three are easy to get silently wrong:
 *
 *   - `METHOD:REQUEST` with a real `ORGANIZER` and `ATTENDEE` lines. Without them the message is an
 *     attachment the speaker has to open and re-add by hand; with them Gmail, Outlook and Apple
 *     Calendar render accept/decline inline.
 *   - `UID` stable for the lifetime of the session. A regenerated UID is a *new* event, so a
 *     rescheduled talk lands on the speaker's calendar a second time and the old one never moves.
 *   - `SEQUENCE` strictly increasing across revisions. A client that sees the same sequence treats
 *     the update as a duplicate of what it already holds and drops it.
 *
 * `scheduled_session.ics_uid` / `.ics_sequence` are where those two live; this module never invents
 * them, it only formats what it is handed. Sequence bumping belongs to `lib/services/comms.ts`.
 *
 * The wire format is unforgiving in ways a browser is not: CRLF endings, folding at 75 *octets*,
 * and `,` `;` `\` `\n` escaped inside TEXT values. A file that violates any of them still looks
 * plausible in a text editor and fails inside someone else's calendar client, which is why
 * `lib/ics.test.ts` asserts the bytes rather than the behaviour.
 */

/** RFC 5545 §3.1: octets, not characters, and the CRLF is not counted. */
const MAX_LINE_OCTETS = 75;

const PRODID = '-//Cicero//Speaker Management//EN';

export type CalendarMethod = 'REQUEST' | 'CANCEL' | 'PUBLISH';

export type CalendarPerson = {
  email: string;
  name?: string | null;
};

export type CalendarAttendee = CalendarPerson & {
  role?: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'CHAIR' | 'NON-PARTICIPANT';
};

export type CalendarEvent = {
  /** Stable for the lifetime of the session. Never regenerate for an existing row. */
  uid: string;
  /** Must increase on every revision an attendee's calendar has to see. */
  sequence: number;
  summary: string;
  startsAt: Date;
  endsAt: Date;
  /** Plain text. Markdown is flattened by the caller; DESCRIPTION has no markup. */
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer: CalendarPerson;
  attendees?: CalendarAttendee[];
  /**
   * DTSTAMP. Defaults to now; injected by tests so a golden file is comparable, and by the invite
   * path so every attendee's copy of one send carries the same stamp.
   */
  stamp?: Date;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Escapes a TEXT value. Order is load-bearing — backslash first, or every escape this function
 * adds gets escaped again on the next pass.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Parameter values take RFC 6868 caret escaping rather than backslashes, and are quoted when they
 * carry a character that would otherwise end the parameter. A speaker called `Díaz, María` in a CN
 * breaks the ATTENDEE line without this.
 */
function escapeParam(value: string): string {
  const escaped = value
    .replace(/\^/g, '^^')
    .replace(/\r\n|\r|\n/g, '^n')
    .replace(/"/g, "^'");
  return /[;:,]/.test(escaped) ? `"${escaped}"` : escaped;
}

/**
 * Folds at 75 octets with a leading space on each continuation. Splitting on characters instead of
 * octets is the common bug: one accented character in a title pushes the line over the limit that a
 * strict parser enforces, and splitting mid-codepoint corrupts it outright.
 */
function foldLine(line: string): string {
  const bytes = encoder.encode(line);
  if (bytes.length <= MAX_LINE_OCTETS) return line;

  const parts: string[] = [];
  let start = 0;
  // The first line gets all 75; every continuation spends one octet on its leading space.
  let budget = MAX_LINE_OCTETS;

  while (start < bytes.length) {
    let end = Math.min(start + budget, bytes.length);
    if (end < bytes.length) {
      while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    }
    parts.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    budget = MAX_LINE_OCTETS - 1;
  }

  return parts.join('\r\n ');
}

/** `20260812T170000Z`. UTC throughout, so no VTIMEZONE component is needed to be unambiguous. */
export function formatIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
}

function personLine(
  property: 'ORGANIZER' | 'ATTENDEE',
  person: CalendarPerson,
  params: string[],
): string {
  const withName = person.name ? [`CN=${escapeParam(person.name)}`, ...params] : params;
  const prefix = withName.length > 0 ? `${property};${withName.join(';')}` : property;
  return `${prefix}:mailto:${person.email}`;
}

/**
 * The general form. `buildInvite` / `buildCancellation` / `buildDownload` are the intended entry
 * points; this stays exported so an unusual method does not require a new wrapper.
 */
export function buildCalendar(event: CalendarEvent, method: CalendarMethod): string {
  const cancelled = method === 'CANCEL';
  const stamp = event.stamp ?? new Date();
  const attendees = method === 'PUBLISH' ? [] : (event.attendees ?? []);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${PRODID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${formatIcsDate(stamp)}`,
    `DTSTART:${formatIcsDate(event.startsAt)}`,
    `DTEND:${formatIcsDate(event.endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);

  lines.push(personLine('ORGANIZER', event.organizer, []));

  for (const attendee of attendees) {
    const params = [
      'CUTYPE=INDIVIDUAL',
      `ROLE=${attendee.role ?? 'REQ-PARTICIPANT'}`,
      'PARTSTAT=NEEDS-ACTION',
      // RSVP on a cancellation asks the speaker to reply to an event that no longer exists.
      ...(cancelled ? [] : ['RSVP=TRUE']),
    ];
    lines.push(personLine('ATTENDEE', attendee, params));
  }

  lines.push(
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `TRANSP:${cancelled ? 'TRANSPARENT' : 'OPAQUE'}`,
    `LAST-MODIFIED:${formatIcsDate(stamp)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  );

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** `C-3`: the invitation itself. Renders with accept/decline in a real mail client. */
export function buildInvite(event: CalendarEvent): string {
  return buildCalendar(event, 'REQUEST');
}

/**
 * Withdraws the invite. Same `uid`, higher `sequence` — a cancellation that reuses the sequence of
 * the invite it is cancelling is discarded as a stale duplicate and the entry stays on the calendar.
 */
export function buildCancellation(event: CalendarEvent): string {
  return buildCalendar(event, 'CANCEL');
}

/**
 * `C-3a`: the plain add-to-calendar download. `METHOD:PUBLISH` with no ATTENDEE lines, so a client
 * files it without trying to RSVP to an organizer who never invited them.
 */
export function buildDownload(event: CalendarEvent): string {
  return buildCalendar(event, 'PUBLISH');
}

/**
 * Minted once per scheduled session and stored. The domain part is cosmetic; what matters is that
 * it is globally unique and never changes, since it is the identity a calendar client matches on.
 */
export function newIcsUid(): string {
  return `${crypto.randomUUID()}@cicero.events`;
}

/** Attachment / download filename. Safe for Content-Disposition without further quoting. */
export function icsFilename(title: string): string {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'session';
  return `${stem}.ics`;
}
