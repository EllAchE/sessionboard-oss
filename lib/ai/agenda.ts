import Anthropic from '@anthropic-ai/sdk';
import { env, features } from '@/lib/env';
import {
  DEFAULT_SESSION_MINUTES,
  addMinutes,
  detectConflicts,
  formatMinutes,
  provisionalEntry,
  summarizeConflicts,
  zonedDayKey,
  zonedMinutes,
  zonedTimeToUtc,
  type Conflict,
  type QueueItem,
  type ScheduleEntry,
} from '@/lib/services/schedule';

/**
 * `A-8`. Proposes where the unscheduled queue could go, and stops there.
 *
 * It never writes. The organizer reviews the placements on the board, edits any of them, and
 * accepts or discards — which is the only shape that survives contact with the constraints a model
 * cannot see: the sponsor who must not follow the keynote, the speaker whose flight lands at noon.
 *
 * Two properties matter more than the quality of the suggestion:
 *   - **The model's answer is not trusted.** Every returned placement is re-checked with the same
 *     `detectConflicts` the board uses, and anything that clashes is dropped from the proposal
 *     rather than shown as a good slot. A conflict-free proposal is the entire product claim.
 *   - **No key means a worse planner, not an absent feature.** Without `ANTHROPIC_API_KEY` the
 *     greedy planner in `planLocally` answers instead, through the same validation, so the surface
 *     behaves identically and a self-hoster who never signs up for anything still gets a draft.
 */

export const AGENDA_MODEL = 'claude-sonnet-5';

const MAX_OUTPUT_TOKENS = 4096;

export function available(): boolean {
  return features.ai();
}

export type ProposalContext = {
  eventName: string;
  timezone: string;
  /** `YYYY-MM-DD` in the event's zone. */
  dayKeys: string[];
  dayStartMinute: number;
  dayEndMinute: number;
  rooms: { id: string; name: string; capacity: number | null }[];
  tracks: { id: string; name: string }[];
  entries: ScheduleEntry[];
  queue: QueueItem[];
  /** Free text from the organizer: "keep the workshops in the afternoon". */
  guidance?: string | null;
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
  status: 'ok' | 'disabled' | 'empty' | 'error';
  placements: ProposedPlacement[];
  /** Queue items the model skipped or whose slot was rejected as conflicting. */
  unplaced: { item: QueueItem; reason: string }[];
  notes: string | null;
  model: string | null;
  message?: string;
};

const SLOT_STEP_MINUTES = 15;

/**
 * What runs when no model is configured. Deliberately a real planner rather than an empty
 * "disabled" state: the greedy rule below — earliest free slot, filling rooms across before moving
 * time forward — is what an organizer does by hand with a whiteboard, so the draft is worth
 * accepting rather than a placeholder telling someone to go find an API key.
 *
 * It emits the same `RawPlacement` shape the model does and is handed to the same
 * `validateProposal`, so a slot from here is trusted exactly as little as a slot from Claude.
 * Being deterministic, it also means the same queue always lands the same way, which the model
 * path cannot promise.
 */
function planLocally(context: ProposalContext): RawPlacement[] {
  const world: ScheduleEntry[] = [...context.entries];
  const placements: RawPlacement[] = [];

  const fits = (item: QueueItem, dayKey: string, startMinute: number, roomId: string) => {
    const minutes = item.durationMinutes || DEFAULT_SESSION_MINUTES;
    const startsAt = zonedTimeToUtc(dayKey, startMinute, context.timezone);
    const provisional = provisionalEntry(item, {
      sessionId: `proposed-${item.id}`,
      roomId,
      startsAt,
      endsAt: addMinutes(startsAt, minutes),
    });
    // Any clash at all, not just the blocking kinds. The event's `ConflictPolicy` governs what an
    // organizer is allowed to *save*; a proposal is generated from nothing and has no reason to
    // suggest a clash of any severity when a clean slot exists.
    const clashes = detectConflicts([...world, provisional]).some((conflict) =>
      conflict.sessionIds.includes(provisional.id),
    );
    return clashes ? null : provisional;
  };

  for (const item of context.queue) {
    const minutes = item.durationMinutes || DEFAULT_SESSION_MINUTES;

    const starts = context.dayKeys.flatMap((dayKey) => {
      const walk: { dayKey: string; startMinute: number }[] = [];
      for (
        let startMinute = context.dayStartMinute;
        startMinute + minutes <= context.dayEndMinute;
        startMinute += SLOT_STEP_MINUTES
      ) {
        walk.push({ dayKey, startMinute });
      }
      return walk;
    });

    /** Rooms inside the time walk, so parallel tracks fill before the day runs long. */
    const found = starts
      .flatMap((candidate) => context.rooms.map((room) => ({ ...candidate, room })))
      .find((candidate) => fits(item, candidate.dayKey, candidate.startMinute, candidate.room.id));
    if (!found) continue;

    const entry = fits(item, found.dayKey, found.startMinute, found.room.id);
    if (!entry) continue;
    world.push(entry);
    placements.push({
      id: item.id,
      dayKey: found.dayKey,
      startMinute: found.startMinute,
      roomId: found.room.id,
      rationale: `Earliest ${minutes}-minute slot free in ${found.room.name}.`,
    });
  }

  return placements;
}

