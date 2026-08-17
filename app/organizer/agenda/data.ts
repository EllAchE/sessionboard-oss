import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  event,
  participant,
  participantRole,
  room,
  scheduledSession,
  sessionFormat,
  submission,
  track,
  user,
} from '@/db/schema';
import { formatRef } from '@/lib/ids';
import type { NamedFormat, NamedRoom, NamedTrack } from './wire';
import {
  DEFAULT_SESSION_MINUTES,
  parseConflictPolicy,
  type ConflictPolicy,
  type QueueItem,
  type ScheduleEntry,
  type SpeakerRef,
  type SpeakerUnavailability,
} from '@/lib/services/schedule';
import { listEventUnavailability } from '@/lib/services/speaker-availability';

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
  };
  rooms: NamedRoom[];
  tracks: NamedTrack[];
  formats: NamedFormat[];
  entries: ScheduleEntry[];
  queue: QueueItem[];
  /**
   * `AD-2`. The blackout windows every speaker on this event has declared. Loaded with the rest of
   * the snapshot rather than on demand: the detector runs on every drag frame in the browser, and a
   * fetch per frame is not a thing that can work.
   */
  unavailability: SpeakerUnavailability[];
  /**
   * Session bodies, keyed by session id. `ScheduleEntry` deliberately has no description — the grid
   * never renders one — but the edit dialog does, and a form that opens blank would write the blank
   * back over it on save.
   */
  descriptions: Record<string, string>;
};

async function speakersBySubmission(
  submissionIds: string[],
): Promise<Map<string, SpeakerRef[]>> {
  const index = new Map<string, SpeakerRef[]>();
  if (submissionIds.length === 0) return index;

  const rows = await getDb()
    .select({
      submissionId: participantRole.submissionId,
      participantId: participantRole.participantId,
      position: participantRole.position,
      displayName: participant.displayName,
      userName: user.name,
      email: user.email,
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
      { participantId: row.participantId, name },
    ]);
  }
  return index;
}

export async function loadAgenda(eventId: string): Promise<AgendaData> {
  const db = getDb();

  const [eventRow, rooms, tracks, formats, sessions, accepted, unavailability] = await Promise.all([
    db.query.event.findFirst({ where: eq(event.id, eventId) }),
    db.query.room.findMany({ where: eq(room.eventId, eventId), orderBy: [asc(room.position)] }),
    db.query.track.findMany({ where: eq(track.eventId, eventId), orderBy: [asc(track.position)] }),
    db.query.sessionFormat.findMany({
      where: eq(sessionFormat.eventId, eventId),
      orderBy: [asc(sessionFormat.position)],
    }),
    db.query.scheduledSession.findMany({
      where: eq(scheduledSession.eventId, eventId),
      orderBy: [asc(scheduledSession.startsAt)],
    }),
    db.query.submission.findMany({
      where: and(eq(submission.eventId, eventId), eq(submission.status, 'accepted')),
      orderBy: [asc(submission.ref)],
    }),
    listEventUnavailability(eventId),
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
  const speakers = await speakersBySubmission(submissionIds);

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
    speakers: row.submissionId ? (speakers.get(row.submissionId) ?? []) : [],
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
        speakers: speakers.get(row.id) ?? [],
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

  return {
    event: {
      id: eventRow.id,
      name: eventRow.name,
      slug: eventRow.slug,
      timezone: eventRow.timezone,
      startsOn: eventRow.startsOn,
      endsOn: eventRow.endsOn,
      conflictPolicy: parseConflictPolicy(eventRow.agendaConflictPolicy),
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
    unavailability,
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
  unavailabilityToWire,
  unavailabilityFromWire,
  type NamedFormat,
  type NamedRoom,
  type NamedTrack,
  type WireEntry,
  type WireUnavailability,
} from './wire';
