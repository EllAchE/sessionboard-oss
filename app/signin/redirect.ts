/** Only relative paths, so `?next=https://evil.example` cannot turn auth into an open redirect. */
export function authRedirect(next: string | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Uses local request hosts only in development; production remains pinned to `APP_URL`. */
export function localAuthOrigin(
  requestHeaders: Pick<Headers, 'get'>,
  isDevelopment = process.env.NODE_ENV === 'development',
): string | undefined {
  if (!isDevelopment) return undefined;

  const host = (requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'))?.split(',')[0].trim();
  if (!host) return undefined;

  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol === 'https' ? 'https' : 'http';

  try {
    const url = new URL(`${protocol}://${host}`);
    return url.host === host && LOCAL_DEVELOPMENT_HOSTS.has(url.hostname) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