function describeExisting(context: ProposalContext): string {
  const placed = context.entries.filter((entry) => entry.startsAt && entry.endsAt);
  if (placed.length === 0) return 'Nothing is scheduled yet — the grid is empty.';

  const roomNames = new Map(context.rooms.map((row) => [row.id, row.name]));
  return placed
    .map((entry) => {
      const day = zonedDayKey(entry.startsAt!, context.timezone);
      const start = formatMinutes(zonedMinutes(entry.startsAt!, context.timezone));
      const end = formatMinutes(zonedMinutes(entry.endsAt!, context.timezone));
      const room = entry.roomId ? (roomNames.get(entry.roomId) ?? 'unassigned room') : 'no room';
      const speakers = entry.speakers.map((speaker) => speaker.name).join(', ') || 'no speakers';
      return `- ${day} ${start}-${end} | ${room} | "${entry.title}" | ${speakers}`;
    })
    .join('\n');
}

function describeQueue(context: ProposalContext): string {
  return context.queue
    .map((item) => {
      const track = context.tracks.find((row) => row.id === item.trackId)?.name ?? 'no track';
      const speakers = item.speakers.map((speaker) => speaker.name).join(', ') || 'no speakers';
      return `- id=${item.id} kind=${item.kind} | "${item.title}" | ${item.durationMinutes} min | track: ${track} | speakers: ${speakers}`;
    })
    .join('\n');
}

function buildPrompt(context: ProposalContext): string {
  return [
    `Event: ${context.eventName} (all times ${context.timezone}).`,
    `Programme days: ${context.dayKeys.join(', ')}.`,
    `Usable hours each day: ${formatMinutes(context.dayStartMinute)} to ${formatMinutes(context.dayEndMinute)}.`,
    '',
    'Rooms:',
    context.rooms
      .map(
        (room) =>
          `- id=${room.id} | ${room.name}${room.capacity ? ` (seats ${room.capacity})` : ''}`,
      )
      .join('\n'),
    '',
    'Already scheduled — these slots are taken:',
    describeExisting(context),
    '',
    'Sessions still needing a slot:',
    describeQueue(context),
    context.guidance ? `\nOrganizer's guidance: ${context.guidance}` : '',
    '',
    'Place every queued session. Hard rules:',
    '1. Never put two sessions in one room at the same time. A session ending at 10:00 and one starting at 10:00 do NOT clash — that is fine and encouraged.',
    '2. Never schedule the same speaker in two overlapping sessions.',
    '3. Avoid running two sessions on the same track at once; attendees following a track should not have to choose.',
    '4. Start times must fall on a 15-minute boundary, inside the usable hours, on one of the listed days.',
    '5. Use each session\'s stated duration exactly.',
    '',
    'Prefer leaving a short gap between sessions in the same room for turnover, and spreading one speaker\'s talks across different days where possible.',
    '',
    'Reply with JSON only, no prose and no code fence:',
    '{"placements":[{"id":"<queue id>","dayKey":"YYYY-MM-DD","startMinute":<minutes from local midnight>,"roomId":"<room id>","rationale":"<one short sentence>"}],"notes":"<one or two sentences on the overall shape>"}',
  ].join('\n');
}

type RawPlacement = {
  id?: unknown;
  dayKey?: unknown;
  startMinute?: unknown;
  roomId?: unknown;
  rationale?: unknown;
};

/** Models wrap JSON in prose or a fence often enough that the first `{`…`}` is the reliable read. */
export function extractJson(text: string): { placements: RawPlacement[]; notes: string | null } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return { placements: [], notes: null };

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      placements?: unknown;
      notes?: unknown;
    };
    return {
      placements: Array.isArray(parsed.placements) ? (parsed.placements as RawPlacement[]) : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : null,
    };
  } catch {
    return { placements: [], notes: null };
  }
}

/**
 * The trust boundary. Each suggestion is checked against the real grid *including the suggestions
 * already accepted in this pass*, so the model cannot double-book two of its own placements.
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
    if (snapped < 0 || snapped + minutes > 1440) {
      rejected.push({ item, reason: 'The suggested slot ran outside the day' });
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
    // `AI stays advisory, never decides`: a suggestion that lands on a clash is dropped here rather
    // than handed to the organizer, whatever the event's conflict policy would let them save by
    // hand. The policy is about the organizer's own edits, not about what the model may propose.
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
      rejected.push({ item, reason: 'The assistant did not find a slot for this one' });
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

export async function proposeAgenda(context: ProposalContext): Promise<AgendaProposal> {
  if (context.queue.length === 0) {
    return {
      status: 'empty',
      placements: [],
      unplaced: [],
      notes: null,
      model: AGENDA_MODEL,
      message: 'Nothing is waiting for a slot.',
    };
  }
  if (context.rooms.length === 0) {
    return {
      status: 'empty',
      placements: [],
      unplaced: [],
      notes: null,
      model: AGENDA_MODEL,
      message: 'Add a room before asking for a draft agenda.',
    };
  }

  if (!available()) {
    const { placements, unplaced } = validateProposal(context, planLocally(context));
    return {
      status: 'ok',
      placements,
      unplaced,
      notes: 'Drafted by the built-in planner, which fills the earliest free slot in each room. It has no view of what makes two talks a bad pair, read it as a starting grid, not a programme.,
      model: null,
    };
  }

  try {
    const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
    const response = await client.messages.create({
      model: AGENDA_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system:
        'You are a conference programme planner. You produce a conflict-free draft schedule for a human organizer to review and edit. You never claim a slot is confirmed. Reply with JSON only.',
      messages: [{ role: 'user', content: buildPrompt(context) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const { placements: raw, notes } = extractJson(text);
    const { placements, unplaced } = validateProposal(context, raw);

    return { status: 'ok', placements, unplaced, notes, model: AGENDA_MODEL };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return {
      status: 'error',
      placements: [],
      unplaced: [],
      notes: null,
      model: AGENDA_MODEL,
      message: 'The agenda assistant could not be reached. The board is unaffected.',
    };
  }
}
