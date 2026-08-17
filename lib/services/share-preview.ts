import { and, asc, eq, inArray, or } from 'drizzle-orm';
import {
  event as eventTable,
  participant,
  participantRole,
  room as roomTable,
  scheduledSession,
  sessionFormat,
  sponsor,
  submission,
  submissionTag,
  tag as tagTable,
  track as trackTable,
  user as userTable,
} from '@/db/schema';
import { getDb } from '@/db/client';
import {
  sortSpeakers,
  speakerSlug,
  type PublicBundle,
  type PublicEvent,
  type PublicSession,
  type PublicSpeaker,
} from '@/app/embed/model';
import { eventBrandingUrl } from '@/lib/event-branding';
import { excerpt, markdownToText, renderMarkdown } from '@/lib/markdown';
import { publicSponsorLogoUrl } from '@/lib/sponsor-branding';
import { speakerHeadshotPath } from '@/lib/speaker-headshot';

/**
 * `AD-9` — the read model behind a share link, and the one place in this codebase that reads
 * programme rows the publication predicates would hide. Everything about this module is the answer
 * to "what may a link bypass", so the reasoning is here rather than spread over the callers.
 *
 * ## Why a bypass exists at all
 *
 * A share link that showed only published content would have no reason to exist: that content
 * already has a public URL an organizer can paste into an email. The entire use case — send the
 * draft agenda to the keynote speaker, the sponsor, or the venue contact for comment before it goes
 * live — is content that is deliberately *not* public yet. So the bypass is the feature, and the
 * job is to make it as narrow as it can be while still being worth shipping.
 *
 * ## Exactly what is widened
 *
 * One predicate family, in one direction: **the programme's publication gate**.
 *
 *   - Sessions: `status` may be `draft` as well as `published`. `cancelled` stays out — a slot the
 *     organizer killed is not part of the draft they are circulating, and showing it invites the
 *     reader to comment on something that no longer exists.
 *   - Session copy: `submission.content_status` is not required to be `approved`, because an
 *     abstract still being argued over is precisely what an organizer wants notes on.
 *   - Speaker lines: a participant attached to a session appears on it regardless of
 *     `workflow_status`, because a draft agenda whose speaker names are all blank is not an agenda.
 *   - Sponsors: `status` may be `draft`, so a sponsor can check their own placement before launch.
 *
 * ## Exactly what is NOT widened, and why the narrowing is structural
 *
 * Everything else. Reviews, scores, decisions, reviewer identities, internal notes, tasks, CRM
 * records, budget, submitter identities, files and the mail log are not widened because this module
 * never reads their tables at all — a share link cannot reach them by any parameter the bearer
 * controls, because there is no such parameter.
 *
 * Personal data is excluded the same structural way. This module's return type is `PublicBundle`,
 * the same type the anonymous embeds render. `PublicSpeaker` has fields for a display name,
 * pronouns, job title, company, bio, headshot and self-declared links, and it has no field for an
 * email address, a phone number, a salutation, a gender, a timezone, dietary notes, accessibility
 * notes, or the workflow status itself. So the widening below changes *which rows* are selected and
 * never *which columns* — a share link cannot leak a speaker's dietary requirements because there
 * is nowhere in the shape it returns to put them.
 *
 * Headshots are the one deliberate degradation. `/embed/[slug]/headshot/[fileId]` serves a file only
 * when it belongs to a confirmed participant already visible through `loadPublicBundle`, and
 * widening that route would mean an unauthenticated image endpoint for non-public people. Instead an
 * unconfirmed speaker's `headshotUrl` is nulled here, so the widgets fall back to initials rather
 * than rendering a broken image.
 */

const SAFE_LINK = /^https?:\/\//i;

/** `draft` and `published`; `cancelled` is not part of a draft worth circulating. */
const PREVIEWABLE_SESSION_STATUS = ['draft', 'published'] as const;

export async function getShareEvent(eventId: string): Promise<PublicEvent | null> {
  const row = await getDb().query.event.findFirst({ where: eq(eventTable.id, eventId) });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    timezone: row.timezone,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    endsAt: row.endsAt.toISOString(),
    websiteUrl: row.websiteUrl,
    venueName: row.venueName,
    eventType: row.eventType,
    logoUrl: eventBrandingUrl(row.slug, row.logoFileId),
    bannerUrl: eventBrandingUrl(row.slug, row.bannerFileId),
  };
}

/**
 * Takes an `eventId` and never a slug. The caller has one because it came off the resolved token
 * row, which is what makes "a token for event A cannot read event B" structural rather than checked:
 * the bearer supplies no event identifier at any point in the request.
 */
