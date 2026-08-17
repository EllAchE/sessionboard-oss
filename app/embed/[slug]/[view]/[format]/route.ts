import { getPublicExhibitorMap } from '@/lib/services/exhibitor-map';
import { buildSubscriptionCalendar, feedCalendarFilename } from '../../../calendar';
import {
  buildExhibitorMapPayload,
  buildFeedPayload,
  feedSupportsFormat,
  parseEmbedFeedFormat,
  renderFeedJson,
  renderFeedXml,
  type EmbedFeedFormat,
} from '../../../formats';
import {
  applyFilters,
  embedSearchRecord,
  EMBED_VIEW_LABEL,
  isEmbedView,
  loadPublicBundle,
  parseEmbedOptions,
} from '../../../queries';

/**
 * `AD-3` / `EMB-15`. JSON, XML and a subscribable iCalendar rendering of the *same* embed
 * configuration as `../page.tsx` — same route shape, same query string, same `applyFilters` pass.
 * `/embed/orator-2026/sessions?track=Ethics&limit=10` and
 * `/embed/orator-2026/sessions/feed.ics?track=Ethics&limit=10` describe one widget in two
 * languages, which is the whole point: the organizer configures once.
 *
 * Nothing here consults authentication, because nothing here should be able to answer differently
 * for different callers. The visibility rule lives one layer down in `loadPublicBundle` (published
 * sessions, approved content, confirmed participants) and these formats are pure renderings of what
 * it returns.
 */

export const dynamic = 'force-dynamic';

type Params = { slug: string; view: string; format: string };

/**
 * Feeds are polled — a subscribed calendar client re-fetches on its own schedule and an aggregator
 * may poll harder. Five minutes of edge cache absorbs that against a programme that changes daily,
 * and `stale-while-revalidate` keeps a cold rebuild off the subscriber's critical path.
 */
const FEED_CACHE = 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600';

const CONTENT_TYPE: Record<EmbedFeedFormat, string> = {
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  ics: 'text/calendar; charset=utf-8',
};

function feedHeaders(format: EmbedFeedFormat, filename?: string): Record<string, string> {
  return {
    'content-type': CONTENT_TYPE[format],
    'cache-control': FEED_CACHE,
    /** These exist to be read from somebody else's site, which is the same reason `api/v1` does it. */
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    ...(filename
      ? // `inline`, not `attachment`: this is a URL a client subscribes to, not a one-shot download.
        { 'content-disposition': `inline; filename="${filename}"` }
      : {}),
  };
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(request: Request, context: { params: Promise<Params> }) {
  const { slug, view, format: segment } = await context.params;
  if (!isEmbedView(view)) return notFound();

  const format = parseEmbedFeedFormat(segment);
  if (!format || !feedSupportsFormat(view, format)) return notFound();

  const url = new URL(request.url);
  const options = parseEmbedOptions(embedSearchRecord(url.searchParams));
  const origin = url.origin;
  const canonicalUrl = `${origin}/embed/${encodeURIComponent(slug)}/${view}${url.search}`;
  const feedContext = { view, options, origin, canonicalUrl };

  if (view === 'exhibitor-map') {
    const map = await getPublicExhibitorMap(slug);
    if (!map) return notFound();
    const payload = buildExhibitorMapPayload(map, feedContext);
    return new Response(
      format === 'xml' ? renderFeedXml(payload) : renderFeedJson(payload),
      { headers: feedHeaders(format) },
    );
  }

  const bundle = await loadPublicBundle(slug);
  if (!bundle) return notFound();

  if (format === 'ics') {
    const filtered = applyFilters(bundle, options);
    const body = buildSubscriptionCalendar(filtered.sessions, filtered.event, {
      name: `${filtered.event.name} · ${EMBED_VIEW_LABEL[view]}`,
      fields: { description: options.showDescription, room: options.showRoom },
    });
    return new Response(body, {
      headers: feedHeaders('ics', feedCalendarFilename(filtered.event, view)),
    });
  }

  const payload = buildFeedPayload(bundle, feedContext);
  return new Response(format === 'xml' ? renderFeedXml(payload) : renderFeedJson(payload), {
    headers: feedHeaders(format),
  });
}
