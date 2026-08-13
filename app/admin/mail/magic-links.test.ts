import { describe, expect, it } from 'vitest';
import { carriesMagicLink, mailboxBody } from './magic-links';

/**
 * The mailbox renders `email_log` bodies in three places at once — an extracted link list, the raw
 * HTML, and the plain-text part — and a sign-in token in any of them is a session as the recipient.
 * These assert that all three move together, and that the decision is `magicLinkMayBeShown`'s alone.
 */

const TOKEN = 'one-time-secret';
const LINK = `https://cicero.test/auth/verify?token=${TOKEN}`;

function bodyWith(link: string) {
  return {
    bodyHtml: `<p>Hi,</p><p><a href="${link}">Sign in to Cicero</a></p><p><a href="https://acme.test/agenda">The agenda</a></p>`,
    bodyText: `Hi,\n\n${link}\n\nThe agenda: https://acme.test/agenda\n`,
  };
}

function everythingRendered(result: ReturnType<typeof mailboxBody>): string {
  return JSON.stringify(result);
}

describe('carriesMagicLink', () => {
  it('spots a token in either part, and is not confused by its own regex state', () => {
    expect(carriesMagicLink(bodyWith(LINK))).toBe(true);
    // Twice in a row: a global regex reused across `test` calls would answer false the second time.
    expect(carriesMagicLink(bodyWith(LINK))).toBe(true);
    expect(carriesMagicLink({ bodyHtml: '<p>no links here</p>', bodyText: 'no links here' })).toBe(
      false,
    );
  });

  it('spots one that reached the plain-text part only', () => {
    expect(carriesMagicLink({ bodyHtml: '<p>Sign in</p>', bodyText: LINK })).toBe(true);
  });
});

describe('mailboxBody, when the recipient may not be shown their link', () => {
  const result = mailboxBody(bodyWith(LINK), null);

  it('leaves the token nowhere on the page', () => {
    expect(everythingRendered(result)).not.toContain(TOKEN);
  });

  it('redacts the raw HTML, not only the extracted list — it is clickable in there too', () => {
    expect(result.bodyHtml).toContain('/auth/verify?token=redacted');
    expect(result.bodyHtml).not.toContain(TOKEN);
  });

  it('redacts the plain-text part, which is copy-pasteable', () => {
    expect(result.bodyText).toContain('/auth/verify?token=redacted');
    expect(result.bodyText).not.toContain(TOKEN);
  });

  it('drops the dead link from the list rather than offering it', () => {
    expect(result.links).toEqual(['https://acme.test/agenda']);
  });

  it('says that something was withheld, so the page can explain the gap', () => {
    expect(result.redacted).toBe(true);
  });
});

describe('mailboxBody, when the link may be shown', () => {
  it('renders it untouched on an instance that delivers nothing to anybody', () => {
    const result = mailboxBody(bodyWith(LINK), 'instance-delivers-nothing');

    expect(result.bodyHtml).toContain(LINK);
    expect(result.bodyText).toContain(LINK);
    expect(result.links).toContain(LINK);
    expect(result.redacted).toBe(false);
  });

  it('renders it untouched for a seeded demo identity under a real transport', () => {
    const result = mailboxBody(bodyWith(LINK), 'seeded-demo-account');

    expect(result.links).toContain(LINK);
    expect(result.bodyHtml).toContain(LINK);
    expect(result.redacted).toBe(false);
  });
});

