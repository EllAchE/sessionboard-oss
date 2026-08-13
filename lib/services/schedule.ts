/**
 * The agenda's domain half: intervals, conflict detection, event-timezone arithmetic and the grid
 * geometry the board renders. Deliberately pure — no React, no Next, no database, no HTTP — because
 * conflict detection has to run in two places at once: on the server before a write, and in the
 * browser on every drag frame so the organizer sees a clash before they let go of the mouse.
 *
 * Database access for these types lives in `app/admin/agenda/data.ts`; keeping it out of here is
 * what lets a client component import `detectConflicts` without dragging `pg` into the bundle.
 */

export type SessionStatus = 'draft' | 'published' | 'cancelled';

export type Interval = { startsAt: Date; endsAt: Date };

/**
 * **The one function the whole agenda rests on.** Half-open intervals: a session ending at 10:00
 * and one starting at 10:00 do not overlap. Treating them as a clash would flag every back-to-back
 * pair in the programme and train organizers to ignore the warnings entirely.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

export type SpeakerRef = { participantId: string; name: string };

/** One row of the agenda as the board and the detector see it. */
export type ScheduleEntry = {
  id: string;
  ref: number;
  title: string;
  submissionId: string | null;
  roomId: string | null;
  trackId: string | null;
  formatId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: SessionStatus;
  ceuCredits: string | null;
  clientId: string | null;
  speakers: SpeakerRef[];
};

export type PlacedEntry = ScheduleEntry & Interval;

export function isPlaced(entry: ScheduleEntry): entry is PlacedEntry {
  return entry.startsAt instanceof Date && entry.endsAt instanceof Date;
}

/** A cancelled session still occupies a row in the list but must never raise a clash. */
function participatesInConflicts(entry: ScheduleEntry): entry is PlacedEntry {
  return isPlaced(entry) && entry.status !== 'cancelled';
}

// ---------------------------------------------------------------------------
// Conflicts — `A-2` (room, track) and `A-7` (speaker)
// ---------------------------------------------------------------------------

export type ConflictKind = 'room' | 'track' | 'speaker';

/** `warning` remains a presentation level for non-conflict diagnostics; agenda overlaps are errors. */
export type ConflictSeverity = 'error' | 'warning';

export type Conflict = {
  kind: ConflictKind;
  severity: ConflictSeverity;
  /** Always sorted, so the same clash produces the same key from either direction. */
  sessionIds: [string, string];
  /** Room, track or participant id, depending on `kind`. */
  subjectId: string | null;
  subjectName: string | null;
  message: string;
};

export type ScheduleLabels = {
  rooms?: Record<string, string>;
  tracks?: Record<string, string>;
};

export function conflictKey(conflict: Conflict): string {
  return `${conflict.kind}:${conflict.subjectId ?? '-'}:${conflict.sessionIds.join('|')}`;
}

function pair(a: ScheduleEntry, b: ScheduleEntry): [string, string] {
  return a.id < b.id ? [a.id, b.id] : [b.id, a.id];
}

/**
 * Every overlapping pair, checked three ways. O(n²) over one event's sessions, which is a few
 * hundred rows at most — an interval tree would be faster and harder to prove right.
 */
export function detectConflicts(entries: ScheduleEntry[], labels: ScheduleLabels = {}): Conflict[] {
  const placed = entries.filter(participatesInConflicts);
  const found = new Map<string, Conflict>();

  const add = (conflict: Conflict) => {
    const key = conflictKey(conflict);
    if (!found.has(key)) found.set(key, conflict);
  };

  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      if (!overlaps(a, b)) continue;

      if (a.roomId && b.roomId && a.roomId === b.roomId) {
        const name = labels.rooms?.[a.roomId] ?? 'the same room';
        add({
          kind: 'room',
          severity: 'error',
          sessionIds: pair(a, b),
          subjectId: a.roomId,
          subjectName: labels.rooms?.[a.roomId] ?? null,
          message: `${a.title} and ${b.title} both occupy ${name}`,
        });
      }

      if (a.trackId && b.trackId && a.trackId === b.trackId) {
        const name = labels.tracks?.[a.trackId] ?? 'the same track';
        add({
          kind: 'track',
          severity: 'error',
          sessionIds: pair(a, b),
          subjectId: a.trackId,
          subjectName: labels.tracks?.[a.trackId] ?? null,
          message: `${a.title} and ${b.title} run at once on ${name}`,
        });
      }

      for (const speaker of sharedSpeakers(a, b)) {
        add({
          kind: 'speaker',
          severity: 'error',
          sessionIds: pair(a, b),
          subjectId: speaker.participantId,
          subjectName: speaker.name,
          message: `${speaker.name} is scheduled in ${a.title} and ${b.title} at the same time`,
        });
      }
    }
  }

  return [...found.values()];
}

