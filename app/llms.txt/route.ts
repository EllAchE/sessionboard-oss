import { EMBED_VIEWS } from '@/app/embed/model';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * `/llms.txt` (llmstxt.org) is a small map of Cicero's public surface, not a second API manual.
 * OpenAPI and the MCP manifest own operation-level authentication, schemas, and descriptions; this
 * file points to them so those contracts cannot drift apart.
 *
 * It is generated, not a file in `public/`, for two reasons. The links have to be absolute — an
 * agent reads this with no page to resolve a relative URL against — and the origin is per
 * deployment, so a self-hoster advertises their own contracts. Parameterized application routes
 * stay inline code because a URL containing `{slug}` is a template, not a resource to fetch.
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
    'Cicero is MIT-licensed and self-hosted. Published conference pages and public read APIs need',
    'no credential. Authentication, rate limits, request schemas, and response schemas live in the',
    'linked developer contracts.',
    '',
    'Route templates use `{slug}` for a conference URL slug and `{speakerSlug}` for a speaker slug.',
    '',
    '## Public conference routes',
    '',
    '- `/{slug}` — conference home.',
    '- `/{slug}/agenda` — schedule grid.',
    '- `/{slug}/itinerary` — chronological programme.',
    '- `/{slug}/sessions` — searchable sessions.',
    '- `/{slug}/speakers` and `/{slug}/speakers/{speakerSlug}` — speaker directory and profiles.',
    '- `/{slug}/gallery` — speaker gallery.',
    '- `/{slug}/sponsors` — published sponsors and exhibitors.',
    '- `/{slug}/llms.txt` — this file narrowed to one conference: its dates, venue, counts, agenda,',
    '  speakers, sponsors, and the endpoints holding the complete lists. Read it instead of crawling',
    '  the pages above.',
    '- `/submit/{eventSlug}/{formSlug}` — published call for speakers.',
    '',
    '## Embeds',
    '',
    `- \`/embed/{slug}/{view}\` — an unindexed event-site view. Supported views: ${EMBED_VIEWS.map((view) => `\`${view}\``).join(', ')}.`,
    '- `/embed/{slug}/exhibitor-map/file` — the current map’s inline or downloadable PDF bytes.',
    `- [Embed loader](${base}/embed.js): the script an event site drops in to size the iframe.`,
    '',
    '## Developer resources',
    '',
    `- [OpenAPI contract](${base}/api/v1/openapi.json): authoritative REST operations, schemas,`,
    '  authentication, and rate limits.',
    `- [MCP tool manifest](${base}/api/v1/mcp-tools.json): authoritative MCP tool names, inputs,`,
    '  outputs, and access levels.',
    '- `/api/v1/events/{slug}/mcp` — the event-scoped MCP endpoint.',
    '',
    'Published conference and CFP reads need no credential. Organizer operations use an',
    'event-scoped API key.',
    'Speaker proposal, profile, and task operations use that speaker’s signed-in session. Refer to',
    'OpenAPI for the requirement on each operation.',
    '',
    '## Crawling',
    '',
    `- [Crawler directives](${base}/robots.txt): the authoritative crawl policy.`,
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
