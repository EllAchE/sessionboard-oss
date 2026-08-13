/**
 * The embed read model, minus the database. Everything here is pure so the interactive widgets can
 * import it from a client component — a value import out of `queries.ts` would drag `pg` into the
 * browser bundle.
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
  bioText: string;
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
  descriptionText: string;
  descriptionExcerpt: string;
  startsAt: string | null;
  endsAt: string | null;
  room: string | null;
  track: string | null;
  trackId: string | null;
  format: string | null;
  ceuCredits: string | null;
  tags: { id: string; name: string }[];
  speakers: {
    id: string;
    slug: string;
    name: string;
    jobTitle: string | null;
    company: string | null;
  }[];
};

export type PublicBundle = {
  event: PublicEvent;
  sessions: PublicSession[];
  speakers: PublicSpeaker[];
  tracks: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
};

export const EMBED_VIEWS = ['agenda', 'itinerary', 'sessions', 'speakers', 'gallery'] as const;

export type EmbedView = (typeof EMBED_VIEWS)[number];

export const EMBED_VIEW_LABEL: Record<EmbedView, string> = {
  agenda: 'Agenda grid',
  itinerary: 'Schedule itinerary',
  sessions: 'Sessions list',
  speakers: 'Speakers list',
  gallery: 'Speaker gallery',
};

export const EMBED_VIEW_SUMMARY: Record<EmbedView, string> = {
  agenda: 'A per-day grid with room columns and a time gutter.',
  itinerary: 'Chronological cards inside day tabs, with a personal schedule.',
  sessions: 'Searchable, filterable session cards.',
  speakers: 'An alphabetical speaker directory that drills into a profile.',
  gallery: 'A photo grid of speakers with a detail panel.',
};

export function isEmbedView(value: string): value is EmbedView {
  return (EMBED_VIEWS as readonly string[]).includes(value);
}

/** Stable, human-readable deep-link handle for `G-8`. Falls back to the id when a name is absent. */
export function speakerSlug(id: string, name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base ? `${base}-${id.slice(0, 8)}` : id;
}

/**
 * Directory order is by family name, which for a Latin-script display name is the last word once
 * generational suffixes are dropped. Names that do not decompose that way sort on the whole string,
 * which is the same answer for a single-token name.
 */
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'phd', 'md']);

export function surnameOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (
    words.length > 1 &&
    SUFFIXES.has(words[words.length - 1].toLowerCase().replace(/,$/, ''))
  ) {
    words.pop();
  }
  return (words[words.length - 1] ?? name).toLowerCase();
}

export function bySurname(a: { name: string }, b: { name: string }): number {
  const surname = surnameOf(a.name).localeCompare(surnameOf(b.name));
  return surname !== 0 ? surname : a.name.localeCompare(b.name);
}

export function sortSpeakers<T extends { name: string }>(speakers: T[]): T[] {
  return [...speakers].sort(bySurname);
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

export type AgendaDay = { date: string; label: string; sessions: PublicSession[] };

export function dayKeyOf(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso));
}

export function groupByDay(sessions: PublicSession[], timezone: string): AgendaDay[] {
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
    const key = dayKeyOf(session.startsAt, timezone);
    const bucket = days.get(key) ?? { date: key, label: labelFormat.format(when), sessions: [] };
    bucket.sessions.push(session);
    days.set(key, bucket);
  }

  const ordered = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const day of ordered) {
    day.sessions.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  }
  if (undated.length > 0) {
    ordered.push({ date: 'tbd', label: 'Time to be announced', sessions: undated });
  }
  return ordered;
}

export function formatTimeRange(session: PublicSession, timezone: string): string {
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

export function formatDayLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

export function formatShortDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

/** Day, both ends of the clock and the event's zone — what a detail view has to state outright. */
export function formatFullDateTime(session: PublicSession, timezone: string): string {
  if (!session.startsAt) return 'Date and time to be announced';
  const day = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(session.startsAt));
  return `${day} · ${formatTimeRange(session, timezone)}`;
}

