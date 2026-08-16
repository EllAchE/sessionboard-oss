/** Only root-relative paths, so auth cannot be turned into an open redirect. */
export function authRedirect(next: string | undefined, fallback: string): string {
  if (!next?.startsWith('/') || next.startsWith('//')) return fallback;

  // WHATWG URL parsing treats backslashes as slashes for special schemes, so `/\\evil.example`
  // becomes a network-path reference even though it passes the two leading-slash check above.
  if (next.includes('\\')) return fallback;

  return next;
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
