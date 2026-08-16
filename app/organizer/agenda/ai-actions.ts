'use server';

import { requireCapability } from '@/lib/context';
import { proposeAgenda, type AgendaProposal } from '@/lib/ai/agenda';
import type { AgendaOptimizationWeights } from '@/lib/ai/agenda-optimizer';
import { toPublicError } from '@/lib/errors';
import { saveAgendaOptimizationWeights } from '@/lib/services/agenda-optimization';
import { currentEventContext } from '@/lib/services/events';
import { DEFAULT_GRID, agendaDayKeys } from '@/lib/services/schedule';
import { loadAgenda } from './data';

export type WireProposal = {
  status: AgendaProposal['status'];
  notes: string | null;
  message?: string;
  placements: {
    targetId: string;
    kind: 'session' | 'submission';
    title: string;
    roomId: string;
    roomName: string;
    dayKey: string;
    startsAt: string;
    endsAt: string;
    rationale: string | null;
  }[];
  unplaced: { title: string; reason: string }[];
};

/** A stale row is the organizer's to retry, not a screen the app should die on. */
function proposalFailed(error: unknown): WireProposal {
  return {
    status: 'error',
    notes: null,
    message: toPublicError(error).message,
    placements: [],
    unplaced: [],
  };
}

export async function proposeAgendaAction(
  requestedWeights: AgendaOptimizationWeights,
): Promise<WireProposal> {
  try {
    const ctx = await currentEventContext();
    requireCapability(ctx, 'agenda:manage');

    const data = await loadAgenda(ctx.eventId);
    const weights = await saveAgendaOptimizationWeights(ctx, requestedWeights);
    const proposal = await proposeAgenda({
      timezone: data.event.timezone,
      dayKeys: agendaDayKeys(data.event, data.entries),
      dayStartMinute: DEFAULT_GRID.dayStartMinute,
      dayEndMinute: DEFAULT_GRID.dayEndMinute,
      rooms: data.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        floor: room.floor,
      })),
      entries: data.entries,
      queue: data.queue,
      signalsByItemId: data.optimizationSignals,
      weights,
    });

    return {
      status: proposal.status,
      notes: proposal.notes,
      message: proposal.message,
      placements: proposal.placements.map((placement) => ({
        targetId: placement.item.id,
        kind: placement.item.kind,
        title: placement.item.title,
        roomId: placement.roomId,
        roomName: placement.roomName,
        dayKey: placement.dayKey,
        startsAt: placement.startsAt.toISOString(),
        endsAt: placement.endsAt.toISOString(),
        rationale: placement.rationale,
      })),
      unplaced: proposal.unplaced.map((row) => ({ title: row.item.title, reason: row.reason })),
    };
  } catch (error) {
    return proposalFailed(error);
  }
}
