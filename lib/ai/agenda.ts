import {
  DEFAULT_SESSION_MINUTES,
  addMinutes,
  detectConflicts,
  provisionalEntry,
  summarizeConflicts,
  zonedTimeToUtc,
  type Conflict,
  type QueueItem,
  type ScheduleEntry,
} from '@/lib/services/schedule';
import {
  optimizeAgenda,
  type AgendaItemSignals,
  type AgendaOptimizationWeights,
} from './agenda-optimizer';

/**
 * `A-8`. Proposes where the unscheduled queue could go, and stops there.
 *
 * It never writes. The organizer reviews the placements on the board, edits any of them, and
 * accepts or discards — which is the only shape that survives contact with the constraints a
 * planner cannot see: the sponsor who must not follow the keynote, the speaker whose flight lands
 * at noon.
 *
 * The weighted planner is deterministic and its answer is not trusted. Every returned placement is
 * re-checked with the same `detectConflicts` the board uses, and anything that clashes is dropped
 * rather than shown as a good slot. A conflict-free proposal is the entire product claim.
 */

export type ProposalContext = {
  timezone: string;
  /** `YYYY-MM-DD` in the event's zone. */
  dayKeys: string[];
  dayStartMinute: number;
  dayEndMinute: number;
  rooms: { id: string; name: string; capacity: number | null; floor: string | null }[];
  entries: ScheduleEntry[];
  queue: QueueItem[];
  signalsByItemId: Record<string, AgendaItemSignals>;
  weights: AgendaOptimizationWeights;
};

export type ProposedPlacement = {
  item: QueueItem;
  dayKey: string;
  /** Minutes from local midnight in the event's zone. */
  startMinute: number;
  roomId: string;
  roomName: string;
  startsAt: Date;
  endsAt: Date;
  rationale: string | null;
};

export type AgendaProposal = {
  status: 'ok' | 'empty' | 'error';
  placements: ProposedPlacement[];
  /** Queue items the planner skipped or whose slot was rejected as conflicting. */
  unplaced: { item: QueueItem; reason: string }[];
  notes: string | null;
  message?: string;
};

type RawPlacement = {
  id?: unknown;
  dayKey?: unknown;
  startMinute?: unknown;
  roomId?: unknown;
  rationale?: unknown;
};

/**
 * The trust boundary. Each suggestion is checked against the real grid *including the suggestions
 * already accepted in this pass*, so the planner cannot double-book two of its own placements.
 */
export function validateProposal(
  context: ProposalContext,
  raw: RawPlacement[],
): { placements: ProposedPlacement[]; unplaced: { item: QueueItem; reason: string }[] } {
  const byId = new Map(context.queue.map((item) => [item.id, item]));
  const rooms = new Map(context.rooms.map((room) => [room.id, room]));
  const days = new Set(context.dayKeys);

  const accepted: ProposedPlacement[] = [];
  const world: ScheduleEntry[] = [...context.entries];
  const rejected: { item: QueueItem; reason: string }[] = [];
  const handled = new Set<string>();

  for (const candidate of raw) {
    const id = typeof candidate.id === 'string' ? candidate.id : null;
    const item = id ? byId.get(id) : undefined;
    if (!item || handled.has(item.id)) continue;
    handled.add(item.id);

    const dayKey = typeof candidate.dayKey === 'string' ? candidate.dayKey : '';
    const startMinute = Number(candidate.startMinute);
    const roomId = typeof candidate.roomId === 'string' ? candidate.roomId : '';
    const room = rooms.get(roomId);

    if (!days.has(dayKey) || !room || !Number.isFinite(startMinute)) {
      rejected.push({ item, reason: 'The suggested slot did not name a real day and room' });
      continue;
    }

    const snapped = Math.round(startMinute / 15) * 15;
    const minutes = item.durationMinutes || DEFAULT_SESSION_MINUTES;
    if (snapped < context.dayStartMinute || snapped + minutes > context.dayEndMinute) {
      rejected.push({ item, reason: 'The suggested slot ran outside the usable hours' });
      continue;
    }

    const startsAt = zonedTimeToUtc(dayKey, snapped, context.timezone);
    const endsAt = addMinutes(startsAt, minutes);
    const provisional = provisionalEntry(item, {
      sessionId: `proposed-${item.id}`,
      roomId: room.id,
      startsAt,
      endsAt,
    });

    const conflicts = detectConflicts([...world, provisional]).filter((conflict) =>
      conflict.sessionIds.includes(provisional.id),
    );
    // The event policy governs organizer edits; a generated draft has no reason to propose a clash.
    if (conflicts.length > 0) {
      rejected.push({ item, reason: reasonFor(conflicts) });
      continue;
    }

    world.push(provisional);
    accepted.push({
      item,
      dayKey,
      startMinute: snapped,
      roomId: room.id,
      roomName: room.name,
      startsAt,
      endsAt,
      rationale: typeof candidate.rationale === 'string' ? candidate.rationale : null,
    });
  }

  for (const item of context.queue) {
    if (!handled.has(item.id)) {
      rejected.push({ item, reason: 'The optimizer did not find a slot for this one' });
    }
  }

  return { placements: accepted, unplaced: rejected };
}

function reasonFor(conflicts: Conflict[]): string {
  const summary = summarizeConflicts(conflicts);
  if (summary.speaker > 0) return 'The suggested slot double-booked a speaker';
  if (summary.room > 0) return 'The suggested slot was already occupied';
  return 'The suggested slot clashed with the existing agenda';
}

export function proposeAgenda(context: ProposalContext): AgendaProposal {
  if (context.queue.length === 0) {
    return {
      status: 'empty',
      placements: [],
      unplaced: [],
      notes: null,
      message: 'Nothing is waiting for a slot.',
    };
  }
  if (context.rooms.length === 0) {
    return {
      status: 'empty',
      placements: [],
      unplaced: [],
      notes: null,
      message: 'Add a room before asking for a draft agenda.',
    };
  }

  const { placements, unplaced } = validateProposal(context, optimizeAgenda(context));
  return {
    status: 'ok',
    placements,
    unplaced,
    notes:
      'Weighted draft: audience overlap, expected attendance, speaker popularity, room capacity, venue flow, and schedule compactness all influenced the placement.',
  };
}
