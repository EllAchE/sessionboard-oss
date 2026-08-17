import { PUBLIC_CACHE } from '@/app/api/v1/_lib/respond';
import {
  formatTimeRange,
  groupByDay,
  speakerLine,
  type PublicBundle,
  type PublicSession,
} from '@/app/embed/model';
import { loadPublicBundle } from '@/app/embed/queries';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * `/{slug}/llms.txt` — the site-wide `/llms.txt` narrowed to one conference. That file is a map of
 * Cicero's route shapes; this one is the current published state of a single event, so an agent
 * asked about a conference reads one document instead of crawling the agenda, the speaker directory
 * and the sponsor wall and stitching three HTML pages together.
 *
 * It is a summary, not a replacement for the REST API. Every section ends up pointing at the page
 * and the JSON endpoint that own the complete list, because the moment this file tries to be the
 * whole database it becomes both too large to read and a second schema to keep in sync.
 *
 * The read model is `loadPublicBundle`, the same query the embeds and the public event pages use.
 * That is deliberate: publication is enforced structurally in that module (published sessions with
 * approved submissions, confirmed participants, published sponsors), so this route cannot leak a
 * draft by forgetting a predicate. Nothing here reaches the database on its own.
 */

/**
 * Thirty seconds, not the hour the site-wide `/llms.txt` uses. That file only changes when Cicero
 * is deployed; this one changes the moment an organizer publishes a session, confirms a speaker or
 * swaps a room, and an agent holding an hour-old copy would confidently describe a programme that
 * no longer exists. `PUBLIC_CACHE` is the same policy as the `/api/v1` reads that serve this exact
 * data, which also keeps the two from ever disagreeing by more than one window.
 */
const CACHE = PUBLIC_CACHE;

/**
 * Two independent size bounds, because they answer different questions.
 *
 * The item caps are the editorial answer: how much of a programme is a useful sample? Enough that a
 * typical conference (a few dozen sessions) is reproduced in full, and a very large one still shows
 * its opening days rather than a bare pointer. Sessions are listed in schedule order, so a truncated
 * list is the front of the conference, which is the part an agent is usually asked about.
 *
 * `MAX_BYTES` is the safety answer, and it is the one that actually holds. Titles, speaker names and
 * sponsor tiers are organizer-authored free text with no length limit in the database, so item
 * counts alone bound nothing — a hundred sessions with essay-length titles is still a megabyte. The
 * budget is applied to the finished document and cuts on a line boundary, and whatever it drops is
 * replaced by a line naming the page and the API that hold the rest.
 */
const MAX_SESSIONS = 100;
const MAX_SPEAKERS = 100;
const MAX_SPONSORS = 50;
const MAX_SESSION_SPEAKERS = 6;
const MAX_FIELD = 120;
const MAX_BYTES = 48 * 1024;

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/**
 * Every interpolated value is untrusted organizer or speaker input, and this format is line
 * oriented: a title containing a newline would otherwise forge a list item, and one containing a
 * heading marker would forge a section. Collapsing whitespace and clipping to a fixed width makes
 * the document's structure a property of this file rather than of whatever someone typed.
 */
function field(value: string | null | undefined, limit = MAX_FIELD): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

function sessionLine(session: PublicSession, timezone: string): string {
  const shown = session.speakers.slice(0, MAX_SESSION_SPEAKERS).map((person) => field(person.name));
  const hidden = session.speakers.length - shown.length;
  if (hidden > 0) shown.push(`+${hidden} more`);

  return [
    `- ${formatTimeRange(session, timezone)} · ${field(session.title)}`,
    shown.length > 0 ? ` — ${shown.join(', ')}` : '',
    [session.track, session.room, session.format]
      .filter(Boolean)
      .map((value) => field(value, 60))
      .reduce((suffix, value) => `${suffix} · ${value}`, ''),
  ].join('');
}

/**
 * `origin` is a parameter for the same reason it is on the site-wide builder: an agent reads this
 * with no page to resolve a relative URL against, and the origin belongs to whoever deployed Cicero.
 */