function sharedSpeakers(a: ScheduleEntry, b: ScheduleEntry): SpeakerRef[] {
  if (a.speakers.length === 0 || b.speakers.length === 0) return [];
  const other = new Set(b.speakers.map((speaker) => speaker.participantId));
  return a.speakers.filter((speaker) => other.has(speaker.participantId));
}

export function conflictsBySession(conflicts: Conflict[]): Map<string, Conflict[]> {
  const index = new Map<string, Conflict[]>();
  for (const conflict of conflicts) {
    for (const sessionId of conflict.sessionIds) {
      index.set(sessionId, [...(index.get(sessionId) ?? []), conflict]);
    }
  }
  return index;
}

export function worstSeverity(conflicts: Conflict[]): ConflictSeverity | null {
  if (conflicts.some((conflict) => conflict.severity === 'error')) return 'error';
  if (conflicts.length > 0) return 'warning';
  return null;
}

export type ConflictSummary = {
  total: number;
  room: number;
  track: number;
  speaker: number;
};

export function summarizeConflicts(conflicts: Conflict[]): ConflictSummary {
  return {
    total: conflicts.length,
    room: conflicts.filter((conflict) => conflict.kind === 'room').length,
    track: conflicts.filter((conflict) => conflict.kind === 'track').length,
    speaker: conflicts.filter((conflict) => conflict.kind === 'speaker').length,
  };
}

// ---------------------------------------------------------------------------
// Placement — the live preview a drag runs against
// ---------------------------------------------------------------------------

export type Placement = {
  /** Existing `scheduled_session.id`, or a provisional id for a queue item not yet written. */
  sessionId: string;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date;
};

/** Non-destructive: returns a new array so a drag preview never mutates the board's state. */
export function applyPlacements(
  entries: ScheduleEntry[],
  placements: Placement[],
): ScheduleEntry[] {
  if (placements.length === 0) return entries;
  const byId = new Map(placements.map((placement) => [placement.sessionId, placement]));
  const seen = new Set<string>();

  const moved = entries.map((entry) => {
    const placement = byId.get(entry.id);
    if (!placement) return entry;
    seen.add(entry.id);
    return {
      ...entry,
      roomId: placement.roomId,
      startsAt: placement.startsAt,
      endsAt: placement.endsAt,
    };
  });

  return moved;
}

/**
 * What the board calls on every drag frame: the world as it would be if this drop landed. The
 * dragged item may be a queue card with no row yet, in which case the caller passes a provisional
 * entry through `additions`.
 */
export function previewConflicts(
  entries: ScheduleEntry[],
  placements: Placement[],
  labels: ScheduleLabels = {},
  additions: ScheduleEntry[] = [],
): Conflict[] {
  return detectConflicts(applyPlacements([...entries, ...additions], placements), labels);
}

export function conflictsForSession(
  entries: ScheduleEntry[],
  sessionId: string,
  labels: ScheduleLabels = {},
): Conflict[] {
  return detectConflicts(entries, labels).filter((conflict) =>
    conflict.sessionIds.includes(sessionId),
  );
}

