import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  event as eventTable,
  participant,
  participantRole,
  room as roomTable,
  scheduledSession,
  sessionFormat,
  submission,
  submissionTag,
  tag as tagTable,
  track as trackTable,
  user as userTable,
} from '@/db/schema';
import { appUrl } from '@/lib/env';
import { notFound } from '@/lib/errors';
import { formatRef } from '@/lib/ids';
import type { EventPayload, SessionPayload, SpeakerPayload, SubmissionPayload } from './schemas';

/**
 * Read-only queries for the REST surface. The schedule and review services belong to other
 * workstreams and did not exist when this was written, so these live here rather than in their
 * files — nothing below writes, and every query is scoped to one event by construction.
 */

export type EventRow = typeof eventTable.$inferSelect;

export async function requireEvent(slug: string): Promise<EventRow> {
  const row = await getDb().query.event.findFirst({
    where: eq(eventTable.slug, slug),
  });
  if (!row) throw notFound('That event');
  return row;
}

export function toEventPayload(row: EventRow): EventPayload {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.descriptionMarkdown,
    eventType: row.eventType,
    theme: row.theme,
    timezone: row.timezone,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    websiteUrl: row.websiteUrl,
    venueName: row.venueName,
    venueAddress: row.venueAddress,
  };
}

export type SessionFilters = {
  status?: 'draft' | 'published' | 'cancelled';
  track?: string;
  room?: string;
};

/**
 * Defaults to published. An unauthenticated caller asking for drafts is asking to see an unfinished
 * schedule, so the filter is accepted but the rows are not: `draft` and `cancelled` are only
 * returned when `includeUnpublished` is set, which only the key-scoped callers pass.
 */
export async function listSessions(
  eventId: string,
  filters: SessionFilters = {},
  options: { includeUnpublished?: boolean } = {},
): Promise<SessionPayload[]> {
  const db = getDb();

  const conditions = [eq(scheduledSession.eventId, eventId)];
  const status = filters.status ?? 'published';
  if (status !== 'published' && !options.includeUnpublished) {
    return [];
  }
  conditions.push(eq(scheduledSession.status, status));

  const rows = await db
    .select({
      id: scheduledSession.id,
      ref: scheduledSession.ref,
      title: scheduledSession.title,
      description: scheduledSession.descriptionMarkdown,
      status: scheduledSession.status,
      startsAt: scheduledSession.startsAt,
      endsAt: scheduledSession.endsAt,
      ceuCredits: scheduledSession.ceuCredits,
      submissionId: scheduledSession.submissionId,
      roomId: scheduledSession.roomId,
      roomName: roomTable.name,
      trackId: scheduledSession.trackId,
      trackName: trackTable.name,
      formatName: sessionFormat.name,
    })
    .from(scheduledSession)
    .leftJoin(roomTable, eq(scheduledSession.roomId, roomTable.id))
    .leftJoin(trackTable, eq(scheduledSession.trackId, trackTable.id))
    .leftJoin(sessionFormat, eq(scheduledSession.formatId, sessionFormat.id))
    .where(and(...conditions))
    .orderBy(asc(scheduledSession.startsAt), asc(scheduledSession.ref));

  // Filters accept either the display name or the id, because a caller reading `/sessions` sees
  // names and a caller reading `/agenda` may already hold ids.
  const filtered = rows.filter((row) => {
    if (filters.track && row.trackName !== filters.track && row.trackId !== filters.track)
      return false;
    if (filters.room && row.roomName !== filters.room && row.roomId !== filters.room) return false;
    return true;
  });

  const speakersBySubmission = await loadSessionSpeakers(
    filtered.map((row) => row.submissionId).filter((id): id is string => Boolean(id)),
  );

  return filtered.map((row) => ({
    id: row.id,
    ref: formatRef('session', row.ref),
    title: row.title,
    description: row.description,
    status: row.status,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    room: row.roomName,
    track: row.trackName,
    format: row.formatName,
    ceuCredits: row.ceuCredits,
    speakers: row.submissionId ? (speakersBySubmission.get(row.submissionId) ?? []) : [],
  }));
}

type SessionSpeaker = SessionPayload['speakers'][number];

async function loadSessionSpeakers(
  submissionIds: string[],
): Promise<Map<string, SessionSpeaker[]>> {
  const out = new Map<string, SessionSpeaker[]>();
  if (submissionIds.length === 0) return out;

  const rows = await getDb()
    .select({
      submissionId: participantRole.submissionId,
      isPrimary: participantRole.isPrimary,
      id: participant.id,
      displayName: participant.displayName,
      jobTitle: participant.jobTitle,
      company: participant.company,
      userName: userTable.name,
      email: userTable.email,
    })
    .from(participantRole)
    .innerJoin(participant, eq(participantRole.participantId, participant.id))
    .innerJoin(userTable, eq(participant.userId, userTable.id))
    .where(inArray(participantRole.submissionId, submissionIds))
    .orderBy(asc(participantRole.position));

  for (const row of rows) {
    const list = out.get(row.submissionId) ?? [];
    list.push({
      id: row.id,
      name: row.displayName ?? row.userName ?? row.email,
      jobTitle: row.jobTitle,
      company: row.company,
      isPrimary: row.isPrimary,
    });
    out.set(row.submissionId, list);
  }

  return out;
}

