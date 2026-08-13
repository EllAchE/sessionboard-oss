/**
 * Sign-in tokens in a message body, and how to take them out of one.
 *
 * A `/auth/verify?token=…` URL is a credential: `consumeMagicLink` opens an unattributed session as
 * whoever the token was minted for, portable across every event that account can reach. Two things
 * put one in an outgoing message — `auth.magic_link` itself, and `{{portal.link}}`, which
 * `mintPortalLink` fills for `submission.accepted`, `task.reminder` and any ad-hoc campaign an
 * organizer writes it into. That is why everything here keys on **the token in the URL** rather than
 * on `templateKey`.
 *
 * This module is the pattern and nothing else. Two callers apply it, at opposite ends:
 *
 *  - `./index.ts`, at write time, on the way into `email_log` — see `sendMail`.
 *  - `app/admin/mail/magic-links.ts`, at read time, on the way onto `/admin/mail` — see that file
 *    for the visibility rule and why a read-time check is the one that can be conditional.
 *
 * They share a regex because a second copy of it is a second thing to get wrong: a pattern that
 * misses `&amp;`-encoded query strings on one side and not the other is a credential that survives
 * the redaction nobody noticed was partial.
 */

/** What a redacted token reads as. Not a valid token, and visibly not one. */
export const REDACTED = 'redacted';

/**
 * A sign-in token in a URL, wherever it appears — an `href`, an anchor's text, the plain-text body.
 * The character classes stop at a quote, a tag boundary, whitespace or `&`, so a match never runs
 * past the end of one URL and `&amp;`-encoded query strings terminate cleanly.
 */
const MAGIC_LINK_TOKEN = /(\/auth\/verify\?[^"'<>\s]*?\btoken=)([^"'<>\s&]+)/gi;

/** The same pattern without `g`, because a global regex carries `lastIndex` between `test` calls. */
const HAS_MAGIC_LINK = new RegExp(MAGIC_LINK_TOKEN.source, 'i');

/** Whether this text carries a sign-in token at all. */
export function hasMagicLink(source: string): boolean {
  return HAS_MAGIC_LINK.test(source);
}

/** Whether this text carries a token that has already been taken out, at either end. */
export function isRedacted(source: string): boolean {
  return source.includes(`token=${REDACTED}`);
}

/** Every sign-in token in `source`, replaced. Everything else — agenda links, `.ics` downloads,
 * a bare `/portal` link — is left exactly as it was; none of those is a credential. */
export function redactMagicLinks(source: string): string {
  return source.replace(MAGIC_LINK_TOKEN, `$1${REDACTED}`);
}
