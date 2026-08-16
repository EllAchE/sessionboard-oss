import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFLICT_POLICY,
  DEFAULT_GRID,
  agendaDayKeys,
  applyPlacements,
  blockGeometry,
  blockingConflicts,
  buildSlots,
  canPublish,
  conflictsForSession,
  dayKeyRange,
  detectConflicts,
  parseConflictPolicy,
  severityForKind,
  entriesForDay,
  formatZonedRange,
  gridForDay,
  monthGrid,
  overlaps,
  placementFor,
  previewConflicts,
  provisionalEntry,
  publicEntries,
  publishCounts,
  snapMinute,
  summarizeConflicts,
  zonedDayKey,
  zonedMinutes,
  zonedTimeToUtc,
  type QueueItem,
  type ScheduleEntry,
} from './schedule';

/**
 * The half-open boundary is the assertion this whole surface rests on. A detector that flags
 * back-to-back sessions cries wolf on every adjacent pair in a normal programme, and organizers
 * stop reading the warnings — at which point the real room clash goes out in the printed agenda.
 */

const TZ = 'America/Los_Angeles';

function at(iso: string): Date {
  return new Date(iso);
}

function entry(over: Partial<ScheduleEntry> & { id: string }): ScheduleEntry {
  return {
    ref: 1,
    title: `Session ${over.id}`,
    submissionId: null,
    roomId: null,
    trackId: null,
    formatId: null,
    startsAt: null,
    endsAt: null,
    status: 'draft',
    ceuCredits: null,
    clientId: null,
    speakers: [],
    ...over,
  };
}

const ROOM_A = 'room-a';
const ROOM_B = 'room-b';
const TRACK_A = 'track-a';
const TRACK_B = 'track-b';

describe('overlaps', () => {
  it('treats back-to-back sessions as free of conflict', () => {
    const first = { startsAt: at('2026-10-12T16:00:00Z'), endsAt: at('2026-10-12T17:00:00Z') };
    const second = { startsAt: at('2026-10-12T17:00:00Z'), endsAt: at('2026-10-12T18:00:00Z') };
    expect(overlaps(first, second)).toBe(false);
    expect(overlaps(second, first)).toBe(false);
  });

  it('flags a one-minute encroachment in either direction', () => {
    const first = { startsAt: at('2026-10-12T16:00:00Z'), endsAt: at('2026-10-12T17:00:00Z') };
    const second = { startsAt: at('2026-10-12T16:59:00Z'), endsAt: at('2026-10-12T18:00:00Z') };
    expect(overlaps(first, second)).toBe(true);
    expect(overlaps(second, first)).toBe(true);
  });

  it('flags full containment', () => {
    const outer = { startsAt: at('2026-10-12T16:00:00Z'), endsAt: at('2026-10-12T18:00:00Z') };
    const inner = { startsAt: at('2026-10-12T16:30:00Z'), endsAt: at('2026-10-12T17:00:00Z') };
    expect(overlaps(outer, inner)).toBe(true);
  });

  it('keeps a zero-length marker at either boundary free of conflict', () => {
    const block = { startsAt: at('2026-10-12T16:00:00Z'), endsAt: at('2026-10-12T17:00:00Z') };
    const atEnd = { startsAt: at('2026-10-12T17:00:00Z'), endsAt: at('2026-10-12T17:00:00Z') };
    const atStart = { startsAt: at('2026-10-12T16:00:00Z'), endsAt: at('2026-10-12T16:00:00Z') };
    expect(overlaps(atEnd, block)).toBe(false);
    expect(overlaps(atStart, block)).toBe(false);
  });
});

