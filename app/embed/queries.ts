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
  track as trackTable,
  user as userTable,
} from '@/db/schema';
import { excerpt, renderMarkdown } from '@/lib/markdown';

/**
 * The read model behind the embeds and the public event pages. Everything here is unauthenticated,
 * so the filters are structural rather than checked: only `published` scheduled sessions are ever
 * loaded, and a speaker only appears because a published session names them. There is no code path
 * from this module to a draft, a decision note or an email address.
 *
 * All participant-authored text goes through `renderMarkdown`, never `renderTrustedMarkdown` — a
 * speaker bio is untrusted input that a stranger's website will iframe.
 */

export type PublicEvent = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  timezone: string;
  startsOn: string | null;
  endsOn: string | null;
  websiteUrl: string | null;
  venueName: string | null;
};

export type PublicSpeaker = {
  id: string;
  slug: string;
  name: string;
  pronouns: string | null;
  jobTitle: string | null;
  company: string | null;
  bioHtml: string;
  bioExcerpt: string;
  headshotUrl: string | null;
  links: { label: string; url: string }[];
  sessionIds: string[];
};

export type PublicSession = {
  id: string;
  ref: number;
  title: string;
  descriptionHtml: string;
  descriptionExcerpt: string;
  startsAt: string | null;
  endsAt: string | null;
  room: string | null;
  track: string | null;
  trackId: string | null;
  format: string | null;
  ceuCredits: string | null;
  speakers: { id: string; name: string; jobTitle: string | null; company: string | null }[];
};

export type PublicBundle = {
  event: PublicEvent;
  sessions: PublicSession[];
  speakers: PublicSpeaker[];
  tracks: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
};

const SAFE_LINK = /^https?:\/\//i;

