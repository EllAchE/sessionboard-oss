import type { LinkVisibility } from '@/lib/demo-access';

/**
 * `T-6` versus `T-7a`, one surface further in than `lib/demo-access.ts` — read that module first.
 *
 * `/admin/mail` renders `email_log` rows in full: every `href` in the body is lifted out as a
 * clickable link, and the body itself is injected with `dangerouslySetInnerHTML`. That is the point
 * of the page under `MAIL_TRANSPORT=log`, where nothing leaves the server and the mailbox is the
 * only inbox a judge has (`T-7a`).
 *
 * ## The escalation this closes
 *
 * `sendMail` writes the whole body to `email_log` *before* dispatch, so the body is readable in the
 * mailbox under **every** transport, including a live Resend one. And a body can carry a live
 * credential: `/auth/verify?token=…` is a single-use sign-in token, and `consumeMagicLink` opens an
 * unattributed session as whoever the token was minted for — portable across every event that
 * account can reach, not scoped to the event the mail was sent from.
 *
 * Two paths put one there. `review.inviteReviewer` calls `ensureUserAccount`, which *binds to an
 * existing account* when one already holds the address, then mints a sign-in link and files the
 * `auth.magic_link` row against the inviting organizer's own event — where that organizer can read
 * it. And `{{portal.link}}`, which `mintPortalLink` fills for `submission.accepted`,
 * `task.reminder` and friends, is the same credential under an ordinary template with a fourteen-day
 * life. That is why the gate below keys on **the token in the URL**, not on `templateKey`: gating
 * `auth.magic_link` alone would leave every portal link in the archive readable.
 *
 * The invite has already made that account a legitimate `startImpersonation` target, so an organizer
 * can reach comparable access anyway — but attributably, through a session that carries
 * `impersonated_by`. The mailbox copy is the unattributed, transferable version. That difference is
 * the whole reason this is a fix and not a nicety.
 *
 * ## The boundary
 *
 * Every `/auth/verify` token in a rendered body — in the extracted link list, in the HTML injected
 * into the page, and in the plain-text tablet — is replaced with `redacted` **unless
 * `magicLinkMayBeShown` says that recipient's link may be shown**. That is the same single predicate
 * the sign-in page and the reviewer invite go through, so this surface adds no new policy and cannot
 * drift from theirs: an instance that delivers nothing to anybody still shows every link, a seeded
 * demo identity at a reserved domain still shows its own, and a real address under a real transport
 * shows none.
 *
 * The predicate is asked about `toEmail`, because that is the account the token in the body belongs
 * to — the recipient of the message is the identity the link would hand over.
 *
 * Deliberately *not* conditions:
 *
 *  - **`templateKey`.** See above; the credential is not confined to one template, and an organizer
 *    can write `{{portal.link}}` into an ad-hoc campaign.
 *  - **Transport alone.** Under a real transport the seeded demo still has no inbox, and `T-7a` still
 *    has to work. `magicLinkPrecheck` already folds transport in as one of its four conditions.
 *  - **Whether the send succeeded.** A bounce is not evidence the reader is entitled to a session as
 *    the recipient. `lib/demo-access.ts` explains why at length.
 *
 * Non-credential links are untouched at every visibility. An agenda URL, an event website, a
 * `/api/calendar/…` download and a bare `/portal` link are not credentials, and blanking them would
 * break the page for the case it exists to serve.
 *
 * ## Render time, not write time
 *
 * This redacts on the way out of the database rather than on the way in, for two reasons.
 *
 * The demo needs the row intact: under the log transport the stored body *is* the delivered message,
 * so a token stripped at write time is a judge who cannot sign in. And condition 4 of the boundary —
 * "holds membership on no event outside the demo" — is a fact about *now*, not about the moment of
 * the send. A demo identity later invited into a real event has to stop being readable
 * retroactively, and only a check at read time can do that. A write-time rule would also leave every
 * row already in the table exposed.
 *
 * The honest cost: the token stays at rest in `email_log`, so anyone with database access reads it
 * without going through this page. This gate is not a substitute for treating that table as
 * credential-bearing. Narrowing it at write time — keeping the token only where the log transport
 * handled the send, since a real transport already delivered the only copy the recipient needs —
 * would remove that residue for real recipients and is worth doing, but it belongs in `lib/mail`
 * (W5) alongside a decision about the existing rows, not here.
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

/** Whether this row carries a credential at all — the cheap check that decides if a query is worth it. */
export function carriesMagicLink(entry: { bodyHtml: string; bodyText: string }): boolean {
  return HAS_MAGIC_LINK.test(entry.bodyHtml) || HAS_MAGIC_LINK.test(entry.bodyText);
}

function redact(source: string): string {
  return source.replace(MAGIC_LINK_TOKEN, `$1${REDACTED}`);
}

/**
 * Pulls every href out of a body. A magic link is the one thing a judge must be able to click, and
 * hunting for it inside a branded HTML table is exactly the friction `T-7a` exists to remove.
 *
 * Runs over the *already redacted* body and drops what was redacted, so the list never offers a
 * dead link where a credential used to be.
 */
function linksIn(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1].replace(/&amp;/g, '&');
    if (!href.startsWith('http') && !href.startsWith('/')) continue;
    if (href.includes(`token=${REDACTED}`)) continue;
    found.add(href);
  }
  return [...found];
}

export type MailboxBody = {
  bodyHtml: string;
  bodyText: string;
  links: string[];
  /** True when a credential was withheld, so the page can say so instead of silently losing a link. */
  redacted: boolean;
};

/**
 * The single decision, applied to all three renderings of a body at once. A link is still clickable
 * inside `dangerouslySetInnerHTML` and still copy-pasteable out of a `<pre>`, so gating only the
 * extracted list would close nothing.
 */
export function mailboxBody(
  entry: { bodyHtml: string; bodyText: string },
  visibility: LinkVisibility,
): MailboxBody {
  if (visibility !== null) {
    return {
      bodyHtml: entry.bodyHtml,
      bodyText: entry.bodyText,
      links: linksIn(entry.bodyHtml),
      redacted: false,
    };
  }

  const bodyHtml = redact(entry.bodyHtml);
  const bodyText = redact(entry.bodyText);
  return {
    bodyHtml,
    bodyText,
    links: linksIn(bodyHtml),
    redacted: bodyHtml !== entry.bodyHtml || bodyText !== entry.bodyText,
  };
}
