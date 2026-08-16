/** Only root-relative paths, so auth cannot be turned into an open redirect. */
export function authRedirect(next: string | undefined, fallback: string): string {
  if (!next?.startsWith('/') || next.startsWith('//')) return fallback;

  // WHATWG URL parsing treats backslashes as slashes for special schemes, so `/\\evil.example`
  // becomes a network-path reference even though it passes the two leading-slash check above.
  if (next.includes('\\')) return fallback;

  return next;
}