export async function loadSharePreviewBundle(eventId: string): Promise<PublicBundle | null> {
  const event = await getShareEvent(eventId);
  if (!event) return null;
  const db = getDb();

  const [sessionRows, tracks, rooms, formats, sponsorRows] = await Promise.all([
    db
      .select({ session: scheduledSession })
      .from(scheduledSession)
      .where(
        and(
          eq(scheduledSession.eventId, event.id),
          inArray(scheduledSession.status, [...PREVIEWABLE_SESSION_STATUS]),
        ),
      )
      .orderBy(asc(scheduledSession.startsAt), asc(scheduledSession.ref)),
    db.query.track.findMany({ where: eq(trackTable.eventId, event.id) }),
    db.query.room.findMany({ where: eq(roomTable.eventId, event.id) }),
    db.query.sessionFormat.findMany({ where: eq(sessionFormat.eventId, event.id) }),
    db
      .select()
      .from(sponsor)
      .where(eq(sponsor.eventId, event.id))
      .orderBy(asc(sponsor.kind), asc(sponsor.position), asc(sponsor.createdAt)),
  ]);

  const sessions = sessionRows.map((row) => row.session);
  const trackName = new Map(tracks.map((row) => [row.id, row.name]));
  const roomName = new Map(rooms.map((row) => [row.id, row.name]));
  const formatName = new Map(formats.map((row) => [row.id, row.name]));

  const submissionIds = sessions
    .map((row) => row.submissionId)
    .filter((value): value is string => Boolean(value));

  /**
   * The `submission.eventId` predicate is redundant given the sessions were already event-scoped,
   * and is kept anyway: it makes every join in this file independently tenant-safe, so a later edit
   * to the session query cannot silently turn one of these into a cross-event read.
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
              eq(participant.eventId, event.id),
            ),
          )
          .orderBy(asc(participantRole.position)),
    submissionIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ submissionId: submissionTag.submissionId, id: tagTable.id, name: tagTable.name })
          .from(submissionTag)
          .innerJoin(tagTable, eq(tagTable.id, submissionTag.tagId))
          .innerJoin(submission, eq(submission.id, submissionTag.submissionId))
          .where(
            and(inArray(submissionTag.submissionId, submissionIds), eq(submission.eventId, event.id)),
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

  const previewSessions: PublicSession[] = sessions.map((row) => {
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
      icsUid: row.icsUid,
      icsSequence: row.icsSequence,
      /**
       * Always null. A recording is a published artefact with its own embargo rules in
       * `recordingPublicationIssue`, and nothing about circulating a draft agenda for comment needs
       * it — so the draft preview does not reopen that question.
       */
      recordingUrl: null,
      tags: row.submissionId ? (tagsBySubmission.get(row.submissionId) ?? []) : [],
      speakers: linked.map((entry) => {
        const name = entry.person.displayName?.trim() || entry.account.name?.trim() || 'Speaker';
        return {
          id: entry.person.id,
          name,
          slug: speakerSlug(entry.person.id, name),
          jobTitle: entry.person.jobTitle,
          company: entry.person.company,
        };
      }),
    };
  });

  /**
   * The directory is the people on the shared programme, plus the event's confirmed roster — not
   * every participant row. An organizer's pipeline of invited-but-unanswered speakers is not part of
   * the agenda they are circulating, so someone who appears nowhere on it stays out.
   */
  const onProgramme = [...new Set(roleRows.map((row) => row.person.id))];
  // `inArray` with an empty list is not a predicate worth emitting, so it only joins the `or` when
  // the shared programme actually names somebody.
  const visibleSpeaker =
    onProgramme.length === 0
      ? eq(participant.workflowStatus, 'confirmed')
      : or(eq(participant.workflowStatus, 'confirmed'), inArray(participant.id, onProgramme));

  const directoryRows = await db
    .select({ person: participant, account: userTable })
    .from(participant)
    .innerJoin(userTable, eq(participant.userId, userTable.id))
    .where(and(eq(participant.eventId, event.id), visibleSpeaker))
    .orderBy(asc(participant.displayName), asc(userTable.name));

  const speakerIndex = new Map<string, PublicSpeaker>(
    directoryRows.map((row) => {
      const name = row.person.displayName?.trim() || row.account.name?.trim() || 'Speaker';
      const speaker: PublicSpeaker = {
        id: row.person.id,
        slug: speakerSlug(row.person.id, name),
        name,
        pronouns: row.person.pronouns,
        jobTitle: row.person.jobTitle,
        company: row.person.company,
        bioHtml: renderMarkdown(row.person.bioMarkdown),
        bioText: markdownToText(row.person.bioMarkdown).replace(/\s+/g, ' ').trim(),
        bioExcerpt: excerpt(row.person.bioMarkdown, 240),
        /**
         * Only a confirmed participant's headshot resolves, because that is the only case
         * `/embed/[slug]/headshot/[fileId]` will serve. Anyone else gets initials from the widget
         * rather than a broken image.
         */
        headshotUrl:
          row.person.workflowStatus === 'confirmed'
            ? speakerHeadshotPath(event.slug, row.person.headshotFileId)
            : null,
        links: (row.person.links ?? []).filter((link) => SAFE_LINK.test(link.url)),
        sessionIds: [],
      };
      return [speaker.id, speaker];
    }),
  );

  for (const session of previewSessions) {
    for (const speaker of session.speakers) {
      const existing = speakerIndex.get(speaker.id);
      if (existing && !existing.sessionIds.includes(session.id)) existing.sessionIds.push(session.id);
    }
  }

  const usedTrackIds = new Set(previewSessions.map((row) => row.trackId).filter(Boolean));
  const usedRoomNames = new Set(previewSessions.map((row) => row.room).filter(Boolean));

  return {
    event,
    sessions: previewSessions,
    speakers: sortSpeakers([...speakerIndex.values()]),
    tracks: tracks
      .filter((row) => usedTrackIds.has(row.id))
      .map((row) => ({ id: row.id, name: row.name })),
    rooms: rooms
      .filter((row) => usedRoomNames.has(row.name))
      .map((row) => ({ id: row.id, name: row.name })),
    sponsors: sponsorRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      tier: row.tier,
      websiteUrl: row.websiteUrl,
      description: row.description,
      boothLocation: row.boothLocation,
      /**
       * Same rule as headshots: `/[slug]/sponsors/logo/[fileId]` serves published sponsors only, so
       * a draft sponsor's logo is nulled rather than pointed at a URL that will 404.
       */
      logoUrl: row.status === 'published' ? publicSponsorLogoUrl(event.slug, row.logoFileId) : null,
    })),
  };
}