describe('mailboxBody, on templates that are not the sign-in email', () => {
  const portalLink = `https://cicero.test/auth/verify?token=${TOKEN}`;
  const accepted = {
    bodyHtml: `<p>Accepted!</p><p><a href="${portalLink}">Open your speaker portal</a></p>`,
    bodyText: `Accepted!\n\n${portalLink}\n`,
  };

  /**
   * The gate keys on the token, not on `templateKey`. `{{portal.link}}` in `submission.accepted` is
   * the same credential with a fourteen-day life, so gating `auth.magic_link` alone would close
   * nothing.
   */
  it('withholds a portal sign-in link carried by an ordinary template', () => {
    const result = mailboxBody(accepted, null);

    expect(everythingRendered(result)).not.toContain(TOKEN);
    expect(result.redacted).toBe(true);
    expect(result.links).toEqual([]);
  });

  it('leaves a template with no credential in it completely alone', () => {
    const invite = {
      bodyHtml:
        '<p>Your session is scheduled.</p><p><a href="https://cicero.test/api/calendar/sess-1">Add to calendar</a></p><p><a href="/portal">Your portal</a></p>',
      bodyText: 'Your session is scheduled.\nhttps://cicero.test/api/calendar/sess-1\n',
    };
    const result = mailboxBody(invite, null);

    expect(result.bodyHtml).toBe(invite.bodyHtml);
    expect(result.bodyText).toBe(invite.bodyText);
    expect(result.links).toEqual(['https://cicero.test/api/calendar/sess-1', '/portal']);
    expect(result.redacted).toBe(false);
  });
});

/**
 * `sendMail` no longer stores the token at all where a real transport handled the recipient, so a
 * row can arrive here already redacted. The page's explanation of the gap hangs off `redacted`, and
 * it has to fire for that row too — otherwise the reader gets a message with a link missing and no
 * sentence saying why.
 */
describe('mailboxBody, on a row whose token was never stored', () => {
  const alreadyRedacted = bodyWith('https://cicero.test/auth/verify?token=redacted');

  it('still explains the gap when the reader may not be shown the link', () => {
    const result = mailboxBody(alreadyRedacted, null);

    expect(result.redacted).toBe(true);
    expect(result.links).toEqual(['https://acme.test/agenda']);
  });

  it('explains it even where visibility would have allowed a link, since there is none to show', () => {
    const result = mailboxBody(alreadyRedacted, 'instance-delivers-nothing');

    expect(result.redacted).toBe(true);
    expect(result.links).toEqual(['https://acme.test/agenda']);
  });
});

describe('mailboxBody, on bodies shaped to slip past the pattern', () => {
  it('catches every token in a body carrying more than one', () => {
    const second = 'second-secret';
    const result = mailboxBody(
      {
        bodyHtml: `<a href="${LINK}">one</a><a href="https://cicero.test/auth/verify?token=${second}">two</a>`,
        bodyText: `${LINK}\nhttps://cicero.test/auth/verify?token=${second}\n`,
      },
      null,
    );

    expect(result.bodyHtml).not.toContain(TOKEN);
    expect(result.bodyHtml).not.toContain(second);
    expect(result.bodyText).not.toContain(second);
    expect(result.links).toEqual([]);
  });

  it('catches a token behind other query parameters, HTML-escaped or not', () => {
    const escaped = `https://cicero.test/auth/verify?next=%2Fportal&amp;token=${TOKEN}`;
    const raw = `https://cicero.test/auth/verify?next=/portal&token=${TOKEN}`;
    const result = mailboxBody({ bodyHtml: `<a href="${escaped}">in</a>`, bodyText: raw }, null);

    expect(result.bodyHtml).not.toContain(TOKEN);
    expect(result.bodyText).not.toContain(TOKEN);
    expect(result.links).toEqual([]);
  });

  it('catches a bare URL sitting in the anchor text as well as in the href', () => {
    const result = mailboxBody({ bodyHtml: `<a href="${LINK}">${LINK}</a>`, bodyText: '' }, null);

    expect(result.bodyHtml).not.toContain(TOKEN);
  });

  it('does not maul a link that merely ends in something token-shaped', () => {
    const decoy = {
      bodyHtml: '<a href="https://acme.test/verify?authtoken=public-id">verify</a>',
      bodyText: 'https://acme.test/verify?authtoken=public-id',
    };
    const result = mailboxBody(decoy, null);

    expect(result.bodyHtml).toBe(decoy.bodyHtml);
    expect(result.redacted).toBe(false);
  });
});
