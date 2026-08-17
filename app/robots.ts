import type { MetadataRoute } from 'next';

/**
 * Generated here rather than dropped in `public/` so the disallow list is typed, testable, and next
 * to the routes it describes — a static file drifts silently the first time a route group is
 * renamed. There is no `Sitemap:` line because there is no sitemap yet; adding one that 404s is
 * worse than omitting the directive.
 */

/**
 * Both halves of closing a route off, because neither one alone is right. Robots patterns match by
 * prefix, so `/organizer/` leaves the bare `/organizer` crawlable — and a bare `/organizer` overshoots in the
 * other direction, swallowing any event whose organizer picked a slug starting with those letters.
 * Published events live at the root as `/{slug}` and nothing reserves a slug against a route name,
 * so `/review` as a pattern would hide a real conference called `review-2026`. `$` ends the match
 * for the route itself; the trailing slash takes its subtree. A crawler old enough to read `$`
 * literally loses only the bare path, which is a sign-in redirect anyway.
 */
function closed(path: string): string[] {
  return [`${path}$`, `${path}/`];
}

/**
 * Behind a session, a magic link, or an organizer's membership. A crawler cannot read any of it
 * anyway, so the point is to keep sign-in walls out of search results and spend crawl budget on the
 * pages an attendee is actually searching for.
 */
const PRIVATE_ROUTES = [
  '/admin',
  '/organizer',
  '/auth',
  '/crm',
  '/dashboard',
  '/events',
  '/portal',
  '/review',
  '/signin',
  '/signup',
];

/** The `(dev)` group ships in every build. It is scaffolding for us, not product for anyone else. */
const DEV_ROUTES = [
  '/db-probe',
  '/kitchen-sink',
  '/logo-lab',
  '/roman-assets',
  '/roman-headshots',
];

/**
 * The call for speakers itself is meant to be found, linked, and indexed — that is the whole point
 * of publishing it at a public URL. The upload step and the confirmation page after a submission are
 * dead ends that only make sense mid-flow.
 */
const SUBMIT_FLOW_PATHS = ['/submit/*/*/upload', '/submit/*/*/done'];

/**
 * `/{slug}/llms.txt` needs no rule and gets none. It hangs off a published conference at the root,
 * so no disallow prefix reaches it, and it is meant to be fetched — it is the cheapest possible
 * read of a programme that would otherwise cost a crawler the agenda, speaker and sponsor pages.
 * No allow rule either: an allow only matters against a disallow, and adding one here would imply
 * the surrounding conference pages are closed.
 */

/**
 * `/embed/*` is deliberately absent. Those pages already carry `robots: { index: false }` in their
 * own metadata, and a crawler has to be allowed to fetch a page before it can read that. Third
 * party event sites iframe and link them, so disallowing here would trade a clean "do not index"
 * for URL-only entries Google cannot drop.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          /**
           * `/api/` is closed below: JSON responses are data for a client, not documents worth
           * indexing, and `/api/mail` is a demo-mode inbox. The generated REST and MCP contracts
           * are documentation, and `/llms.txt` points an agent straight at them. Their longer,
           * more specific allow rules win over the API-tree disallow.
           */
          '/api/v1/openapi.json',
          '/api/v1/mcp-tools.json',
        ],
        disallow: [
          ...PRIVATE_ROUTES.flatMap(closed),
          ...DEV_ROUTES.flatMap(closed),
          ...SUBMIT_FLOW_PATHS,
          ...closed('/api'),
        ],
      },
    ],
  };
}
