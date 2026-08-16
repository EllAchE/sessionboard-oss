import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * `/llms.txt` (llmstxt.org): one plain-text map of the public surface for an agent that has just
 * arrived and would otherwise have to crawl `/organizer` to find out it cannot.
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
    '> Open-source conference operations for CFPs, review, scheduling, speaker tasks, and public programmes.',
    '',
    'Cicero is MIT-licensed and self-hosted. Public programme pages and read APIs require no',
    'credentials. Organizer, reviewer, speaker, and CRM routes are private.',
    '',
    'Cicero uses Roman terms; see the glossary below.',
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
    `- [Submission form](${base}/submit/{eventSlug}/{formSlug}): public CFP. Creates speaker access after submission.`,
    '',
    '## Embeddable views',
    '',
    'Unindexed views for embedding: `agenda`, `itinerary`, `sessions`, `speakers`, `gallery`, and',
    '`sponsors`, plus `exhibitor-map` for the organizer-uploaded static PDF.',
    '',
    `- [Embed view](${base}/embed/{slug}/{view}): the framed widget itself.`,
    `- [Exhibitor map PDF](${base}/embed/{slug}/exhibitor-map/file): the current map’s inline or downloadable bytes.`,
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
    'Public reads need no key. Private submission and reconciliation endpoints require an',
    'event-scoped bearer key.',
    '',
    '## Not part of the public surface',
    '',
    'Excluded in `/robots.txt` and not worth fetching: `/organizer` (organizer), `/portal` (speaker),',
    '`/review` (reviewer), `/crm`, `/dashboard`, `/events`, `/organizer`, `/signin`, `/signup`,',
    '`/auth` (single-use sign-in tokens), and the internal design and diagnostic pages.',
    '',
    '## Glossary',
    '',
    '- assembly — an event or conference',
    '- Forum — an event’s public home page; also the organizer’s dashboard',
    '- Curia — the organizer’s workspace',
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
