type SiteKind = 'submission' | 'field-survey';

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface ReadableSiteEnv {
  ASSETS: AssetsBinding;
  SITE_KIND: SiteKind;
}

const COMMON_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

const CONTENT_SECURITY_POLICIES: Record<SiteKind, string> = {
  submission:
    "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'field-survey':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function withSecurityHeaders(response: Response, siteKind: SiteKind): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(COMMON_HEADERS)) secured.headers.set(name, value);
  secured.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICIES[siteKind]);
  return secured;
}

function redirect(location: string, siteKind: SiteKind): Response {
  return withSecurityHeaders(
    new Response(null, { status: 302, headers: { Location: location } }),
    siteKind,
  );
}

export async function handleReadableSiteRequest(
  request: Request,
  env: ReadableSiteEnv,
): Promise<Response> {
  const url = new URL(request.url);

  if (env.SITE_KIND === 'submission') {
    if (url.pathname === '/' || url.pathname === '/submission' || url.pathname === '/submission/') {
      url.pathname = '/submission/index.html';
      return redirect(url.toString(), env.SITE_KIND);
    }

    if (url.pathname === '/README.md') {
      return redirect('https://github.com/EllAchE/sessionboard-oss#readme', env.SITE_KIND);
    }

    if (url.pathname.endsWith('.md') || url.pathname.endsWith('.json')) {
      return redirect(
        `https://github.com/EllAchE/sessionboard-oss/blob/main/docs${url.pathname}`,
        env.SITE_KIND,
      );
    }
  } else if (env.SITE_KIND === 'field-survey' && url.pathname === '/') {
    url.pathname = '/index.html';
    request = new Request(url, request);
  }

  return withSecurityHeaders(await env.ASSETS.fetch(request), env.SITE_KIND);
}

const readableSiteWorker = {
  fetch: handleReadableSiteRequest,
};

export default readableSiteWorker;