export function buildEventLlmsTxt(bundle: PublicBundle, origin = appUrl()): string {
  const base = origin.replace(/\/+$/, '');
  const { event, sessions, speakers, tracks, rooms } = bundle;
  const sponsors = bundle.sponsors ?? [];
  const home = `${base}/${encodeURIComponent(event.slug)}`;
  const api = `${base}/api/v1/events/${encodeURIComponent(event.slug)}`;

  const dates = [event.startsOn, event.endsOn].filter(Boolean).join(' – ');
  const summary = [
    field(event.tagline, 200) || `The published programme for ${field(event.name)}`,
    dates && `${dates}`,
    field(event.venueName, 80),
  ]
    .filter(Boolean)
    .join(' · ');

  const lines: string[] = [
    `# ${field(event.name, 200)}`,
    '',
    `> ${summary}`,
    '',
    'This is the current published state of one conference on Cicero, regenerated per request.',
    'Only content its organizers have published appears: draft and unscheduled sessions,',
    'unconfirmed speakers, unpublished sponsors, review notes and every contact detail are absent',
    'by construction. Treat it as a snapshot, and the linked pages and API as authoritative.',
    '',
    '## Event',
    '',
    `- Name: ${field(event.name, 200)}`,
    `- Slug: \`${field(event.slug, 80)}\``,
    `- Dates: ${dates || 'to be announced'}`,
    `- Time zone: ${field(event.timezone, 60) || 'unspecified'} — every time below is local to it.`,
  ];

  if (event.venueName) lines.push(`- Venue: ${field(event.venueName, 200)}`);
  /** Free text on the event row, so it is quoted rather than mapped to a vocabulary we do not own. */
  if (event.eventType) lines.push(`- Event type: ${field(event.eventType, 60)}`);
  if (event.websiteUrl) lines.push(`- Organizer website: ${field(event.websiteUrl, 300)}`);
  lines.push(
    `- Published sessions: ${sessions.length}`,
    `- Confirmed speakers: ${speakers.length}`,
    `- Tracks: ${tracks.length} · Rooms: ${rooms.length} · Sponsors and exhibitors: ${sponsors.length}`,
    '',
    '## Pages',
    '',
    `- [Conference home](${home}): overview, dates and venue.`,
  );

  /**
   * A view is linked only when it has something in it. An agent that follows every link on a
   * conference with no sponsors spends a fetch to learn the page is empty, and the counts above
   * already say what exists.
   */
  if (sessions.length > 0) {
    lines.push(
      `- [Agenda](${home}/agenda): the per-day grid with room columns.`,
      `- [Itinerary](${home}/itinerary): the same programme in chronological order.`,
      `- [Sessions](${home}/sessions): every published session, searchable and filterable.`,
    );
  }
  if (speakers.length > 0) {
    lines.push(
      `- [Speakers](${home}/speakers): the confirmed speaker directory, with a page per speaker.`,
      `- [Gallery](${home}/gallery): the same speakers as a photo grid.`,
    );
  }
  if (sponsors.length > 0) {
    lines.push(`- [Sponsors](${home}/sponsors): published sponsors and exhibitors.`);
  }

  if (sessions.length > 0) {
    const days = groupByDay(sessions, event.timezone);
    lines.push(
      '',
      '## Programme',
      '',
      `${sessions.length} published ${sessions.length === 1 ? 'session' : 'sessions'}` +
        `${tracks.length > 0 ? ` across ${tracks.length} tracks` : ''}` +
        `${rooms.length > 0 ? ` and ${rooms.length} rooms` : ''}.`,
      'Each line is time, title, speakers, then track, room and format where they are set. Session',
      'abstracts are not repeated here; the sessions page and the sessions API carry them in full.',
    );

    let remaining = MAX_SESSIONS;
    for (const day of days) {
      if (remaining <= 0) break;
      const shown = day.sessions.slice(0, remaining);
      remaining -= shown.length;
      lines.push('', `### ${field(day.label, 80)}${day.date === 'tbd' ? '' : ` (${day.date})`}`, '');
      for (const session of shown) lines.push(sessionLine(session, event.timezone));
    }

    if (sessions.length > MAX_SESSIONS) {
      lines.push(
        '',
        `The ${sessions.length - MAX_SESSIONS} later sessions are omitted here. The complete`,
        `programme is at ${home}/agenda and ${api}/sessions.`,
      );
    }
  }

  if (speakers.length > 0) {
    lines.push('', '## Speakers', '');
    for (const speaker of speakers.slice(0, MAX_SPEAKERS)) {
      const role = field(speakerLine(speaker), 140);
      lines.push(
        `- [${field(speaker.name)}](${home}/speakers/${encodeURIComponent(speaker.slug)})` +
          `${role ? ` — ${role}` : ''}`,
      );
    }
    if (speakers.length > MAX_SPEAKERS) {
      lines.push(
        '',
        `The ${speakers.length - MAX_SPEAKERS} remaining speakers are omitted here. The full`,
        `directory is at ${home}/speakers and ${api}/speakers. Biographies live on each speaker's`,
        'page rather than in this file.',
      );
    }
  }

  if (sponsors.length > 0) {
    lines.push('', '## Sponsors and exhibitors', '');
    for (const sponsor of sponsors.slice(0, MAX_SPONSORS)) {
      lines.push(
        `- ${field(sponsor.name)} — ${sponsor.kind}` +
          `${sponsor.tier ? `, ${field(sponsor.tier, 60)}` : ''}` +
          `${sponsor.boothLocation ? `, booth ${field(sponsor.boothLocation, 60)}` : ''}` +
          `${sponsor.websiteUrl ? ` · ${field(sponsor.websiteUrl, 300)}` : ''}`,
      );
    }
    if (sponsors.length > MAX_SPONSORS) {
      lines.push('', `The remaining sponsors are listed at ${home}/sponsors and ${api}/sponsors.`);
    }
  }

  lines.push(
    '',
    '## API',
    '',
    `- [Event record](${api}): name, dates, time zone and venue as JSON.`,
    `- [Sessions](${api}/sessions) and [agenda](${api}/agenda): the published programme, paginated`,
    '  and filterable.',
    `- [Speakers](${api}/speakers): confirmed speakers.`,
    `- [Sponsors](${api}/sponsors): published sponsors and exhibitors.`,
    `- \`${api}/mcp\` — the MCP endpoint scoped to this conference.`,
    `- [OpenAPI contract](${base}/api/v1/openapi.json): the authoritative operations, parameters,`,
    '  schemas, authentication and rate limits for all of the above.',
    '',
    'These reads need no credential. Organizer operations use an event-scoped API key and are',
    'documented in the same contract.',
    '',
    '## Elsewhere',
    '',
    `- [Cicero llms.txt](${base}/llms.txt): the platform-wide map this file is one conference of.`,
    `- [Crawler directives](${base}/robots.txt): the authoritative crawl policy.`,
    '',
  );

  return clampToBudget(lines.join('\n'), home, api);
}

