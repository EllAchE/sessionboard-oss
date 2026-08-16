import {
  DEFAULT_SESSION_MINUTES,
  addMinutes,
  detectConflicts,
  isPlaced,
  overlaps,
  provisionalEntry,
  zonedTimeToUtc,
  type QueueItem,
  type ScheduleEntry,
} from '@/lib/services/schedule';

export type AgendaOptimizationWeights = {
  audienceOverlap: number;
  expectedAttendance: number;
  speakerPopularity: number;
  roomFit: number;
  venueFlow: number;
  scheduleCompactness: number;
};

export const DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS: AgendaOptimizationWeights = {
  audienceOverlap: 85,
  expectedAttendance: 100,
  speakerPopularity: 55,
  roomFit: 90,
  venueFlow: 30,
  scheduleCompactness: 35,
};

const WEIGHT_KEYS = Object.keys(DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS) as Array<
  keyof AgendaOptimizationWeights
>;

export function parseAgendaOptimizationWeights(value: unknown): AgendaOptimizationWeights {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    WEIGHT_KEYS.map((key) => {
      const parsed = Number(candidate[key]);
      const fallback = DEFAULT_AGENDA_OPTIMIZATION_WEIGHTS[key];
      return [
        key,
        Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback,
      ];
    }),
  ) as AgendaOptimizationWeights;
}

export type AgendaItemSignals = {
  title: string;
  descriptionMarkdown: string | null;
  trackName: string | null;
  tags: string[];
  personaName: string | null;
  level: string | null;
  formatName: string | null;
  expectedAttendance: number | null;
  speakerPopularity: number[];
};

export type AgendaOptimizationRoom = {
  id: string;
  name: string;
  capacity: number | null;
  floor: string | null;
};

export type AgendaOptimizationContext = {
  timezone: string;
  dayKeys: string[];
  dayStartMinute: number;
  dayEndMinute: number;
  rooms: AgendaOptimizationRoom[];
  entries: ScheduleEntry[];
  queue: QueueItem[];
  signalsByItemId: Record<string, AgendaItemSignals>;
  weights: AgendaOptimizationWeights;
};

export type OptimizedPlacement = {
  id: string;
  dayKey: string;
  startMinute: number;
  roomId: string;
  rationale: string;
};

type AudienceSimilarity = { score: number; reasons: string[] };
type Demand = {
  normalized: number;
  estimatedAttendance: number | null;
  popularity: number | null;
};
type PlacedReference = {
  entry: ScheduleEntry & { startsAt: Date; endsAt: Date };
  signalId: string;
  room: AgendaOptimizationRoom | null;
};
type Candidate = {
  dayKey: string;
  dayIndex: number;
  startMinute: number;
  room: AgendaOptimizationRoom;
  roomIndex: number;
  entry: ScheduleEntry & { startsAt: Date; endsAt: Date };
  score: number;
};

