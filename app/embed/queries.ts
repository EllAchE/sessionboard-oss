import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
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
import { excerpt, markdownToText, renderMarkdown } from '@/lib/markdown';
import {
  sortSpeakers,
  speakerSlug,
  type PublicBundle,
  type PublicEvent,
  type PublicSession,
  type PublicSpeaker,
} from './model';

/**
 * The read model behind the embeds and the public event pages. Everything here is unauthenticated,
 * so the filters are structural rather than checked: only `published` scheduled sessions whose
 * submission is `approved` are ever loaded, and a speaker only appears because such a session names
 * them. There is no code path from this module to a draft, an unapproved abstract, a decision note
 * or an email address.
 *
 * All participant-authored text goes through `renderMarkdown`, never `renderTrustedMarkdown` — a
 * speaker bio is untrusted input that a stranger's website will iframe.
 *
 * This module reaches the database, so it is server-only. The pure half — types, filters, formatting
 * — lives in `./model` and is what the interactive widgets import.
 */

export * from './model';

const SAFE_LINK = /^https?:\/\//i;

export async function getPublicEvent(slug: string): Promise<PublicEvent | null> {
  const row = await getDb().query.event.findFirst({ where: eq(eventTable.slug, slug) });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    timezone: row.timezone,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    websiteUrl: row.websiteUrl,
    venueName: row.venueName,
  };
}

