import {
  applyFilters,
  EMBED_VIEW_LABEL,
  type EmbedOptions,
  type EmbedView,
  type PublicBundle,
  type PublicSession,
  type PublicSpeaker,
  type PublicSponsor,
} from './model';

/**
 * `AD-3` / `EMB-15`. The non-HTML renderings of an embed.
 *
 * The point of this module is that it is *downstream of `applyFilters`*, the same call the HTML
 * widgets make. A JSON feed that re-derived its own filters would drift from the widget the
 * organizer previewed, which is precisely the complaint against the pre-existing
 * `app/api/v1/events/[slug]/agenda` route: it answers a similar question with different options.
 * Here one configuration — the query string — produces the script embed, the iframe, the shareable
 * URL, the JSON, the XML and the subscribable `.ics`.
 *
 * Visibility is not re-checked here and must not be. Everything this module can see arrived from
 * `loadPublicBundle`, which structurally loads only `published` sessions with `approved` content
 * and `confirmed` participants. A format that reached past the bundle for "just one more field"
 * would be the one way to leak a draft, so every serializer below is a pure function of the bundle.
 */

export const EMBED_FEED_FORMATS = ['json', 'xml', 'ics'] as const;

export type EmbedFeedFormat = (typeof EMBED_FEED_FORMATS)[number];

export const EMBED_FEED_SEGMENT: Record<EmbedFeedFormat, string> = {
  json: 'feed.json',
  xml: 'feed.xml',
  ics: 'feed.ics',
};

export const EMBED_FEED_LABEL: Record<EmbedFeedFormat, string> = {
  json: 'JSON',
  xml: 'XML',
  ics: 'iCalendar subscription',
};

/** The route segment carries the extension so a calendar client sees a `.ics` URL. */
export function parseEmbedFeedFormat(segment: string): EmbedFeedFormat | null {
  const match = EMBED_FEED_FORMATS.find((format) => EMBED_FEED_SEGMENT[format] === segment);
  return match ?? null;
}

/** Which of the three renderings a widget can answer in. */
export function feedSupportsFormat(view: EmbedView, format: EmbedFeedFormat): boolean {
  if (view === 'exhibitor-map') return format !== 'ics';
  if (format === 'ics') return view !== 'sponsors';
  return true;
}

type FeedShape = 'sessions' | 'speakers' | 'sponsors' | 'exhibitor-map';

export function feedShapeOf(view: EmbedView): FeedShape {
  if (view === 'speakers' || view === 'gallery') return 'speakers';
  if (view === 'sponsors') return 'sponsors';
  if (view === 'exhibitor-map') return 'exhibitor-map';
  return 'sessions';
}

export type FeedPayload = Record<string, unknown>;

function absolute(path: string | null | undefined, origin: string): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Field selection is expressed by *omitting* keys rather than by nulling them. A consumer that sees
 * no `description` key knows the publisher chose not to publish descriptions; a `null` would claim
 * the session has none.
 */
