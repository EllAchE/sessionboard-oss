import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  event,
  participant,
  participantRole,
  persona,
  room,
  scheduledSession,
  sessionFormat,
  submission,
  submissionTag,
  tag,
  track,
  user,
} from '@/db/schema';
import { formatRef } from '@/lib/ids';
import type { NamedFormat, NamedRoom, NamedTrack } from './wire';
import {
  parseAgendaOptimizationWeights,
  type AgendaItemSignals,
  type AgendaOptimizationWeights,
} from '@/lib/ai/agenda-optimizer';
import {
  DEFAULT_SESSION_MINUTES,
  parseConflictPolicy,
  type ConflictPolicy,
  type QueueItem,
  type ScheduleEntry,
  type SpeakerRef,
} from '@/lib/services/schedule';

type AgendaSpeaker = SpeakerRef & { popularityScore: number | null };

/**
 * The agenda's read model. Everything the board needs arrives in one payload so the grid, the side
 * rail and the conflicts view all read the same snapshot — three separate fetches would let the
 * rail advertise a submission the grid has already scheduled.
 *
 * Domain logic stays in `lib/services/schedule.ts`; this module only shapes rows.
 */


export type AgendaData = {
  event: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    startsOn: string | null;
    endsOn: string | null;
    /** `AR-35`. Whether a detected clash refuses the write or is recorded as a warning. */
    conflictPolicy: ConflictPolicy;
    optimizationWeights: AgendaOptimizationWeights;
  };
  rooms: NamedRoom[];
  tracks: NamedTrack[];
  formats: NamedFormat[];
  entries: ScheduleEntry[];
  queue: QueueItem[];
  optimizationSignals: Record<string, AgendaItemSignals>;
  /**
   * Session bodies, keyed by session id. `ScheduleEntry` deliberately has no description — the grid
   * never renders one — but the edit dialog does, and a form that opens blank would write the blank
   * back over it on save.
   */
  descriptions: Record<string, string>;
};

async function speakersBySubmission(
  submissionIds: string[],
): Promise<Map<string, AgendaSpeaker[]>> {
  const index = new Map<string, AgendaSpeaker[]>();
  if (submissionIds.length === 0) return index;

  const rows = await getDb()
    .select({
      submissionId: participantRole.submissionId,
      participantId: participantRole.participantId,
      position: participantRole.position,
      displayName: participant.displayName,
      userName: user.name,
      email: user.email,
      popularityScore: participant.popularityScore,
    })
    .from(participantRole)
    .innerJoin(participant, eq(participant.id, participantRole.participantId))
    .innerJoin(user, eq(user.id, participant.userId))
    .where(inArray(participantRole.submissionId, submissionIds))
    .orderBy(asc(participantRole.position));

  for (const row of rows) {
    const name = row.displayName ?? row.userName ?? row.email;
    index.set(row.submissionId, [
      ...(index.get(row.submissionId) ?? []),
      { participantId: row.participantId, name, popularityScore: row.popularityScore },
    ]);
  }
  return index;
}

function speakerRefs(rows: AgendaSpeaker[]): SpeakerRef[] {
  return rows.map(({ participantId, name }) => ({ participantId, name }));
}

async function tagsBySubmission(submissionIds: string[]): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();
  if (submissionIds.length === 0) return index;

  const rows = await getDb()
    .select({ submissionId: submissionTag.submissionId, name: tag.name })
    .from(submissionTag)
    .innerJoin(tag, eq(tag.id, submissionTag.tagId))
    .where(inArray(submissionTag.submissionId, submissionIds));
  for (const row of rows) {
    index.set(row.submissionId, [...(index.get(row.submissionId) ?? []), row.name]);
  }
  return index;
}