export function minuteOfDay(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function durationMinutes(session: PublicSession, fallback = 60): number {
  if (!session.startsAt || !session.endsAt) return fallback;
  const span = (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000;
  return span > 0 ? Math.round(span) : fallback;
}

export function formatClock(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function speakerLine(speaker: { jobTitle: string | null; company: string | null }): string {
  return [speaker.jobTitle, speaker.company].filter(Boolean).join(', ');
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD');
}

/** `EMB-02`: one query follows the talk's searchable programme relationships. */
export function sessionMatches(session: PublicSession, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = [
    session.title,
    session.track ?? '',
    session.format ?? '',
    session.room ?? '',
    session.descriptionText,
    ...session.tags.map((tag) => tag.name),
    ...session.speakers.flatMap((person) => [
      person.name,
      person.jobTitle ?? '',
      person.company ?? '',
    ]),
  ].join(' ');
  return normalize(haystack).includes(needle);
}

export function speakerMatches(
  speaker: PublicSpeaker,
  query: string,
  sessions: PublicSession[] = [],
): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const related = sessionsForSpeaker(sessions, speaker);
  const haystack = [
    speaker.name,
    speaker.pronouns ?? '',
    speaker.jobTitle ?? '',
    speaker.company ?? '',
    speaker.bioText,
    ...related.flatMap((session) => [
      session.title,
      session.descriptionText,
      session.track ?? '',
      session.format ?? '',
      ...session.tags.map((tag) => tag.name),
    ]),
  ].join(' ');
  return normalize(haystack).includes(needle);
}

export function sessionsForSpeaker(
  sessions: PublicSession[],
  speaker: Pick<PublicSpeaker, 'id' | 'sessionIds'>,
): PublicSession[] {
  const owned = new Set(speaker.sessionIds);
  return sessions.filter(
    (session) =>
      owned.has(session.id) || session.speakers.some((person) => person.id === speaker.id),
  );
}

export type EmbedOptions = {
  tracks: string[];
  rooms: string[];
  formats: string[];
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
  day: string | null;
  query: string;
};

const HEX = /^[0-9a-f]{6}$/i;

/** `G-7`. Every option is a query parameter so a snippet is one copyable line with no state. */
export function parseEmbedOptions(
  params: Record<string, string | string[] | undefined>,
): EmbedOptions {
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
    formats: list('format'),
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
    day: single('day'),
    query: single('q') ?? '',
  };
}

export function applyFilters(bundle: PublicBundle, options: EmbedOptions): PublicBundle {
  const trackFilter = new Set(options.tracks.map((entry) => entry.toLowerCase()));
  const roomFilter = new Set(options.rooms.map((entry) => entry.toLowerCase()));
  const formatFilter = new Set(options.formats.map((entry) => entry.toLowerCase()));

  let sessions = bundle.sessions.filter((session) => {
    if (trackFilter.size > 0) {
      const name = session.track?.toLowerCase() ?? '';
      if (!trackFilter.has(name) && !trackFilter.has(session.trackId ?? '')) return false;
    }
    if (roomFilter.size > 0 && !roomFilter.has(session.room?.toLowerCase() ?? '')) return false;
    if (formatFilter.size > 0 && !formatFilter.has(session.format?.toLowerCase() ?? ''))
      return false;
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

/** The distinct values actually present, which is what a facet list may offer. */
export function facetValues(
  sessions: PublicSession[],
  pick: (session: PublicSession) => string | string[] | null,
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const picked = pick(session);
    const values = Array.isArray(picked) ? [...new Set(picked)] : picked ? [picked] : [];
    for (const value of values) {
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

export type SessionFacets = {
  days: string[];
  topics: string[];
  tracks: string[];
  formats: string[];
  rooms: string[];
};

export const EMPTY_SESSION_FACETS: SessionFacets = {
  days: [],
  topics: [],
  tracks: [],
  formats: [],
  rooms: [],
};

export function countSessionFacets(facets: SessionFacets): number {
  return Object.values(facets).reduce((total, values) => total + values.length, 0);
}

export function sessionMatchesFacets(
  session: PublicSession,
  facets: SessionFacets,
  timezone: string,
): boolean {
  const day = session.startsAt ? dayKeyOf(session.startsAt, timezone) : 'tbd';
  if (facets.days.length > 0 && !facets.days.includes(day)) return false;
  if (facets.topics.length > 0 && !session.tags.some((tag) => facets.topics.includes(tag.name))) {
    return false;
  }
  if (facets.tracks.length > 0 && !facets.tracks.includes(session.track ?? '')) return false;
  if (facets.formats.length > 0 && !facets.formats.includes(session.format ?? '')) return false;
  if (facets.rooms.length > 0 && !facets.rooms.includes(session.room ?? '')) return false;
  return true;
}
