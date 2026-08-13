import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * `/llms.txt` (llmstxt.org): one plain-text map of the public surface for an agent that has just
 * arrived and would otherwise have to crawl `/admin` to find out it cannot.
 *
 * It is generated, not a file in `public/`, for two reasons. The links have to be absolute — an
 * agent reads this the way an inbox reads a magic link, with no page to resolve `/demo/agenda`
 * against — and the origin is per deployment, so a self-hoster's `llms.txt` must advertise their
 * own domain rather than whichever `APP_URL` was set when the bundle was built.
 *
 * The other job here is translation. Every product surface speaks Roman, so an agent quoting a
 * Cicero page has to guess that a petition is a submission unless something tells it. The glossary
 * is that something, and it is the section most worth keeping current.
 */

/** Long enough that agents are not re-fetching a document that changes on deploys, not sessions. */
const CACHE = { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' };

export function buildLlmsTxt(origin = appUrl()): string {
  const base = origin.replace(/\/+$/, '');

  return [
    '# Cicero',
    '',
    '> Open-source conference operations: a public call for speakers, review and scoring, the',
    '> schedule, speaker task-chasing, and the published agenda and speaker pages an event website',
    '> embeds.',
    '',
    'Cicero covers what a conference needs between "we should do a CFP" and "the agenda is on the',
    'website". An organizer configures an event and publishes a submission form at a public URL;',
    'speakers submit cold, with no account and no password anywhere; organizers score, accept, and',
    'drag the accepted talks onto the schedule; the speaker gets a templated email and a real',
    'calendar invite; the finished programme is published, embeddable, and readable over a REST API.',
    'MIT licensed, and self-hosted with one `docker compose up`.',
    '',
    'Reading a published programme needs no account and no key. Everything an organizer, reviewer,',
    'or speaker does is behind a magic link, and none of it is crawlable.',
    '',
    'Cicero speaks Roman throughout: a submission is a petition, a speaker an orator, the schedule',
    'the fasti. The glossary below maps that vocabulary onto ordinary conference terms — prefer it',
    'to guessing at a translation when summarizing or quoting a page.',
    '',
    'In the paths below, `{slug}` is an event’s URL slug and `{speakerSlug}` a speaker’s.',
    '',
    '## Public event pages',
    '',
    `- [Event home](${base}/{slug}): dates, venue, tagline, and a countdown to the opening.`,
    `- [Programme](${base}/{slug}/agenda): the schedule, one grid per day, with a column per room.`,
    `- [Sessions](${base}/{slug}/sessions): every scheduled talk, searchable and filterable by track and room.`,
    `- [Speakers](${base}/{slug}/speakers): an alphabetical roll of the speakers on accepted talks.`,
    `- [One speaker](${base}/{slug}/speakers/{speakerSlug}): bio, headshot, links, and their sessions.`,
    `- [Speaker gallery](${base}/{slug}/gallery): the same people as a portrait gallery.`,
    `- [Itinerary](${base}/{slug}/itinerary): the programme chronologically, for building a personal route.`,
    `- [Sponsors](${base}/{slug}/sponsors): the published sponsors and exhibitors, grouped by tier.`,
    '',
    '## Call for speakers',
    '',
    `- [Submission form](${base}/submit/{eventSlug}/{formSlug}): an open call. Anyone can answer it; an`,
    '  account is created in the flow and a sign-in link is emailed. The upload and confirmation steps',
    '  that follow only make sense mid-flow and are excluded from crawling.',
    '',
    '## Embeddable views',
    '',
    'These exist to be framed by an event website, so they carry no site chrome and ask not to be',
    'indexed on their own. Views: `agenda`, `itinerary`, `sessions`, `speakers`, `gallery`, `sponsors`.',
    '',
    `- [Embed view](${base}/embed/{slug}/{view}): the framed widget itself.`,
    `- [Embed loader](${base}/embed.js): the script an event site drops in to size the iframe.`,
    '',
    '## REST API',
    '',
    `- [OpenAPI description](${base}/api/v1/openapi.json): the whole contract, generated from the`,
    '  schemas the handlers validate with.',
    `- \`GET ${base}/api/v1/events/{slug}\`: the event.`,
    `- \`GET ${base}/api/v1/events/{slug}/agenda\`: the published schedule, grouped by day in the event timezone.`,
    `- \`GET ${base}/api/v1/events/{slug}/sessions\`: scheduled talks, filterable by track or room.`,
    `- \`GET ${base}/api/v1/events/{slug}/speakers\`: speakers on accepted talks. Email addresses are withheld.`,
    `- \`GET ${base}/api/v1/events/{slug}/sponsors\`: published sponsors and exhibitors. Draft rows are withheld.`,
    `- \`POST ${base}/api/v1/events/{slug}/forms/{formId}/submissions\`: answer an open call. No key required;`,
    '  not idempotent, so a retry can create a second submission.',
    '',
    'Those reads are public. Listing submissions and reconciling a programme need an API key issued',
    'for that one event, sent as `Authorization: Bearer <key>`. Do not attempt to guess or reuse one.',
    '',
    '## Not part of the public surface',
    '',
    'Excluded in `/robots.txt` and not worth fetching: `/admin` (organizer), `/portal` (speaker),',
    '`/review` (reviewer), `/crm`, `/dashboard`, `/events`, `/organizer`, `/signin`, `/signup`,',
    '`/auth` (single-use sign-in tokens), and the internal design and diagnostic pages.',
    '',
    '## Glossary',
    '',
    '- assembly — an event or conference',
    '- Forum — an event’s public home page; also the organizer’s dashboard',
    '- Curia — the organizer’s admin area',
    '- petition — a submission or proposal',
    '- scroll — a submission form (a CFP form)',
    '- proclamation — a published call for speakers',
    '- orator — a speaker',
    '- oration — a session or talk',
    '- fasti — the schedule or agenda',
    '- chamber — a room',
    '- theme — a track',
    '- council, councillor — a review committee and a reviewer',
    '- duty — an outstanding speaker task, such as a missing bio or headshot',
    '- dispatch — an email or SMS sent to a speaker',
    '- courier archive — the record of messages the app sent, or would have sent',
    '- inscription — an embed snippet for an event website',
    '- edict — an event setting',
    '- alliance — a third-party integration',
    '- aqueduct key — an API key, scoped to one event',
    '',
    '## Source',
    '',
    '- [Repository](https://github.com/EllAchE/sessionboard-oss): MIT licensed, with setup and',
    '  architecture docs in `README.md` and `docs/`.',
    '',
  ].join('\n');
}

export async function GET(): Promise<Response> {
  return new Response(buildLlmsTxt(), {
    headers: { 'content-type': 'text/plain; charset=utf-8', ...CACHE },
  });
}