export async function loadAgenda(eventId: string): Promise<AgendaData> {
  const db = getDb();

  const [eventRow, rooms, tracks, formats, personas, sessions, accepted] = await Promise.all([
    db.query.event.findFirst({ where: eq(event.id, eventId) }),
    db.query.room.findMany({ where: eq(room.eventId, eventId), orderBy: [asc(room.position)] }),
    db.query.track.findMany({ where: eq(track.eventId, eventId), orderBy: [asc(track.position)] }),
    db.query.sessionFormat.findMany({
      where: eq(sessionFormat.eventId, eventId),
      orderBy: [asc(sessionFormat.position)],
    }),
    db.query.persona.findMany({
      where: eq(persona.eventId, eventId),
      orderBy: [asc(persona.position)],
    }),
    db.query.scheduledSession.findMany({
      where: eq(scheduledSession.eventId, eventId),
      orderBy: [asc(scheduledSession.startsAt)],
    }),
    db.query.submission.findMany({
      where: and(eq(submission.eventId, eventId), eq(submission.status, 'accepted')),
      orderBy: [asc(submission.ref)],
    }),
  ]);

  if (!eventRow) {
    throw new Error('That event could not be found');
  }

  const submissionIds = [
    ...new Set([
      ...accepted.map((row) => row.id),
      ...sessions.map((row) => row.submissionId).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const acceptedIds = new Set(accepted.map((row) => row.id));
  const linkedSubmissionIds = submissionIds.filter((id) => !acceptedIds.has(id));
  const [speakers, submissionTags, linkedSubmissions] = await Promise.all([
    speakersBySubmission(submissionIds),
    tagsBySubmission(submissionIds),
    linkedSubmissionIds.length > 0
      ? db.query.submission.findMany({ where: inArray(submission.id, linkedSubmissionIds) })
      : Promise.resolve([] as typeof accepted),
  ]);

  const entries: ScheduleEntry[] = sessions.map((row) => ({
    id: row.id,
    ref: row.ref,
    title: row.title,
    submissionId: row.submissionId,
    roomId: row.roomId,
    trackId: row.trackId,
    formatId: row.formatId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    ceuCredits: row.ceuCredits,
    clientId: row.clientId,
    speakers: row.submissionId ? speakerRefs(speakers.get(row.submissionId) ?? []) : [],
  }));

  const durationByFormat = new Map(formats.map((row) => [row.id, row.durationMinutes]));
  const descriptionBySession = new Map(
    sessions.map((row) => [row.id, row.descriptionMarkdown]),
  );
  const scheduledSubmissionIds = new Set(
    sessions.map((row) => row.submissionId).filter((id): id is string => Boolean(id)),
  );

  /**
   * `A-5`. Two things belong in the rail: an accepted submission with no session row yet, and a
   * session whose time was cleared. Both are "waiting for a slot" and an organizer should not have
   * to know which is which.
   */
  const queue: QueueItem[] = [
    ...accepted
      .filter((row) => !scheduledSubmissionIds.has(row.id))
      .map((row) => ({
        kind: 'submission' as const,
        id: row.id,
        ref: formatRef('submission', row.ref),
        title: row.title,
        descriptionMarkdown: row.descriptionMarkdown,
        trackId: row.trackId,
        formatId: row.formatId,
        durationMinutes:
          (row.formatId ? durationByFormat.get(row.formatId) : undefined) ??
          DEFAULT_SESSION_MINUTES,
        speakers: speakerRefs(speakers.get(row.id) ?? []),
      })),
    ...entries
      .filter((entry) => entry.status !== 'cancelled' && (!entry.startsAt || !entry.endsAt))
      .map((entry) => ({
        kind: 'session' as const,
        id: entry.id,
        ref: formatRef('session', entry.ref),
        title: entry.title,
        descriptionMarkdown: descriptionBySession.get(entry.id) ?? null,
        trackId: entry.trackId,
        formatId: entry.formatId,
        durationMinutes:
          (entry.formatId ? durationByFormat.get(entry.formatId) : undefined) ??
          DEFAULT_SESSION_MINUTES,
        speakers: entry.speakers,
      })),
  ];

  const submissionById = new Map(
    [...accepted, ...linkedSubmissions].map((row) => [row.id, row]),
  );
  const trackNameById = new Map(tracks.map((row) => [row.id, row.name]));
  const formatNameById = new Map(formats.map((row) => [row.id, row.name]));
  const personaNameById = new Map(personas.map((row) => [row.id, row.name]));
  const signalsFor = (
    title: string,
    descriptionMarkdown: string | null,
    trackId: string | null,
    formatId: string | null,
    source: (typeof accepted)[number] | undefined,
    speakerRows: AgendaSpeaker[],
  ): AgendaItemSignals => ({
    title,
    descriptionMarkdown,
    trackName: trackId ? (trackNameById.get(trackId) ?? null) : null,
    tags: source ? (submissionTags.get(source.id) ?? []) : [],
    personaName: source?.personaId ? (personaNameById.get(source.personaId) ?? null) : null,
    level: source?.level ?? null,
    formatName: formatId ? (formatNameById.get(formatId) ?? null) : null,
    expectedAttendance: source?.expectedAttendance ?? null,
    speakerPopularity: speakerRows
      .map((speaker) => speaker.popularityScore)
      .filter((score): score is number => typeof score === 'number'),
  });
  const optimizationSignals: Record<string, AgendaItemSignals> = Object.fromEntries([
    ...accepted.map((row) => [
      row.id,
      signalsFor(
        row.title,
        row.descriptionMarkdown,
        row.trackId,
        row.formatId,
        row,
        speakers.get(row.id) ?? [],
      ),
    ] as const),
    ...sessions.map((row) => {
      const source = row.submissionId ? submissionById.get(row.submissionId) : undefined;
      return [
        row.id,
        signalsFor(
          row.title,
          row.descriptionMarkdown,
          row.trackId,
          row.formatId,
          source,
          row.submissionId ? (speakers.get(row.submissionId) ?? []) : [],
        ),
      ] as const;
    }),
  ]);

  return {
    event: {
      id: eventRow.id,
      name: eventRow.name,
      slug: eventRow.slug,
      timezone: eventRow.timezone,
      startsOn: eventRow.startsOn,
      endsOn: eventRow.endsOn,
      conflictPolicy: parseConflictPolicy(eventRow.agendaConflictPolicy),
      optimizationWeights: parseAgendaOptimizationWeights(eventRow.agendaOptimizationWeights),
    },
    rooms: rooms.map((row) => ({
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      floor: row.floor,
    })),
    tracks: tracks.map((row) => ({ id: row.id, name: row.name, color: row.color })),
    formats: formats.map((row) => ({
      id: row.id,
      name: row.name,
      durationMinutes: row.durationMinutes,
    })),
    entries,
    queue,
    optimizationSignals,
    descriptions: Object.fromEntries(
      sessions
        .filter((row) => row.descriptionMarkdown)
        .map((row) => [row.id, row.descriptionMarkdown as string]),
    ),
  };
}

export {
  toWire,
  fromWire,
  type NamedFormat,
  type NamedRoom,
  type NamedTrack,
  type WireEntry,
} from './wire';