/** Stable, human-readable deep-link handle for `G-8`. Falls back to the id when a name is absent. */
export function speakerSlug(id: string, name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base ? `${base}-${id.slice(0, 8)}` : id;
}

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

  const [sessionRows, tracks, rooms, formats] = await Promise.all([
    db
      .select()
      .from(scheduledSession)
      .where(
        and(eq(scheduledSession.eventId, event.id), eq(scheduledSession.status, 'published')),
      )
      .orderBy(asc(scheduledSession.startsAt), asc(scheduledSession.ref)),
    db.query.track.findMany({ where: eq(trackTable.eventId, event.id) }),
    db.query.room.findMany({ where: eq(roomTable.eventId, event.id) }),
    db.query.sessionFormat.findMany({ where: eq(sessionFormat.eventId, event.id) }),
  ]);

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
  const roleRows =
    submissionIds.length === 0
      ? []
      : await db
          .select({ role: participantRole, person: participant, account: userTable })
          .from(participantRole)
          .innerJoin(participant, eq(participantRole.participantId, participant.id))
          .innerJoin(userTable, eq(participant.userId, userTable.id))
          .innerJoin(submission, eq(participantRole.submissionId, submission.id))
          .where(
            and(
              inArray(participantRole.submissionId, submissionIds),
              eq(submission.eventId, event.id),
            ),
          )
          .orderBy(asc(participantRole.position));

  const bySubmission = new Map<string, typeof roleRows>();
  for (const row of roleRows) {
    const key = row.role.submissionId;
    bySubmission.set(key, [...(bySubmission.get(key) ?? []), row]);
  }

  const sessions: PublicSession[] = sessionRows.map((row) => {
    const linked = row.submissionId ? (bySubmission.get(row.submissionId) ?? []) : [];
    return {
      id: row.id,
      ref: row.ref,
      title: row.title,
      descriptionHtml: renderMarkdown(row.descriptionMarkdown),
      descriptionExcerpt: excerpt(row.descriptionMarkdown, 220),
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      room: row.roomId ? (roomName.get(row.roomId) ?? null) : null,
      track: row.trackId ? (trackName.get(row.trackId) ?? null) : null,
      trackId: row.trackId,
      format: row.formatId ? (formatName.get(row.formatId) ?? null) : null,
      ceuCredits: row.ceuCredits,
      speakers: linked.map((entry) => ({
        id: entry.person.id,
        name: entry.person.displayName?.trim() || entry.account.name?.trim() || 'Speaker',
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
    speakers: [...speakerIndex.values()].sort((a, b) => a.name.localeCompare(b.name)),
    tracks: tracks
      .filter((row) => usedTrackIds.has(row.id))
      .map((row) => ({ id: row.id, name: row.name })),
    rooms: rooms
      .filter((row) => usedRoomNames.has(row.name))
      .map((row) => ({ id: row.id, name: row.name })),
  };
}

export type AgendaDay = { date: string; label: string; sessions: PublicSession[] };

export function groupByDay(sessions: PublicSession[], timezone: string): AgendaDay[] {
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  const labelFormat = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const days = new Map<string, AgendaDay>();
  const undated: PublicSession[] = [];

  for (const session of sessions) {
    if (!session.startsAt) {
      undated.push(session);
      continue;
    }
    const when = new Date(session.startsAt);
    const key = dayFormat.format(when);
    const bucket = days.get(key) ?? { date: key, label: labelFormat.format(when), sessions: [] };
    bucket.sessions.push(session);
    days.set(key, bucket);
  }

  const ordered = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (undated.length > 0) {
    ordered.push({ date: 'tbd', label: 'Time to be announced', sessions: undated });
  }
  return ordered;
}

export function formatTimeRange(
  session: PublicSession,
  timezone: string,
): string {
  if (!session.startsAt) return 'Time TBA';
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const start = time.format(new Date(session.startsAt));
  if (!session.endsAt) return start;
  return `${start} – ${time.format(new Date(session.endsAt))}`;
}

export type EmbedOptions = {
  tracks: string[];
  rooms: string[];
  showBio: boolean;
  showPhoto: boolean;
  showRoom: boolean;
  showTrack: boolean;
  showDescription: boolean;
  columns: number;
  accent: string | null;
  theme: 'auto' | 'light' | 'dark';
  limit: number | null;
  speaker: string | null;
};

const HEX = /^[0-9a-f]{6}$/i;

/** `G-7`. Every option is a query parameter so a snippet is one copyable line with no state. */
export function parseEmbedOptions(params: Record<string, string | string[] | undefined>): EmbedOptions {
  const single = (key: string): string | null => {
    const value = params[key];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  };
  const list = (key: string): string[] => {
    const value = single(key);
    return value
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const value = single(key);
    if (value === null) return fallback;
    return value !== '0' && value !== 'false' && value !== 'no';
  };

  const accentRaw = (single('accent') ?? '').replace(/^#/, '');
  const themeRaw = single('theme');
  const limitRaw = Number.parseInt(single('limit') ?? '', 10);
  const columnsRaw = Number.parseInt(single('columns') ?? '', 10);

  return {
    tracks: list('track'),
    rooms: list('room'),
    showBio: flag('bio', true),
    showPhoto: flag('photo', true),
    showRoom: flag('room_label', true),
    showTrack: flag('track_label', true),
    showDescription: flag('description', true),
    columns: Number.isFinite(columnsRaw) ? Math.min(Math.max(columnsRaw, 1), 4) : 3,
    accent: HEX.test(accentRaw) ? `#${accentRaw}` : null,
    theme: themeRaw === 'dark' || themeRaw === 'light' ? themeRaw : 'auto',
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null,
    /** Sessionboard's own parameter name, kept so an existing embed URL ports across (`G-8`). */
    speaker: single('sb-speaker-id') ?? single('speaker'),
  };
}

export function applyFilters(bundle: PublicBundle, options: EmbedOptions): PublicBundle {
  const trackFilter = new Set(options.tracks.map((entry) => entry.toLowerCase()));
  const roomFilter = new Set(options.rooms.map((entry) => entry.toLowerCase()));

  let sessions = bundle.sessions.filter((session) => {
    if (trackFilter.size > 0) {
      const name = session.track?.toLowerCase() ?? '';
      if (!trackFilter.has(name) && !trackFilter.has(session.trackId ?? '')) return false;
    }
    if (roomFilter.size > 0 && !roomFilter.has(session.room?.toLowerCase() ?? '')) return false;
    return true;
  });

  if (options.limit) sessions = sessions.slice(0, options.limit);

  const keep = new Set(sessions.flatMap((session) => session.speakers.map((entry) => entry.id)));
  let speakers = bundle.speakers.filter((speaker) => keep.has(speaker.id));

  if (options.speaker) {
    const needle = options.speaker.toLowerCase();
    const matched = speakers.filter(
      (speaker) => speaker.id === options.speaker || speaker.slug.toLowerCase() === needle,
    );
    if (matched.length > 0) speakers = matched;
  }

  return { ...bundle, sessions, speakers };
}
