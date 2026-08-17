/**
 * `G-1`–`G-3`. Which requests get Cicero's own page furniture, and which are widgets rendering into
 * a stranger's website.
 *
 * The root layout wraps every route in the global footer, and `/embed/*` exists to be framed by
 * somebody else's event site — so that footer, including its passwordless demo sign-in links, has
 * been shipping inside every embedded widget. A nested layout cannot remove what a parent layout
 * rendered, and Next tells a server component nothing about the URL it is building, so the only
 * ways to vary the root layout by route are a second root layout (moving every top-level route into
 * a group) or asking the request. This asks the request.
 *
 * The header marks the *site*, not the embed, and `middleware.ts` strips any inbound copy before
 * setting it. Both choices point the failure the same way: a request that somehow arrives without
 * the middleware having run loses its footer, which is visible and harmless, rather than gaining
 * one inside a third-party page, which is neither.
 */

/** Set by `middleware.ts` on requests that should render Cicero's own chrome. */
export const SITE_CHROME_HEADER = 'x-cicero-site-chrome';

const SITE_CHROME_VALUE = '1';

/**
 * `/embed` alone is not a route, but treating it as one keeps the answer from depending on a
 * trailing slash. `/embeds` — the public showcase — is a Cicero page and deliberately does not
 * match: the prefix test includes the separator for exactly that reason.
 */
export function isEmbedPath(pathname: string): boolean {
  return pathname === '/embed' || pathname.startsWith('/embed/');
}

/**
 * The header set a request should be forwarded with. Returns a new `Headers` rather than mutating
 * the caller's, because `NextRequest.headers` is immutable.
 */
export function withSiteChromeHeader(pathname: string, incoming: Headers): Headers {
  const headers = new Headers(incoming);
  headers.delete(SITE_CHROME_HEADER);
  if (!isEmbedPath(pathname)) {
    headers.set(SITE_CHROME_HEADER, SITE_CHROME_VALUE);
  }
  return headers;
}

/** Reads back what {@link withSiteChromeHeader} wrote. */
export function hasSiteChrome(headers: { get(name: string): string | null }): boolean {
  return headers.get(SITE_CHROME_HEADER) === SITE_CHROME_VALUE;
}
