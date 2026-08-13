/** Only relative paths, so `?next=https://evil.example` cannot turn auth into an open redirect. */
export function authRedirect(next: string | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
