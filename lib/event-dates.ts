/**
 * `E-1`. When an event runs is a real instant, not a date-only string: an agenda, a calendar invite
 * and a countdown all need the time of day, and "12 October" means two different moments in Rome
 * and in Los Angeles. So `event.starts_at` / `event.ends_at` are `timestamptz` and the timezone
 * beside them is validated as a genuine IANA zone rather than free text.
 *
 * `event.starts_on` / `event.ends_on` survive as the date-only *projection* of those instants into
 * the event timezone. They are derived, never authored — every writer goes through
 * `resolveEventWindow` — and they exist because the public pages, the merge fields and the shipped
 * `/api/v1` payload all read a `YYYY-MM-DD` string today. Keeping the projection is what lets the
 * storage change without changing a public contract.
 *
 * Nothing here touches the database, so it is all unit-testable and safe in a client bundle.
 */

export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/**
 * Suggestions, not a whitelist — every one of these is offered in a `datalist` and any other real
 * IANA zone typed over the top is accepted. A closed list would be wrong the first time somebody
 * runs a conference in a city nobody thought of.
 */
export const COMMON_TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Africa/Lagos',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
] as const;

/**
 * `E-2` asks for an "Event Type" without saying what the values are, and organizers run things the
 * incumbent's enum has no word for. So it is free text with these as suggestions — same shape as the
 * timezone box, for the same reason.
 */
export const COMMON_EVENT_TYPES = [
  'Conference',
  'Summit',
  'Symposium',
  'Workshop',
  'Meetup',
  'Hackathon',
  'Training',
  'Festival',
  'Unconference',
] as const;

/** `2026-10-12T09:00`, as `<input type="datetime-local">` submits it. Seconds optional. */
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `UTC`, or `Area/Location` with an optional third segment. Deliberately narrower than everything
 * `Intl` will swallow: a bare offset (`+05:00`) and a legacy abbreviation (`EST`) both parse there
 * but neither survives a DST boundary the way a zone name does, and an organizer who types one has
 * made a mistake worth catching at the form rather than at the first agenda render.
 */
const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){1,2}$/;

