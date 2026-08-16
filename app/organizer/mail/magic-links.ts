import type { LinkVisibility } from '@/lib/demo-access';
import { hasMagicLink, isRedacted, redactMagicLinks, REDACTED } from '@/lib/mail/redact';

/**
 * `T-6` versus `T-7a`, one surface further in than `lib/demo-access.ts` — read that module first.
 *
 * `/organizer/mail` renders `email_log` rows in full: every `href` in the body is lifted out as a
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
 * can reach comparable access anyway — but through a live session that identifies the organizer in
 * `impersonated_by`. The mailbox copy is the completely unattributed, transferable version. That
 * difference is the whole reason this is a fix and not a nicety, even though durable per-mutation
 * organizer attribution remains a separate hardening gap.
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
 * `sendMail` now does the other half of this at write time — a token is only stored at all where the
 * **log** transport handled that recipient, because a real transport has already delivered the
 * recipient's own copy and a second live credential in `email_log` buys nothing (`lib/mail/index.ts`,
 * `loggedCopy`). That is defence in depth underneath this gate, not a replacement for it: the two
 * reasons above still hold, so rows written under the log transport — the demo, and every fresh
 * clone — arrive here with their tokens intact and are gated here or nowhere. Rows written before
 * that shipped hold their tokens too. The pattern both ends match lives in `lib/mail/redact.ts`, once.
 *
 * The residue that is left: on an instance whose transport is `log`, the tokens are in the table by
 * design, and this page is the only thing standing between them and a reader. That table is
 * credential-bearing there, and should be treated as such.
 */

export { REDACTED };

/** Whether this row carries a credential at all — the cheap check that decides if a query is worth it. */
export function carriesMagicLink(entry: { bodyHtml: string; bodyText: string }): boolean {
  return hasMagicLink(entry.bodyHtml) || hasMagicLink(entry.bodyText);
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
  /**
   * True when the rendered body has no live sign-in token where one belongs, so the page can say so
   * instead of silently losing a link. Read off the *result* rather than off what this function
   * changed, because there are now two places a token can go missing: withheld here, or never
   * stored in the first place because a real transport delivered it. Both leave the reader looking
   * at a message with a hole in it, and both want the same sentence.
   */
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
  const bodyHtml = visibility === null ? redactMagicLinks(entry.bodyHtml) : entry.bodyHtml;
  const bodyText = visibility === null ? redactMagicLinks(entry.bodyText) : entry.bodyText;

  return {
    bodyHtml,
    bodyText,
    links: linksIn(bodyHtml),
    redacted: isRedacted(bodyHtml) || isRedacted(bodyText),
  };
}