const SLOT_STEP_MINUTES = 15;
const VENUE_FLOW_WINDOW_MINUTES = 30;
const STOP_WORDS = new Set([
  'about',
  'after',
  'against',
  'also',
  'and',
  'are',
  'before',
  'being',
  'between',
  'conference',
  'from',
  'have',
  'into',
  'its',
  'more',
  'our',
  'session',
  'that',
  'the',
  'their',
  'this',
  'through',
  'talk',
  'they',
  'using',
  'what',
  'when',
  'where',
  'which',
  'will',
  'with',
  'your',
]);

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedWords(value: string | null | undefined): Set<string> {
  const words = (value ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
}

function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function sharedValues(left: Set<string>, right: Set<string>, limit = 3): string[] {
  return [...left]
    .filter((value) => right.has(value))
    .sort()
    .slice(0, limit);
}

export function audienceSimilarity(
  left: AgendaItemSignals | undefined,
  right: AgendaItemSignals | undefined,
): AudienceSimilarity {
  if (!left || !right) return { score: 0, reasons: [] };

  const leftTags = normalizedWords(left.tags.join(' '));
  const rightTags = normalizedWords(right.tags.join(' '));
  const sharedTags = sharedValues(leftTags, rightTags);
  const tagScore = overlapCoefficient(leftTags, rightTags);

  const leftContent = normalizedWords(`${left.title}\n${left.descriptionMarkdown ?? ''}`);
  const rightContent = normalizedWords(`${right.title}\n${right.descriptionMarkdown ?? ''}`);
  const sharedTopics = sharedValues(leftContent, rightContent);
  const contentScore = overlapCoefficient(leftContent, rightContent);

  const sameTrack = Boolean(left.trackName && left.trackName === right.trackName);
  const samePersona = Boolean(left.personaName && left.personaName === right.personaName);
  const sameLevel = Boolean(left.level && left.level === right.level);
  const sameFormat = Boolean(left.formatName && left.formatName === right.formatName);
  const relatedContent = tagScore > 0 || contentScore > 0 || sameTrack || samePersona;
  const score = clamp(
    tagScore * 0.35 +
      contentScore * 0.35 +
      (sameTrack ? 0.2 : 0) +
      (samePersona ? 0.07 : 0) +
      (sameLevel && relatedContent ? 0.03 : 0) +
      (sameFormat && relatedContent ? 0.03 : 0),
  );

  const reasons = [
    ...(sameTrack ? [`the ${left.trackName} track`] : []),
    ...(sharedTags.length > 0 ? [`tags ${sharedTags.join(', ')}`] : []),
    ...(sharedTopics.length > 0 ? [`topics ${sharedTopics.join(', ')}`] : []),
    ...(samePersona ? [`the ${left.personaName} audience`] : []),
    ...(sameFormat && relatedContent ? [`the ${left.formatName} format`] : []),
  ];
  return { score, reasons };
}

function knownCapacities(rooms: AgendaOptimizationRoom[]): number[] {
  return rooms
    .map((room) => room.capacity)
    .filter((capacity): capacity is number => typeof capacity === 'number' && capacity > 0)
    .sort((left, right) => left - right);
}

function demandFor(
  signals: AgendaItemSignals | undefined,
  rooms: AgendaOptimizationRoom[],
  weights: AgendaOptimizationWeights,
): Demand {
  const capacities = knownCapacities(rooms);
  const largestRoom = capacities.at(-1) ?? null;
  const expected = signals?.expectedAttendance ?? null;
  const popularityValues = signals?.speakerPopularity.filter((score) => score >= 0) ?? [];
  const popularity = popularityValues.length > 0 ? Math.max(...popularityValues) : null;

  const components: Array<{ value: number; weight: number }> = [];
  if (expected !== null && largestRoom && weights.expectedAttendance > 0) {
    components.push({
      value: clamp(expected / largestRoom),
      weight: weights.expectedAttendance,
    });
  }
  if (popularity !== null && weights.speakerPopularity > 0) {
    components.push({
      value: clamp(popularity / 100),
      weight: weights.speakerPopularity,
    });
  }

  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const normalized =
    totalWeight > 0
      ? components.reduce((sum, component) => sum + component.value * component.weight, 0) /
        totalWeight
      : 0.5;

  return {
    normalized,
    estimatedAttendance:
      components.length > 0 && largestRoom
        ? Math.max(1, Math.round(normalized * largestRoom))
        : null,
    popularity,
  };
}

function roomFitPenalty(
  room: AgendaOptimizationRoom,
  demand: Demand,
  rooms: AgendaOptimizationRoom[],
): number {
  const capacities = knownCapacities(rooms);
  const largestRoom = capacities.at(-1);
  if (!largestRoom || !room.capacity || !demand.estimatedAttendance) {
    return room.capacity ? 0 : 0.25;
  }

  const overflow = Math.max(0, demand.estimatedAttendance - room.capacity) / largestRoom;
  const unused = Math.max(0, room.capacity - demand.estimatedAttendance) / largestRoom;
  return overflow * 4 + unused * 0.4;
}

function gapMinutes(
  left: { startsAt: Date; endsAt: Date },
  right: { startsAt: Date; endsAt: Date },
): number | null {
  if (overlaps(left, right)) return null;
  const gap =
    left.endsAt.getTime() <= right.startsAt.getTime()
      ? right.startsAt.getTime() - left.endsAt.getTime()
      : left.startsAt.getTime() - right.endsAt.getTime();
  return gap / 60_000;
}

function candidateScore(
  context: AgendaOptimizationContext,
  item: QueueItem,
  candidate: Omit<Candidate, 'score'>,
  references: PlacedReference[],
  demand: Demand,
): number {
  const signals = context.signalsByItemId[item.id];
  const slotsPerDay = Math.max(
    1,
    Math.ceil((context.dayEndMinute - context.dayStartMinute) / SLOT_STEP_MINUTES),
  );
  const ordinal =
    candidate.dayIndex * slotsPerDay +
    Math.floor((candidate.startMinute - context.dayStartMinute) / SLOT_STEP_MINUTES);
  const totalOrdinals = Math.max(1, context.dayKeys.length * slotsPerDay - 1);
  let score = (ordinal / totalOrdinals) * context.weights.scheduleCompactness;
  score += roomFitPenalty(candidate.room, demand, context.rooms) * context.weights.roomFit;

  for (const reference of references) {
    const similarity = audienceSimilarity(signals, context.signalsByItemId[reference.signalId]);
    if (similarity.score === 0) continue;

    if (overlaps(candidate.entry, reference.entry)) {
      score += similarity.score * context.weights.audienceOverlap;
      continue;
    }

    const gap = gapMinutes(candidate.entry, reference.entry);
    if (
      gap !== null &&
      gap <= VENUE_FLOW_WINDOW_MINUTES &&
      candidate.room.floor &&
      reference.room?.floor &&
      candidate.room.floor !== reference.room.floor
    ) {
      score += similarity.score * context.weights.venueFlow;
    }
  }

  return score;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const scoreDifference = left.score - right.score;
  if (Math.abs(scoreDifference) > 0.000_001) return scoreDifference;
  return (
    left.dayIndex - right.dayIndex ||
    left.startMinute - right.startMinute ||
    left.roomIndex - right.roomIndex
  );
}

function relatedReference(
  context: AgendaOptimizationContext,
  item: QueueItem,
  candidate: Candidate,
  references: PlacedReference[],
): { reference: PlacedReference; similarity: AudienceSimilarity } | null {
  const signals = context.signalsByItemId[item.id];
  return (
    references
      .map((reference) => ({
        reference,
        similarity: audienceSimilarity(signals, context.signalsByItemId[reference.signalId]),
      }))
      .filter(
        (row) => row.similarity.score >= 0.12 && !overlaps(candidate.entry, row.reference.entry),
      )
      .sort((left, right) => right.similarity.score - left.similarity.score)[0] ?? null
  );
}

function placementRationale(
  context: AgendaOptimizationContext,
  item: QueueItem,
  candidate: Candidate,
  demand: Demand,
  references: PlacedReference[],
): string {
  const signals = context.signalsByItemId[item.id];
  const demandInputs = [
    ...(signals?.expectedAttendance !== null && signals?.expectedAttendance !== undefined
      ? [`forecast ${signals.expectedAttendance}`]
      : []),
    ...(demand.popularity !== null ? [`speaker popularity ${demand.popularity}/100`] : []),
  ];
  const estimated = demand.estimatedAttendance
    ? `Estimated audience ${demand.estimatedAttendance}${demandInputs.length > 0 ? ` from ${demandInputs.join(' and ')}` : ''}`
    : 'No numeric demand forecast';
  const room = candidate.room.capacity
    ? `matched to ${candidate.room.name} (${candidate.room.capacity} seats)`
    : `placed in ${candidate.room.name}`;
  const related = relatedReference(context, item, candidate, references);
  const separation = related
    ? ` Separated from “${related.reference.entry.title}” because they share ${related.similarity.reasons[0] ?? 'audience signals'}.`
    : '';
  return `${estimated}; ${room}.${separation}`;
}

function queueOrder(context: AgendaOptimizationContext): QueueItem[] {
  const demandById = new Map(
    context.queue.map((item) => [
      item.id,
      demandFor(context.signalsByItemId[item.id], context.rooms, context.weights),
    ]),
  );
  const connectedness = new Map(
    context.queue.map((item) => [
      item.id,
      context.queue.reduce(
        (sum, other) =>
          other.id === item.id
            ? sum
            : sum +
              audienceSimilarity(
                context.signalsByItemId[item.id],
                context.signalsByItemId[other.id],
              ).score,
        0,
      ),
    ]),
  );

  return [...context.queue].sort(
    (left, right) =>
      (demandById.get(right.id)?.normalized ?? 0) - (demandById.get(left.id)?.normalized ?? 0) ||
      (connectedness.get(right.id) ?? 0) - (connectedness.get(left.id) ?? 0) ||
      right.durationMinutes - left.durationMinutes ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
}

export function optimizeAgenda(context: AgendaOptimizationContext): OptimizedPlacement[] {
  const world = [...context.entries];
  const roomById = new Map(context.rooms.map((room) => [room.id, room]));
  const references: PlacedReference[] = context.entries.filter(isPlaced).map((entry) => ({
    entry,
    signalId: entry.id,
    room: entry.roomId ? (roomById.get(entry.roomId) ?? null) : null,
  }));
  const placements: OptimizedPlacement[] = [];

  for (const item of queueOrder(context)) {
    const minutes = item.durationMinutes || DEFAULT_SESSION_MINUTES;
    const demand = demandFor(context.signalsByItemId[item.id], context.rooms, context.weights);
    const candidates: Candidate[] = [];

    for (const [dayIndex, dayKey] of context.dayKeys.entries()) {
      for (
        let startMinute = context.dayStartMinute;
        startMinute + minutes <= context.dayEndMinute;
        startMinute += SLOT_STEP_MINUTES
      ) {
        for (const [roomIndex, room] of context.rooms.entries()) {
          const startsAt = zonedTimeToUtc(dayKey, startMinute, context.timezone);
          const provisional = provisionalEntry(item, {
            sessionId: `proposed-${item.id}`,
            roomId: room.id,
            startsAt,
            endsAt: addMinutes(startsAt, minutes),
          });
          const conflicts = detectConflicts([...world, provisional]).some((conflict) =>
            conflict.sessionIds.includes(provisional.id),
          );
          if (conflicts || !isPlaced(provisional)) continue;

          const candidate = {
            dayKey,
            dayIndex,
            startMinute,
            room,
            roomIndex,
            entry: provisional,
          };
          candidates.push({
            ...candidate,
            score: candidateScore(context, item, candidate, references, demand),
          });
        }
      }
    }

    const chosen = candidates.sort(compareCandidates)[0];
    if (!chosen) continue;

    placements.push({
      id: item.id,
      dayKey: chosen.dayKey,
      startMinute: chosen.startMinute,
      roomId: chosen.room.id,
      rationale: placementRationale(context, item, chosen, demand, references),
    });
    world.push(chosen.entry);
    references.push({
      entry: chosen.entry,
      signalId: item.id,
      room: chosen.room,
    });
  }

  return placements;
}
