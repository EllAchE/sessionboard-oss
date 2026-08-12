/**
 * Web Crypto only. `node:crypto` would work self-hosted but not under workerd without the compat
 * shim, and both runtimes expose `crypto.subtle` natively.
 */

const TOKEN_BYTES = 32;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The plaintext half of a magic link or session cookie. Shown once, never stored. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/**
 * Tokens are stored hashed so a database dump does not hand over live sessions. Plain SHA-256 is
 * right here and would be wrong for a password: these are 256 bits of entropy we generated, so
 * there is no dictionary to attack and nothing for a slow KDF to buy.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `S-5`: per-event counters rendered as `ABS-12` / `SESS-4`. Power users navigate by these. */
export const REF_PREFIX = { submission: 'ABS', session: 'SESS' } as const;

export function formatRef(kind: keyof typeof REF_PREFIX, ref: number): string {
  return `${REF_PREFIX[kind]}-${ref}`;
}

export function parseRef(input: string): { kind: keyof typeof REF_PREFIX; ref: number } | undefined {
  const match = /^(ABS|SESS)-(\d+)$/i.exec(input.trim());
  if (!match) return undefined;
  const kind = match[1].toUpperCase() === 'ABS' ? 'submission' : 'session';
  return { kind, ref: Number(match[2]) };
}

/** URL-safe slug for events, tracks and portal pages. Collisions are the caller's problem. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Comparison that does not leak length or position through timing. Used wherever a caller-supplied
 * secret is checked against a stored one.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