function clampToBudget(body: string, home: string, api: string): string {
  if (byteLength(body) <= MAX_BYTES) return body;

  const notice = [
    '',
    `This summary was truncated at ${MAX_BYTES / 1024} KB. The complete programme, speaker`,
    `directory and sponsor list are at ${home} and under ${api}.`,
    '',
  ].join('\n');

  const budget = MAX_BYTES - byteLength(notice);
  const kept: string[] = [];
  let used = 0;
  for (const line of body.split('\n')) {
    const size = byteLength(line) + 1;
    if (used + size > budget) break;
    kept.push(line);
    used += size;
  }
  return kept.join('\n') + notice;
}

/**
 * A slug that resolves to nothing gets the same opaque 404 as `/{slug}/recordings/{id}`: a caller
 * probing for slugs learns nothing from the response. Failures are caught rather than surfaced for
 * the same reason — a database error must not become a distinguishable answer.
 *
 * Unauthenticated and uncounted against a rate limit, matching the public event pages this sits
 * beside; it costs one `loadPublicBundle` — the same work `/{slug}/agenda` already does per view —
 * and the cache header above absorbs repeat reads.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const { slug } = await params;
    const bundle = await loadPublicBundle(slug);
    if (!bundle) return new Response('Not found', { status: 404 });

    return new Response(buildEventLlmsTxt(bundle), {
      headers: { 'content-type': 'text/plain; charset=utf-8', ...CACHE },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