function prune(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function sessionPayload(
  session: PublicSession,
  options: EmbedOptions,
  origin: string,
): FeedPayload {
  return prune({
    id: session.id,
    ref: session.ref,
    title: session.title,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    /** `AD-3`'s status filter is a property of the session, so it travels with it. */
    status: session.startsAt ? 'scheduled' : 'tba',
    room: options.showRoom ? session.room : undefined,
    track: options.showTrack ? session.track : undefined,
    format: session.format,
    ceuCredits: session.ceuCredits,
    description: options.showDescription ? session.descriptionText : undefined,
    descriptionHtml: options.showDescription ? session.descriptionHtml : undefined,
    recordingUrl: absolute(session.recordingUrl, origin),
    tags: session.tags.map((tag) => tag.name),
    /** The same calendar identity the `.ics` rendering and the speaker invite use. */
    calendar: { uid: session.icsUid, sequence: session.icsSequence },
    speakers: session.speakers.map((person) =>
      prune({
        id: person.id,
        slug: person.slug,
        name: person.name,
        jobTitle: person.jobTitle,
        company: person.company,
      }),
    ),
  });
}

function speakerPayload(
  speaker: PublicSpeaker,
  options: EmbedOptions,
  origin: string,
): FeedPayload {
  return prune({
    id: speaker.id,
    slug: speaker.slug,
    name: speaker.name,
    pronouns: speaker.pronouns,
    jobTitle: speaker.jobTitle,
    company: speaker.company,
    bio: options.showBio ? speaker.bioText : undefined,
    bioHtml: options.showBio ? speaker.bioHtml : undefined,
    headshotUrl: options.showPhoto ? absolute(speaker.headshotUrl, origin) : undefined,
    links: speaker.links.map((link) => ({ label: link.label, url: link.url })),
    sessionIds: speaker.sessionIds,
  });
}

function sponsorPayload(
  sponsor: PublicSponsor,
  options: EmbedOptions,
  origin: string,
): FeedPayload {
  return prune({
    id: sponsor.id,
    kind: sponsor.kind,
    name: sponsor.name,
    tier: sponsor.tier,
    websiteUrl: sponsor.websiteUrl,
    description: options.showDescription ? sponsor.description : undefined,
    boothLocation: options.showRoom ? sponsor.boothLocation : undefined,
    logoUrl: options.showPhoto ? absolute(sponsor.logoUrl, origin) : undefined,
  });
}

export type FeedContext = {
  view: EmbedView;
  options: EmbedOptions;
  origin: string;
  /** The HTML rendering of this same configuration, so a consumer can link back to it. */
  canonicalUrl: string;
  generatedAt?: Date;
};

/**
 * Echoing the applied configuration back is not decoration: it is how a consumer of a cached feed
 * knows which slice of the programme it is holding.
 */
function filtersPayload(options: EmbedOptions): FeedPayload {
  return prune({
    status: options.status,
    tracks: options.tracks,
    rooms: options.rooms,
    formats: options.formats,
    speaker: options.speaker,
    day: options.day,
    query: options.query || undefined,
    limit: options.limit,
    fields: {
      description: options.showDescription,
      bio: options.showBio,
      photo: options.showPhoto,
      room: options.showRoom,
      track: options.showTrack,
    },
  });
}

/** Everything except `exhibitor-map`, which has no bundle behind it. */
export function buildFeedPayload(bundle: PublicBundle, context: FeedContext): FeedPayload {
  const { view, options, origin } = context;
  const filtered = applyFilters(bundle, options);
  const shape = feedShapeOf(view);

  return prune({
    generator: 'cicero',
    view,
    viewLabel: EMBED_VIEW_LABEL[view],
    generatedAt: (context.generatedAt ?? new Date()).toISOString(),
    canonicalUrl: context.canonicalUrl,
    event: prune({
      id: filtered.event.id,
      slug: filtered.event.slug,
      name: filtered.event.name,
      tagline: filtered.event.tagline,
      timezone: filtered.event.timezone,
      startsOn: filtered.event.startsOn,
      endsOn: filtered.event.endsOn,
      venueName: filtered.event.venueName,
      websiteUrl: filtered.event.websiteUrl,
    }),
    filters: filtersPayload(options),
    sessions:
      shape === 'sessions'
        ? filtered.sessions.map((session) => sessionPayload(session, options, origin))
        : undefined,
    speakers:
      shape === 'speakers'
        ? filtered.speakers.map((speaker) => speakerPayload(speaker, options, origin))
        : undefined,
    sponsors:
      shape === 'sponsors'
        ? (filtered.sponsors ?? []).map((sponsor) => sponsorPayload(sponsor, options, origin))
        : undefined,
  });
}

export function buildExhibitorMapPayload(
  map: { eventSlug: string; eventName: string; file: { filename: string } | null; fileUrl: string | null },
  context: FeedContext,
): FeedPayload {
  return prune({
    generator: 'cicero',
    view: context.view,
    viewLabel: EMBED_VIEW_LABEL[context.view],
    generatedAt: (context.generatedAt ?? new Date()).toISOString(),
    canonicalUrl: context.canonicalUrl,
    event: { slug: map.eventSlug, name: map.eventName },
    filters: filtersPayload(context.options),
    map: map.file && map.fileUrl
      ? { filename: map.file.filename, url: absolute(map.fileUrl, context.origin) }
      : null,
  });
}

export function renderFeedJson(payload: FeedPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/**
 * The plural key names an array; XML has no arrays, so each entry needs an element name of its own.
 * Anything unlisted falls back to `item`, which keeps an unmapped key readable rather than invalid.
 */
const XML_ITEM_NAME: Record<string, string> = {
  sessions: 'session',
  speakers: 'speaker',
  sponsors: 'sponsor',
  tracks: 'track',
  rooms: 'room',
  formats: 'format',
  tags: 'tag',
  links: 'link',
  sessionIds: 'sessionId',
};

function escapeXml(value: string): string {
  return value
    // XML 1.0 cannot carry control characters other than tab, newline and return.
    .replace(/\p{Cc}/gu, (character) => ('\t\n\r'.includes(character) ? character : ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlNode(name: string, value: unknown, indent: string): string {
  if (value === null || value === undefined) return `${indent}<${name}/>`;

  if (Array.isArray(value)) {
    const child = XML_ITEM_NAME[name] ?? 'item';
    if (value.length === 0) return `${indent}<${name}/>`;
    const items = value.map((entry) => xmlNode(child, entry, `${indent}  `)).join('\n');
    return `${indent}<${name}>\n${items}\n${indent}</${name}>`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => entry !== undefined,
    );
    if (entries.length === 0) return `${indent}<${name}/>`;
    const children = entries
      .map(([key, entry]) => xmlNode(key, entry, `${indent}  `))
      .join('\n');
    return `${indent}<${name}>\n${children}\n${indent}</${name}>`;
  }

  return `${indent}<${name}>${escapeXml(String(value))}</${name}>`;
}

export function renderFeedXml(payload: FeedPayload): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlNode('embed', payload, '')}\n`;
}