describe('detectConflicts', () => {
  it('reports a room double-booking', () => {
    const conflicts = detectConflicts(
      [
        entry({
          id: 'a',
          roomId: ROOM_A,
          startsAt: at('2026-10-12T16:00:00Z'),
          endsAt: at('2026-10-12T17:00:00Z'),
        }),
        entry({
          id: 'b',
          roomId: ROOM_A,
          startsAt: at('2026-10-12T16:30:00Z'),
          endsAt: at('2026-10-12T17:30:00Z'),
        }),
      ],
      { rooms: { [ROOM_A]: 'Forum Hall' } },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('room');
    expect(conflicts[0].severity).toBe('error');
    expect(conflicts[0].sessionIds).toEqual(['a', 'b']);
    expect(conflicts[0].message).toContain('Forum Hall');
  });

  it('does not report a room conflict for back-to-back sessions in that room', () => {
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
      entry({
        id: 'b',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T17:00:00Z'),
        endsAt: at('2026-10-12T18:00:00Z'),
      }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('leaves different rooms at the same time alone', () => {
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
      entry({
        id: 'b',
        roomId: ROOM_B,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('reports a track collision as a warning, not an error (AR-30)', () => {
    const conflicts = detectConflicts(
      [
        entry({
          id: 'a',
          roomId: ROOM_A,
          trackId: TRACK_A,
          startsAt: at('2026-10-12T16:00:00Z'),
          endsAt: at('2026-10-12T17:00:00Z'),
        }),
        entry({
          id: 'b',
          roomId: ROOM_B,
          trackId: TRACK_A,
          startsAt: at('2026-10-12T16:30:00Z'),
          endsAt: at('2026-10-12T17:30:00Z'),
        }),
      ],
      { tracks: { [TRACK_A]: 'Platform' } },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('track');
    expect(conflicts[0].severity).toBe('warning');
    expect(conflicts[0].message).toContain('Platform');
  });

  it('does not report a track collision for back-to-back sessions on one track', () => {
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
      entry({
        id: 'b',
        roomId: ROOM_B,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T17:00:00Z'),
        endsAt: at('2026-10-12T18:00:00Z'),
      }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('leaves separate tracks at the same time alone', () => {
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
      entry({
        id: 'b',
        roomId: ROOM_B,
        trackId: TRACK_B,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('reports a speaker booked in two rooms at once (A-7)', () => {
    const marcus = { participantId: 'p1', name: 'Marcus Tullius' };
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
        speakers: [marcus],
      }),
      entry({
        id: 'b',
        roomId: ROOM_B,
        trackId: TRACK_B,
        startsAt: at('2026-10-12T16:30:00Z'),
        endsAt: at('2026-10-12T17:30:00Z'),
        speakers: [marcus, { participantId: 'p2', name: 'Livia Drusilla' }],
      }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('speaker');
    expect(conflicts[0].severity).toBe('error');
    expect(conflicts[0].subjectId).toBe('p1');
    expect(conflicts[0].message).toContain('Marcus Tullius');
  });

  it('does not report a speaker conflict for back-to-back talks by the same person', () => {
    const marcus = { participantId: 'p1', name: 'Marcus Tullius' };
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
        speakers: [marcus],
      }),
      entry({
        id: 'b',
        roomId: ROOM_B,
        startsAt: at('2026-10-12T17:00:00Z'),
        endsAt: at('2026-10-12T18:00:00Z'),
        speakers: [marcus],
      }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('reports one conflict per co-speaker shared across two overlapping sessions', () => {
    const marcus = { participantId: 'p1', name: 'Marcus Tullius' };
    const livia = { participantId: 'p2', name: 'Livia Drusilla' };
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
        speakers: [marcus, livia],
      }),
      entry({
        id: 'b',
        roomId: ROOM_B,
        startsAt: at('2026-10-12T16:30:00Z'),
        endsAt: at('2026-10-12T17:30:00Z'),
        speakers: [marcus, livia],
      }),
    ]);

    expect(conflicts.filter((conflict) => conflict.kind === 'speaker')).toHaveLength(2);
  });

  it('stacks all three kinds on one genuinely broken pair', () => {
    const marcus = { participantId: 'p1', name: 'Marcus Tullius' };
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
        speakers: [marcus],
      }),
      entry({
        id: 'b',
        roomId: ROOM_A,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T16:15:00Z'),
        endsAt: at('2026-10-12T17:15:00Z'),
        speakers: [marcus],
      }),
    ]);

    expect(summarizeConflicts(conflicts)).toEqual({ total: 3, room: 1, track: 1, speaker: 1 });
  });

  it('ignores unscheduled and cancelled sessions', () => {
    const marcus = { participantId: 'p1', name: 'Marcus Tullius' };
    const conflicts = detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
        speakers: [marcus],
      }),
      entry({
        id: 'cancelled',
        roomId: ROOM_A,
        status: 'cancelled',
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
        speakers: [marcus],
      }),
      entry({ id: 'queued', roomId: ROOM_A, speakers: [marcus] }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('does not pair a session with itself and is order-independent', () => {
    const rows = [
      entry({
        id: 'b',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:30:00Z'),
        endsAt: at('2026-10-12T17:30:00Z'),
      }),
      entry({
        id: 'a',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
    ];

    expect(detectConflicts(rows)[0].sessionIds).toEqual(['a', 'b']);
    expect(detectConflicts([...rows].reverse())[0].sessionIds).toEqual(['a', 'b']);
  });

  it('treats a null room or track as unset rather than as a shared value', () => {
    const conflicts = detectConflicts([
      entry({ id: 'a', startsAt: at('2026-10-12T16:00:00Z'), endsAt: at('2026-10-12T17:00:00Z') }),
      entry({ id: 'b', startsAt: at('2026-10-12T16:00:00Z'), endsAt: at('2026-10-12T17:00:00Z') }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it('filters to one session for the drawer', () => {
    const rows = [
      entry({
        id: 'a',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
      }),
      entry({
        id: 'b',
        roomId: ROOM_A,
        startsAt: at('2026-10-12T16:30:00Z'),
        endsAt: at('2026-10-12T17:30:00Z'),
      }),
      entry({
        id: 'c',
        roomId: ROOM_B,
        startsAt: at('2026-10-12T20:00:00Z'),
        endsAt: at('2026-10-12T21:00:00Z'),
      }),
    ];

    expect(conflictsForSession(rows, 'c')).toEqual([]);
    expect(conflictsForSession(rows, 'a')).toHaveLength(1);
  });
});

/**
 * `AR-30`. Severity and enforcement are two axes. These tests exist to keep them from collapsing
 * back into one — the collapse is what made `A-2` undemonstrable in the first place.
 */
describe('conflict policy (AR-30)', () => {
  const broken = () =>
    detectConflicts([
      entry({
        id: 'a',
        roomId: ROOM_A,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T16:00:00Z'),
        endsAt: at('2026-10-12T17:00:00Z'),
        speakers: [{ participantId: 'p1', name: 'Cicero' }],
      }),
      entry({
        id: 'b',
        roomId: ROOM_A,
        trackId: TRACK_A,
        startsAt: at('2026-10-12T16:30:00Z'),
        endsAt: at('2026-10-12T17:30:00Z'),
        speakers: [{ participantId: 'p1', name: 'Cicero' }],
      }),
    ]);

  it('defaults to warnings, so nothing is refused', () => {
    expect(DEFAULT_CONFLICT_POLICY).toBe('warn');
    expect(blockingConflicts(broken())).toEqual([]);
    expect(blockingConflicts(broken(), 'warn')).toEqual([]);
  });

  it('rates a room and a speaker clash as errors and a track collision as a warning', () => {
    expect(severityForKind('room')).toBe('error');
    expect(severityForKind('speaker')).toBe('error');
    expect(severityForKind('track')).toBe('warning');
  });

  it('blocks only the physically impossible kinds under a block policy', () => {
    const blocked = blockingConflicts(broken(), 'block');

    expect(blocked.map((item) => item.kind).sort()).toEqual(['room', 'speaker']);
    expect(blocked.every((item) => item.severity === 'error')).toBe(true);
  });

  it('still detects every kind under either policy — blocking is not filtering', () => {
    expect(broken().map((item) => item.kind).sort()).toEqual(['room', 'speaker', 'track']);
  });

  it('names the double-booked speaker in the message the chip renders', () => {
    const speaker = broken().find((item) => item.kind === 'speaker');

    expect(speaker?.message).toBe('Cicero is scheduled in Session a and Session b at the same time');
    expect(speaker?.subjectName).toBe('Cicero');
  });

  it('reads an unset, unknown or legacy column as the default rather than throwing', () => {
    expect(parseConflictPolicy('block')).toBe('block');
    expect(parseConflictPolicy('warn')).toBe('warn');
    expect(parseConflictPolicy(null)).toBe('warn');
    expect(parseConflictPolicy(undefined)).toBe('warn');
    expect(parseConflictPolicy('nonsense')).toBe('warn');
  });
});

describe('drag preview', () => {
  const existing = [
    entry({
      id: 'a',
      roomId: ROOM_A,
      startsAt: at('2026-10-12T16:00:00Z'),
      endsAt: at('2026-10-12T17:00:00Z'),
    }),
  ];

  it('leaves the source array untouched', () => {
    const placements = [
      {
        sessionId: 'a',
        roomId: ROOM_B,
        startsAt: at('2026-10-12T20:00:00Z'),
        endsAt: at('2026-10-12T21:00:00Z'),
      },
    ];
    applyPlacements(existing, placements);
    expect(existing[0].roomId).toBe(ROOM_A);
  });

  it('warns when a queue card would land on an occupied room', () => {
    const item: QueueItem = {
      kind: 'submission',
      id: 'sub-1',
      ref: 'ABS-9',
      title: 'On Duties',
      descriptionMarkdown: null,
      trackId: null,
      formatId: null,
      durationMinutes: 45,
      speakers: [],
    };
    const placement = placementFor('2026-10-12', 9 * 60 + 30, ROOM_A, 45, TZ, 'provisional');
    const conflicts = previewConflicts(existing, [], {}, [provisionalEntry(item, placement)]);

    expect(conflicts.map((conflict) => conflict.kind)).toEqual(['room']);
  });

  it('clears the conflict once the drag moves past the occupied block', () => {
    const item: QueueItem = {
      kind: 'submission',
      id: 'sub-1',
      ref: 'ABS-9',
      title: 'On Duties',
      descriptionMarkdown: null,
      trackId: null,
      formatId: null,
      durationMinutes: 45,
      speakers: [],
    };
    const placement = placementFor('2026-10-12', 10 * 60, ROOM_A, 45, TZ, 'provisional');
    expect(previewConflicts(existing, [], {}, [provisionalEntry(item, placement)])).toEqual([]);
  });
});

describe('event-timezone arithmetic', () => {
  it('round-trips a wall-clock time through UTC', () => {
    const utc = zonedTimeToUtc('2026-10-12', 9 * 60 + 30, TZ);
    expect(utc.toISOString()).toBe('2026-10-12T16:30:00.000Z');
    expect(zonedMinutes(utc, TZ)).toBe(9 * 60 + 30);
    expect(zonedDayKey(utc, TZ)).toBe('2026-10-12');
  });

  it('keeps the wall clock stable across a DST transition', () => {
    const before = zonedTimeToUtc('2026-10-30', 9 * 60, TZ);
    const after = zonedTimeToUtc('2026-11-05', 9 * 60, TZ);
    expect(zonedMinutes(before, TZ)).toBe(9 * 60);
    expect(zonedMinutes(after, TZ)).toBe(9 * 60);
    expect(before.toISOString()).not.toBe(after.toISOString());
  });

  it('assigns a late-evening Pacific session to the local day, not the UTC one', () => {
    const late = at('2026-10-13T03:00:00Z');
    expect(zonedDayKey(late, TZ)).toBe('2026-10-12');
    expect(zonedDayKey(late, 'UTC')).toBe('2026-10-13');
  });

  it('formats a range in the event zone', () => {
    expect(
      formatZonedRange(at('2026-10-12T16:00:00Z'), at('2026-10-12T16:45:00Z'), TZ),
    ).toBe('09:00–09:45');
  });

  it('falls back to UTC for an unknown zone rather than throwing', () => {
    expect(() => zonedDayKey(at('2026-10-12T16:00:00Z'), 'Mars/Olympus')).not.toThrow();
  });

  it('walks an inclusive day range', () => {
    expect(dayKeyRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});

describe('grid geometry', () => {
  const rows = [
    entry({
      id: 'a',
      roomId: ROOM_A,
      startsAt: at('2026-10-12T16:00:00Z'),
      endsAt: at('2026-10-12T17:00:00Z'),
    }),
    entry({
      id: 'late',
      roomId: ROOM_A,
      startsAt: at('2026-10-13T04:00:00Z'),
      endsAt: at('2026-10-13T05:00:00Z'),
    }),
  ];

  it('buckets entries by the event-zone day', () => {
    expect(entriesForDay(rows, '2026-10-12', TZ).map((row) => row.id)).toEqual(['a', 'late']);
  });

  it('widens the window so an out-of-hours session stays on the grid', () => {
    const grid = gridForDay(rows, '2026-10-12', TZ);
    expect(grid.dayEndMinute).toBeGreaterThanOrEqual(22 * 60);
    expect(buildSlots(grid).length).toBeGreaterThan(buildSlots(DEFAULT_GRID).length);
  });

  it('places a block at the right offset and span', () => {
    const grid = { dayStartMinute: 8 * 60, dayEndMinute: 19 * 60, slotMinutes: 15 };
    const placed = entriesForDay(rows, '2026-10-12', TZ)[0];
    expect(blockGeometry(placed, TZ, grid)).toEqual({ offsetSlots: 4, spanSlots: 4 });
  });

  it('snaps a dropped minute to the slot size', () => {
    expect(snapMinute(547)).toBe(540);
    expect(snapMinute(551)).toBe(555);
  });

  it('widens the day tabs to cover anything scheduled outside the declared run', () => {
    const keys = agendaDayKeys(
      { startsOn: '2026-10-12', endsOn: '2026-10-13', timezone: TZ },
      [
        entry({
          id: 'stray',
          startsAt: at('2026-10-15T16:00:00Z'),
          endsAt: at('2026-10-15T17:00:00Z'),
        }),
      ],
    );
    expect(keys).toEqual(['2026-10-12', '2026-10-13', '2026-10-15']);
  });

  it('lays out a six-week month grid starting on a Monday (A-9)', () => {
    const { weeks, monthKey } = monthGrid('2026-10-12');
    expect(monthKey).toBe('2026-10');
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks.flat()).toContain('2026-10-12');
  });
});

describe('publish state (A-6)', () => {
  const rows = [
    entry({
      id: 'pub',
      status: 'published',
      roomId: ROOM_A,
      startsAt: at('2026-10-12T16:00:00Z'),
      endsAt: at('2026-10-12T17:00:00Z'),
    }),
    entry({
      id: 'draft',
      roomId: ROOM_B,
      startsAt: at('2026-10-12T16:00:00Z'),
      endsAt: at('2026-10-12T17:00:00Z'),
    }),
    entry({ id: 'queued' }),
  ];

  it('exposes only published, placed sessions to embeds', () => {
    expect(publicEntries(rows).map((row) => row.id)).toEqual(['pub']);
  });

  it('counts the states', () => {
    expect(publishCounts(rows)).toEqual({ draft: 2, published: 1, cancelled: 0 });
  });

  it('refuses to publish a session with no slot or no room', () => {
    expect(canPublish(rows[2])).toBe(false);
    expect(
      canPublish(
        entry({
          id: 'roomless',
          startsAt: at('2026-10-12T16:00:00Z'),
          endsAt: at('2026-10-12T17:00:00Z'),
        }),
      ),
    ).toBe(false);
    expect(canPublish(rows[0])).toBe(true);
  });
});