// ---------------------------------------------------------------------------
// Time. Stored UTC, shown in the event's zone — see `docs/01-requirements.md` A-4.
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  let built: Intl.DateTimeFormat;
  try {
    built = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    // An event row carrying a zone this runtime does not know must still render a readable agenda.
    built = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  formatters.set(timeZone, built);
  return built;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Offset of `timeZone` at `instant`, in ms. Positive east of UTC. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `YYYY-MM-DD` in the event's zone. The identity of a "day tab". */
export function zonedDayKey(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Minutes since local midnight in the event's zone. The grid's vertical axis. */
export function zonedMinutes(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  return parts.hour * 60 + parts.minute;
}

/**
 * The inverse: a day tab plus a grid row back to a UTC instant. Resolved twice because the offset
 * depends on the answer — one pass is wrong on the two days a year a zone changes offset, which is
 * exactly the bug nobody finds until the conference is in October.
 */
export function zonedTimeToUtc(
  dayKey: string,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  const naive = Date.UTC(year, (month ?? 1) - 1, day ?? 1, 0, minutesFromMidnight);
  const firstGuess = naive - zoneOffsetMs(new Date(naive), timeZone);
  const settled = naive - zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(settled);
}

export function formatMinutes(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

export function formatZonedTime(instant: Date, timeZone: string): string {
  return formatMinutes(zonedMinutes(instant, timeZone));
}

export function formatZonedRange(start: Date, end: Date, timeZone: string): string {
  return `${formatZonedTime(start, timeZone)}–${formatZonedTime(end, timeZone)}`;
}

/** `Mon 12 Oct` for a day tab, computed in the event's zone rather than the viewer's. */
export function formatDayLabel(dayKey: string, timeZone: string): string {
  const noon = zonedTimeToUtc(dayKey, 12 * 60, timeZone);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(noon);
  } catch {
    return dayKey;
  }
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function durationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

/** Inclusive `YYYY-MM-DD` walk. Pure string/UTC arithmetic, so no zone can shift it. */
export function dayKeyRange(startKey: string, endKey: string, limit = 60): string[] {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  let cursor = Date.UTC(sy, (sm ?? 1) - 1, sd ?? 1);
  const last = Date.UTC(ey, (em ?? 1) - 1, ed ?? 1);
  const keys: string[] = [];
  while (cursor <= last && keys.length < limit) {
    const date = new Date(cursor);
    keys.push(
      `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    );
    cursor += 86_400_000;
  }
  return keys;
}

/**
 * Which day tabs the board shows: the event's declared run, widened to cover anything already
 * scheduled outside it. A session dropped on the wrong day must stay visible, or an organizer can
 * lose a talk into a day that has no tab.
 */
export function agendaDayKeys(
  event: { startsOn: string | null; endsOn: string | null; timezone: string },
  entries: ScheduleEntry[],
): string[] {
  const fromEntries = entries
    .filter(isPlaced)
    .map((entry) => zonedDayKey(entry.startsAt, event.timezone));

  const declared =
    event.startsOn && event.endsOn
      ? dayKeyRange(event.startsOn, event.endsOn)
      : event.startsOn
        ? [event.startsOn]
        : [];

  const all = [...new Set([...declared, ...fromEntries])].sort();
  if (all.length > 0) return all;
  return [zonedDayKey(new Date(), event.timezone)];
}

// ---------------------------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------------------------

export type GridOptions = {
  /** Minutes from midnight, in the event's zone. */
  dayStartMinute: number;
  dayEndMinute: number;
  slotMinutes: number;
};

export const DEFAULT_GRID: GridOptions = {
  dayStartMinute: 8 * 60,
  dayEndMinute: 19 * 60,
  slotMinutes: 15,
};

export type TimeSlot = { minute: number; label: string; major: boolean };

export function buildSlots(options: GridOptions = DEFAULT_GRID): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (
    let minute = options.dayStartMinute;
    minute < options.dayEndMinute;
    minute += options.slotMinutes
  ) {
    slots.push({
      minute,
      label: formatMinutes(minute),
      major: minute % 60 === 0,
    });
  }
  return slots;
}

/**
 * Widens the visible window so nothing scheduled at 07:00 or 22:00 renders off-grid. The default
 * window is a convention, not a constraint — the data always wins.
 */
export function gridForDay(
  entries: ScheduleEntry[],
  dayKey: string,
  timeZone: string,
  base: GridOptions = DEFAULT_GRID,
): GridOptions {
  const onDay = entriesForDay(entries, dayKey, timeZone);
  if (onDay.length === 0) return base;

  const starts = onDay.map((entry) => zonedMinutes(entry.startsAt, timeZone));
  const ends = onDay.map(
    (entry) =>
      zonedMinutes(entry.startsAt, timeZone) + durationMinutes(entry.startsAt, entry.endsAt),
  );

  const floor = Math.min(base.dayStartMinute, ...starts);
  const ceiling = Math.max(base.dayEndMinute, ...ends);

  return {
    ...base,
    dayStartMinute: Math.max(0, Math.floor(floor / base.slotMinutes) * base.slotMinutes),
    dayEndMinute: Math.min(1440, Math.ceil(ceiling / base.slotMinutes) * base.slotMinutes),
  };
}

export function entriesForDay(
  entries: ScheduleEntry[],
  dayKey: string,
  timeZone: string,
): PlacedEntry[] {
  return entries
    .filter(isPlaced)
    .filter((entry) => zonedDayKey(entry.startsAt, timeZone) === dayKey)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Where a block sits in the day column, in slot units. */
export function blockGeometry(
  entry: PlacedEntry,
  timeZone: string,
  grid: GridOptions,
): { offsetSlots: number; spanSlots: number } {
  const startMinute = zonedMinutes(entry.startsAt, timeZone);
  const minutes = Math.max(grid.slotMinutes, durationMinutes(entry.startsAt, entry.endsAt));
  return {
    offsetSlots: Math.max(0, (startMinute - grid.dayStartMinute) / grid.slotMinutes),
    spanSlots: Math.max(1, Math.round(minutes / grid.slotMinutes)),
  };
}

/** `A-9` month view: six weeks of day keys, Monday-first, covering the month `anchorKey` sits in. */
export function monthGrid(anchorKey: string): {
  weeks: string[][];
  monthKey: string;
} {
  const [year, month] = anchorKey.split('-').map(Number);
  const first = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  const weekday = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - weekday * 86_400_000);

  const weeks: string[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: string[] = [];
    for (let day = 0; day < 7; day += 1) {
      const cell = new Date(start.getTime() + (week * 7 + day) * 86_400_000);
      days.push(
        `${cell.getUTCFullYear()}-${pad2(cell.getUTCMonth() + 1)}-${pad2(cell.getUTCDate())}`,
      );
    }
    weeks.push(days);
  }

  return { weeks, monthKey: `${year}-${pad2(month ?? 1)}` };
}

// ---------------------------------------------------------------------------
// The unscheduled queue — `A-5`
// ---------------------------------------------------------------------------

/**
 * A card in the side rail. `submission` has no `scheduled_session` row yet and gets one on the
 * first drop; `session` already has a row whose time was cleared.
 */
export type QueueItem = {
  kind: 'submission' | 'session';
  id: string;
  ref: string;
  title: string;
  descriptionMarkdown: string | null;
  trackId: string | null;
  formatId: string | null;
  durationMinutes: number;
  speakers: SpeakerRef[];
};

export const DEFAULT_SESSION_MINUTES = 45;

/** A provisional entry so a queue card can be conflict-checked before it exists in the database. */
export function provisionalEntry(item: QueueItem, placement: Placement): ScheduleEntry {
  return {
    id: placement.sessionId,
    ref: 0,
    title: item.title,
    submissionId: item.kind === 'submission' ? item.id : null,
    roomId: placement.roomId,
    trackId: item.trackId,
    formatId: item.formatId,
    startsAt: placement.startsAt,
    endsAt: placement.endsAt,
    status: 'draft',
    ceuCredits: null,
    clientId: null,
    speakers: item.speakers,
  };
}

/** The end a drop implies: the item's own duration, clamped so nothing runs past midnight. */
export function placementFor(
  dayKey: string,
  minute: number,
  roomId: string | null,
  minutes: number,
  timeZone: string,
  sessionId: string,
): Placement {
  const startsAt = zonedTimeToUtc(dayKey, minute, timeZone);
  const span = Math.max(5, Math.min(minutes, 1440 - minute));
  return { sessionId, roomId, startsAt, endsAt: addMinutes(startsAt, span) };
}

export function snapMinute(minute: number, grid: GridOptions = DEFAULT_GRID): number {
  return Math.round(minute / grid.slotMinutes) * grid.slotMinutes;
}

// ---------------------------------------------------------------------------
// Publish state — `A-6`
// ---------------------------------------------------------------------------

export type PublishCounts = {
  draft: number;
  published: number;
  cancelled: number;
};

export function publishCounts(entries: ScheduleEntry[]): PublishCounts {
  return {
    draft: entries.filter((entry) => entry.status === 'draft').length,
    published: entries.filter((entry) => entry.status === 'published').length,
    cancelled: entries.filter((entry) => entry.status === 'cancelled').length,
  };
}

/** What a public embed may show: published, and actually placed in time. */
export function publicEntries(entries: ScheduleEntry[]): PlacedEntry[] {
  return entries.filter(isPlaced).filter((entry) => entry.status === 'published');
}

/** Publishing an unplaced session would put a hole in the public agenda, so it is refused. */
export function canPublish(entry: ScheduleEntry): boolean {
  return isPlaced(entry) && entry.roomId !== null;
}
