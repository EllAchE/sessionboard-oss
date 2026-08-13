'use server';

import { requireCapability } from '@/lib/context';
import { aiModelConfigured } from '@/lib/ai/notice';
import { proposeAgenda, type AgendaProposal } from '@/lib/ai/agenda';
import { toPublicError } from '@/lib/errors';
import { currentEventContext } from '@/lib/services/events';
import { DEFAULT_GRID, agendaDayKeys } from '@/lib/services/schedule';
import { loadAgenda } from './data';

/**
 * `A-8`. The proposal round-trip, kept in its own module so the board's other actions do not pull
 * `@anthropic-ai/sdk` into every request. Nothing here writes: the organizer accepts a proposal
 * through `applyProposalAction`, which is the same path a drag takes.
 */

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

/**
 * Whether a model key is set. The assistant runs either way — `lib/ai/agenda` falls back to a
 * deterministic planner — so this only decides whether the dialog says where the drafting came
 * from, never whether the button works.
 */
export async function agendaModelConfigured(): Promise<boolean> {
  return aiModelConfigured();
}

/** A stale row or a down model is the organizer's to retry, not a screen the app should die on. */
function proposalFailed(error: unknown): WireProposal {
  return {
    status: 'error',
    notes: null,
    message: toPublicError(error).message,
    placements: [],
    unplaced: [],
  };
}

export async function proposeAgendaAction(guidance?: string | null): Promise<WireProposal> {
  try {
    const ctx = await currentEventContext();
    requireCapability(ctx, 'agenda:manage');

    const data = await loadAgenda(ctx.eventId);
    const proposal = await proposeAgenda({
      eventName: data.event.name,
      timezone: data.event.timezone,
      dayKeys: agendaDayKeys(data.event, data.entries),
      dayStartMinute: DEFAULT_GRID.dayStartMinute,
      dayEndMinute: DEFAULT_GRID.dayEndMinute,
      rooms: data.rooms.map((room) => ({ id: room.id, name: room.name, capacity: room.capacity })),
      tracks: data.tracks.map((track) => ({ id: track.id, name: track.name })),
      entries: data.entries,
      queue: data.queue,
      guidance: guidance ?? null,
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