export function isValidTimezone(zone: string): boolean {
  const value = zone.trim();
  if (!value) return false;
  if (value.toUpperCase() !== 'UTC' && !ZONE_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `america/los_angeles` is the same zone as `America/Los_Angeles`; store the canonical spelling. */
export function canonicalTimezone(zone: string): string | null {
  if (!isValidTimezone(zone)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsAt(timestamp: number, timeZone: string): Parts {
  const values = new Map(
    new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get('year') ?? 0,
    month: values.get('month') ?? 0,
    day: values.get('day') ?? 0,
    hour: values.get('hour') ?? 0,
    minute: values.get('minute') ?? 0,
    second: values.get('second') ?? 0,
  };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function isRealDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}

/**
 * A wall-clock reading in `timezone` to the instant it names. Solved by iteration rather than by an
 * offset table: the offset depends on the answer, so guess, measure how far the guess lands from the
 * reading, and correct. Three passes settle every real zone, including the ones that changed offset
 * historically.
 */
export function zonedTimeToUtc(local: string, timezone: string): Date | null {
  const match = LOCAL_DATE_TIME.exec(local.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');
  if (!isRealDate(year, month, day)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seen = partsAt(candidate, timezone);
    const represented = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    candidate += desired - represented;
  }
  return new Date(candidate);
}

/** The instant, read back as the wall clock a `datetime-local` input wants. */
export function utcToLocalInput(instant: Date, timezone: string): string {
  const seen = partsAt(instant.getTime(), timezone);
  return `${pad(seen.year, 4)}-${pad(seen.month)}-${pad(seen.day)}T${pad(seen.hour)}:${pad(seen.minute)}`;
}

/** The date-only projection stored in `starts_on` / `ends_on`. */
export function zonedDateKey(instant: Date, timezone: string): string {
  const seen = partsAt(instant.getTime(), timezone);
  return `${pad(seen.year, 4)}-${pad(seen.month)}-${pad(seen.day)}`;
}

export function isDateKey(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return isRealDate(year, month, day);
}

/** Calendar-day arithmetic on a `YYYY-MM-DD` key, with no zone involved. */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The window every writer resolves
// ---------------------------------------------------------------------------

export type EventWindow = {
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  startsOn: string;
  endsOn: string;
};

export type WindowProblem = { field: 'timezone' | 'startsAt' | 'endsAt'; message: string };

export type WindowResult = { ok: true; window: EventWindow } | { ok: false; problem: WindowProblem };

/**
 * The one place a start and an end become columns. Returns a problem rather than throwing so the
 * service can decide the error shape and the seeds can fail loudly, and so this file stays free of
 * `lib/errors`.
 */
export function resolveEventWindow(
  timezone: string,
  startsAtLocal: string,
  endsAtLocal: string,
): WindowResult {
  const zone = canonicalTimezone(timezone);
  if (!zone) {
    return {
      ok: false,
      problem: { field: 'timezone', message: 'Use an IANA timezone name, like America/Los_Angeles' },
    };
  }

  const startsAt = zonedTimeToUtc(startsAtLocal, zone);
  if (!startsAt) {
    return { ok: false, problem: { field: 'startsAt', message: 'Give a start date and time' } };
  }

  const endsAt = zonedTimeToUtc(endsAtLocal, zone);
  if (!endsAt) {
    return { ok: false, problem: { field: 'endsAt', message: 'Give an end date and time' } };
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    return {
      ok: false,
      problem: { field: 'endsAt', message: 'The event must end after it starts' },
    };
  }

  return {
    ok: true,
    window: {
      timezone: zone,
      startsAt,
      endsAt,
      startsOn: zonedDateKey(startsAt, zone),
      endsOn: zonedDateKey(endsAt, zone),
    },
  };
}

/** The same resolution, for callers with nobody to show a field error to — the seeds. */
export function requireEventWindow(
  timezone: string,
  startsAtLocal: string,
  endsAtLocal: string,
): EventWindow {
  const resolved = resolveEventWindow(timezone, startsAtLocal, endsAtLocal);
  if (!resolved.ok) {
    throw new Error(`${resolved.problem.field}: ${resolved.problem.message}`);
  }
  return resolved.window;
}

// ---------------------------------------------------------------------------
// Migration `0007` backfill — the executable copy of the rule
// ---------------------------------------------------------------------------

/**
 * Migration `0007` has to invent a start and an end for rows that predate the columns, and it has to
 * do it in SQL, inside the migration, before the `SET NOT NULL`. That logic is the risky part
 * of this change and SQL is a poor place to test it, so the rule lives here in a form the suite can
 * exercise, and `lib/event-dates.test.ts` additionally reads the migration and checks it still
 * implements the same constants in the same order.
 *
 * The rule, in words: a usable `starts_on` becomes 09:00 local on that date; anything else — NULL,
 * empty, junk — becomes 09:00 local thirty days out, which reads as "unscheduled, and obviously so"
 * rather than as a real date somebody might trust. The end is 17:00 local on `ends_on`, falling back
 * to `starts_on` for a single-day event, and any end that did not land after its start is pushed to
 * start + 8 hours. A timezone that is not a zone becomes UTC, because `AT TIME ZONE` errors on it
 * and a migration that aborts on one bad row is worse than one that normalises it.
 */
export const BACKFILL = {
  startHour: 9,
  endHour: 17,
  fallbackDays: 30,
  minimumHours: 8,
  fallbackZone: 'UTC',
} as const;

export type LegacyEventWindow = {
  startsOn: string | null;
  endsOn: string | null;
  timezone: string | null;
};

export function backfillEventWindow(row: LegacyEventWindow, now = new Date()): EventWindow {
  const zone = canonicalTimezone(row.timezone ?? '') ?? BACKFILL.fallbackZone;

  const startKey =
    row.startsOn && isDateKey(row.startsOn.trim())
      ? row.startsOn.trim()
      : addDays(zonedDateKey(now, zone), BACKFILL.fallbackDays);

  const endKey =
    row.endsOn && isDateKey(row.endsOn.trim())
      ? row.endsOn.trim()
      : startKey;

  const startsAt = zonedTimeToUtc(`${startKey}T${pad(BACKFILL.startHour)}:00`, zone)!;
  let endsAt = zonedTimeToUtc(`${endKey}T${pad(BACKFILL.endHour)}:00`, zone)!;
  if (endsAt.getTime() < startsAt.getTime()) {
    endsAt = new Date(startsAt.getTime() + BACKFILL.minimumHours * 3_600_000);
  }

  return {
    timezone: zone,
    startsAt,
    endsAt,
    startsOn: zonedDateKey(startsAt, zone),
    endsOn: zonedDateKey(endsAt, zone),
  };
}