/**
 * Public speakers are people on an accepted submission. Email is deliberately absent from this
 * payload — the endpoint is unauthenticated and a speaker list is exactly the shape a scraper wants.
 */
export async function listSpeakers(eventId: string): Promise<SpeakerPayload[]> {
  const db = getDb();

  const accepted = await db
    .select({
      submissionId: participantRole.submissionId,
      participantId: participantRole.participantId,
      position: participantRole.position,
      title: submission.title,
    })
    .from(participantRole)
    .innerJoin(submission, eq(participantRole.submissionId, submission.id))
    .where(and(eq(submission.eventId, eventId), eq(submission.status, 'accepted')))
    .orderBy(asc(participantRole.position));

  if (accepted.length === 0) return [];

  const participantIds = [...new Set(accepted.map((row) => row.participantId))];
  const people = await db
    .select({
      id: participant.id,
      displayName: participant.displayName,
      pronouns: participant.pronouns,
      jobTitle: participant.jobTitle,
      company: participant.company,
      bio: participant.bioMarkdown,
      headshotFileId: participant.headshotFileId,
      links: participant.links,
      userName: userTable.name,
      email: userTable.email,
    })
    .from(participant)
    .innerJoin(userTable, eq(participant.userId, userTable.id))
    .where(inArray(participant.id, participantIds));

  const sessionsByParticipant = new Map<string, { id: string; title: string }[]>();
  for (const row of accepted) {
    const list = sessionsByParticipant.get(row.participantId) ?? [];
    list.push({ id: row.submissionId, title: row.title });
    sessionsByParticipant.set(row.participantId, list);
  }

  return people
    .map((person) => ({
      id: person.id,
      name: person.displayName ?? person.userName ?? person.email,
      pronouns: person.pronouns,
      jobTitle: person.jobTitle,
      company: person.company,
      bio: person.bio,
      headshotUrl: person.headshotFileId ? `${appUrl()}/api/files/${person.headshotFileId}` : null,
      links: person.links ?? [],
      sessions: sessionsByParticipant.get(person.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSubmissions(
  eventId: string,
  filters: { status?: SubmissionPayload['status']; limit?: number } = {},
): Promise<SubmissionPayload[]> {
  const db = getDb();

  const conditions = [eq(submission.eventId, eventId)];
  if (filters.status) conditions.push(eq(submission.status, filters.status));

  const rows = await db
    .select({
      id: submission.id,
      ref: submission.ref,
      title: submission.title,
      description: submission.descriptionMarkdown,
      status: submission.status,
      level: submission.level,
      answers: submission.answers,
      submittedAt: submission.submittedAt,
      decidedAt: submission.decidedAt,
      trackName: trackTable.name,
      formatName: sessionFormat.name,
      submitterName: userTable.name,
      submitterEmail: userTable.email,
    })
    .from(submission)
    .leftJoin(trackTable, eq(submission.trackId, trackTable.id))
    .leftJoin(sessionFormat, eq(submission.formatId, sessionFormat.id))
    .innerJoin(userTable, eq(submission.submitterUserId, userTable.id))
    .where(and(...conditions))
    .orderBy(asc(submission.ref))
    .limit(filters.limit ?? 100);

  const tagsBySubmission = await loadTags(rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    ref: formatRef('submission', row.ref),
    title: row.title,
    description: row.description,
    status: row.status,
    track: row.trackName,
    format: row.formatName,
    level: row.level,
    tags: tagsBySubmission.get(row.id) ?? [],
    submitter: { name: row.submitterName, email: row.submitterEmail },
    answers: row.answers ?? {},
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  }));
}

async function loadTags(submissionIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (submissionIds.length === 0) return out;

  const rows = await getDb()
    .select({ submissionId: submissionTag.submissionId, name: tagTable.name })
    .from(submissionTag)
    .innerJoin(tagTable, eq(submissionTag.tagId, tagTable.id))
    .where(inArray(submissionTag.submissionId, submissionIds));

  for (const row of rows) {
    out.set(row.submissionId, [...(out.get(row.submissionId) ?? []), row.name]);
  }
  return out;
}

/**
 * Grouping happens in the event's timezone, not the server's: a 9pm session in Los Angeles is not
 * on tomorrow's agenda because the server runs in UTC.
 */
export function groupByDay(
  sessions: SessionPayload[],
  timezone: string,
): {
  days: { date: string; sessions: SessionPayload[] }[];
  unscheduled: SessionPayload[];
} {
  const byDate = new Map<string, SessionPayload[]>();
  const unscheduled: SessionPayload[] = [];

  for (const session of sessions) {
    if (!session.startsAt) {
      unscheduled.push(session);
      continue;
    }
    const date = localDate(new Date(session.startsAt), timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), session]);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, sessions: list }));

  return { days, unscheduled };
}

function localDate(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
