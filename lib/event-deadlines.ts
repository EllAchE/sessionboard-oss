/**
 * `E-1b`. The reading side of the two milestone deadlines on `event`.
 *
 * The writing side lives in `lib/services/events.ts`; this is the shape every reader wants and
 * nobody should build twice. The organizer dashboard, the speaker portal, the public event page and
 * the reminder mail all want the same four things about a milestone — what it is called, when it
 * falls in the event's own timezone, how far away that is, and whether it has passed — and getting
 * any of those subtly different between surfaces is how an organizer ends up arguing with their own
 * product about what day it is.
 *
 * Nothing here decides anything. `passed` is a fact for phrasing, not a gate: no caller may refuse a
 * write because of it, because the deadlines are advisory by design and a talk moved the week of the
 * show is ordinary conference work.
 */

export type EventDeadlineKey = 'speakerDeadlineAt' | 'agendaDeadlineAt';

export type EventDeadline = {
  key: EventDeadlineKey;
  /** For organizers, whose deadline it is. */
  label: string;
  /** For speakers and the public, who care what it means for them rather than whose job it is. */
  publicLabel: string;
  at: Date;
  /** Formatted in the event's timezone — never the reader's. */
  when: string;
  /** `in 3 days`, `today`, `3 days ago`. */
  relative: string;
  passed: boolean;
};

/** Ordered the way an edition runs: the roster settles, then the programme built from it does. */
const DEADLINES: {
  key: EventDeadlineKey;
  label: string;
  publicLabel: string;
}[] = [
  {
    key: 'speakerDeadlineAt',
    label: 'Speaker roster settled',
    publicLabel: 'Speakers announced by',
  },
  { key: 'agendaDeadlineAt', label: 'Agenda settled', publicLabel: 'Full agenda by' },
];

/**
 * Strings are accepted alongside `Date` because the public bundle and the API carry these as ISO
 * instants, and making every one of those callers reconstruct a `Date` first is how a surface ends
 * up quietly doing it wrong.
 */
export type EventDeadlineSource = {
  timezone: string;
  speakerDeadlineAt?: Date | string | null;
  agendaDeadlineAt?: Date | string | null;
};

function instant(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const at = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(at.getTime()) ? null : at;
}

const DAY_MS = 86_400_000;

function formatIn(instant: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(instant);
  }
}

/**
 * Rounded to whole days on purpose. A milestone is a day on a plan, not an appointment, and
 * "in 11 hours" would read as more precision than the organizer meant when they typed it.
 */
function relative(instant: Date, now: Date): string {
  const days = Math.round((instant.getTime() - now.getTime()) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 30) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return `in ${weeks} weeks`;
}

/**
 * Only the milestones that were actually set, in edition order. An event with neither returns an
 * empty array, which every caller renders as nothing at all rather than as "none" — a conference
 * that does not track these should not be told it is missing them.
 */
export function describeEventDeadlines(
  event: EventDeadlineSource,
  now = new Date(),
): EventDeadline[] {
  const described: EventDeadline[] = [];
  for (const { key, label, publicLabel } of DEADLINES) {
    const at = instant(event[key]);
    if (!at) continue;
    described.push({
      key,
      label,
      publicLabel,
      at,
      when: formatIn(at, event.timezone),
      relative: relative(at, now),
      passed: at.getTime() < now.getTime(),
    });
  }
  return described;
}