export async function loadPublicBundle(slug: string): Promise<PublicBundle | null> {
  const event = await getPublicEvent(slug);
  if (!event) return null;
  const db = getDb();

  const [scheduledRows, tracks, rooms, formats] = await Promise.all([
    db
      .select({ session: scheduledSession })
      .from(scheduledSession)
      .leftJoin(submission, eq(scheduledSession.submissionId, submission.id))
      .where(
        and(
          eq(scheduledSession.eventId, event.id),
          eq(scheduledSession.status, 'published'),
          or(isNull(scheduledSession.submissionId), eq(submission.contentStatus, 'approved')),
        ),
      )
      .orderBy(asc(scheduledSession.startsAt), asc(scheduledSession.ref)),
    db.query.track.findMany({ where: eq(trackTable.eventId, event.id) }),
    db.query.room.findMany({ where: eq(roomTable.eventId, event.id) }),
    db.query.sessionFormat.findMany({ where: eq(sessionFormat.eventId, event.id) }),
  ]);

  const sessionRows = scheduledRows.map((row) => row.session);

  const trackName = new Map(tracks.map((row) => [row.id, row.name]));
  const roomName = new Map(rooms.map((row) => [row.id, row.name]));
  const formatName = new Map(formats.map((row) => [row.id, row.name]));

  const submissionIds = sessionRows
    .map((row) => row.submissionId)
    .filter((id): id is string => Boolean(id));

  /**
   * The speaker link runs session → submission → participant_role → participant. A session with no
   * submission behind it (a keynote typed straight into the agenda) simply has no speakers, which
   * is correct rather than an error.
   */
  const [roleRows, tagRows] = await Promise.all([
    submissionIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ role: participantRole, person: participant, account: userTable })
          .from(participantRole)
          .innerJoin(participant, eq(participantRole.participantId, participant.id))
          .innerJoin(userTable, eq(participant.userId, userTable.id))
          .innerJoin(submission, eq(participantRole.submissionId, submission.id))
          .where(
            and(
              inArray(participantRole.submissionId, submissionIds),
              eq(submission.eventId, event.id),
              eq(submission.contentStatus, 'approved'),
            ),
          )
          .orderBy(asc(participantRole.position)),
    submissionIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            submissionId: submissionTag.submissionId,
            id: tagTable.id,
            name: tagTable.name,
          })
          .from(submissionTag)
          .innerJoin(tagTable, eq(tagTable.id, submissionTag.tagId))
          .innerJoin(submission, eq(submission.id, submissionTag.submissionId))
          .where(
            and(
              inArray(submissionTag.submissionId, submissionIds),
              eq(submission.eventId, event.id),
              eq(submission.contentStatus, 'approved'),
            ),
          )
          .orderBy(asc(tagTable.name)),
  ]);

  const bySubmission = new Map<string, typeof roleRows>();
  for (const row of roleRows) {
    const key = row.role.submissionId;
    bySubmission.set(key, [...(bySubmission.get(key) ?? []), row]);
  }

  const tagsBySubmission = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of tagRows) {
    tagsBySubmission.set(row.submissionId, [
      ...(tagsBySubmission.get(row.submissionId) ?? []),
      { id: row.id, name: row.name },
    ]);
  }

  const sessions: PublicSession[] = sessionRows.map((row) => {
    const linked = row.submissionId ? (bySubmission.get(row.submissionId) ?? []) : [];
    return {
      id: row.id,
      ref: row.ref,
      title: row.title,
      descriptionHtml: renderMarkdown(row.descriptionMarkdown),
      descriptionText: markdownToText(row.descriptionMarkdown).replace(/\s+/g, ' ').trim(),
      descriptionExcerpt: excerpt(row.descriptionMarkdown, 220),
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      room: row.roomId ? (roomName.get(row.roomId) ?? null) : null,
      track: row.trackId ? (trackName.get(row.trackId) ?? null) : null,
      trackId: row.trackId,
      format: row.formatId ? (formatName.get(row.formatId) ?? null) : null,
      ceuCredits: row.ceuCredits,
      tags: row.submissionId ? (tagsBySubmission.get(row.submissionId) ?? []) : [],
      speakers: linked.map((entry) => ({
        id: entry.person.id,
        name: entry.person.displayName?.trim() || entry.account.name?.trim() || 'Speaker',
        slug: speakerSlug(
          entry.person.id,
          entry.person.displayName?.trim() || entry.account.name?.trim() || 'Speaker',
        ),
        jobTitle: entry.person.jobTitle,
        company: entry.person.company,
      })),
    };
  });

  const speakerIndex = new Map<string, PublicSpeaker>();
  for (const session of sessions) {
    for (const speaker of session.speakers) {
      const existing = speakerIndex.get(speaker.id);
      if (existing) {
        existing.sessionIds.push(session.id);
        continue;
      }
      const source = roleRows.find((entry) => entry.person.id === speaker.id);
      if (!source) continue;
      speakerIndex.set(speaker.id, {
        id: speaker.id,
        slug: speakerSlug(speaker.id, speaker.name),
        name: speaker.name,
        pronouns: source.person.pronouns,
        jobTitle: source.person.jobTitle,
        company: source.person.company,
        bioHtml: renderMarkdown(source.person.bioMarkdown),
        bioText: markdownToText(source.person.bioMarkdown).replace(/\s+/g, ' ').trim(),
        bioExcerpt: excerpt(source.person.bioMarkdown, 240),
        headshotUrl: source.person.headshotFileId
          ? `/embed/${event.slug}/headshot/${source.person.headshotFileId}`
          : null,
        links: source.person.links.filter((link) => SAFE_LINK.test(link.url)),
        sessionIds: [session.id],
      });
    }
  }

  const usedTrackIds = new Set(sessions.map((row) => row.trackId).filter(Boolean));
  const usedRoomNames = new Set(sessions.map((row) => row.room).filter(Boolean));

  return {
    event,
    sessions,
    /** `EMB-04`: a directory is read by family name, so that is the order the read model hands out. */
    speakers: sortSpeakers([...speakerIndex.values()]),
    tracks: tracks
      .filter((row) => usedTrackIds.has(row.id))
      .map((row) => ({ id: row.id, name: row.name })),
    rooms: rooms
      .filter((row) => usedRoomNames.has(row.name))
      .map((row) => ({ id: row.id, name: row.name })),
  };
}
