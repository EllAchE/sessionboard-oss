import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(() => {
    throw new Error('no cloudflare context');
  }),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

const state = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../db/client', () => ({
  getDb: () => ({
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return { returning: async () => [{ id: `mail-${state.inserted.length}` }] };
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        state.updated.push(patch);
        return { where: async () => undefined };
      },
    }),
  }),
}));

import { sendMail } from './index';

/**
 * The residue `/organizer/mail`'s render-time gate could not reach: a `/auth/verify?token=…` is a live
 * session as the recipient, `sendMail` writes the body to `email_log` before dispatch, and anyone
 * with database access reads it there without going through the page that gates it.
 *
 * The rule under test is per **recipient**, not per deployment. `sendMail` routes reserved-domain
 * addresses to the log transport whatever is configured, and where the log transport handled the
 * send the stored row *is* the delivered message — `T-7a` is that row being readable. So a live
 * Resend key must redact a real speaker's token and leave the seeded demo's alone, in the same run.
 */

const TOKEN = 'e6f0a3c8d4b24d1f9a7c0e5b2f8d6a41';
const LINK = `https://cicero.events/auth/verify?token=${TOKEN}&next=%2Fportal`;

function body(link: string) {
  return {
    subject: 'Your sign-in link',
    html: `<p>Hi,</p><p><a href="${link.replace(/&/g, '&amp;')}">Sign in</a></p><p><a href="https://acme.test/agenda">Agenda</a></p>`,
    text: `Sign in: ${link}\nAgenda: https://acme.test/agenda`,
  };
}

function stubResend() {
  vi.stubEnv('MAIL_TRANSPORT', 'resend');
  vi.stubEnv('RESEND_API_KEY', 're_123');
  vi.stubEnv('MAIL_FROM', 'Cicero <programme@cicero.events>');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) })) as unknown as typeof fetch,
  );
}

const stored = () => state.inserted[state.inserted.length - 1];

beforeEach(() => {
  state.inserted = [];
  state.updated = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sign-in tokens at rest in email_log', () => {
  it('keeps the token under the log transport, because that row is the delivered message', async () => {
    const result = await sendMail({ to: 'marcus@cicero.events', ...body(LINK) });

    expect(result.sent).toBe(true);
    expect(stored().bodyHtml).toContain(TOKEN);
    expect(stored().bodyText).toContain(TOKEN);
  });

  it('strips the token when a real transport delivered the recipient their own copy', async () => {
    stubResend();

    const result = await sendMail({ to: 'marcus@cicero.events', ...body(LINK) });

    expect(result.sent).toBe(true);
    expect(stored().bodyHtml).not.toContain(TOKEN);
    expect(stored().bodyText).not.toContain(TOKEN);
    expect(stored().bodyHtml).toContain('/auth/verify?token=redacted');
    expect(stored().bodyText).toContain('/auth/verify?token=redacted');
  });

  it('keeps the audit trail — recipient, subject, timestamp and the rest of the body survive', async () => {
    stubResend();

    await sendMail({
      to: 'marcus@cicero.events',
      templateKey: 'auth.magic_link',
      eventId: 'event-one',
      ...body(LINK),
    });

    expect(stored()).toMatchObject({
      toEmail: 'marcus@cicero.events',
      fromEmail: 'Cicero <programme@cicero.events>',
      subject: 'Your sign-in link',
      templateKey: 'auth.magic_link',
      eventId: 'event-one',
      status: 'queued',
    });
    expect(stored().bodyHtml).toContain('https://acme.test/agenda');
    expect(stored().bodyText).toContain('Agenda: https://acme.test/agenda');
    expect(state.updated[0]).toMatchObject({ status: 'sent' });
  });

  it('keeps a reserved-domain recipient readable even with Resend configured', async () => {
    stubResend();

    await sendMail({ to: 'organizer@example.com', ...body(LINK) });

    expect(stored().bodyHtml).toContain(TOKEN);
    expect(stored().bodyText).toContain(TOKEN);
  });

  it('redacts a real recipient in the same run that spares a reserved-domain one', async () => {
    stubResend();

    await sendMail({ to: 'senator@first-settlement.example', ...body(LINK) });
    await sendMail({ to: 'marcus@cicero.events', ...body(LINK) });

    expect(state.inserted[0].bodyText).toContain(TOKEN);
    expect(state.inserted[1].bodyText).not.toContain(TOKEN);
  });

  it('redacts a send the provider then rejected, because a bounce entitles nobody to the token', async () => {
    stubResend();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, text: async () => 'domain not verified' })) as unknown as typeof fetch,
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await sendMail({ to: 'marcus@cicero.events', ...body(LINK) });

    expect(result.sent).toBe(false);
    expect(stored().bodyText).not.toContain(TOKEN);
    expect(state.updated[0]).toMatchObject({ status: 'failed' });
  });

  it('covers a portal link in an ordinary template, not just auth.magic_link', async () => {
    stubResend();

    await sendMail({
      to: 'marcus@cicero.events',
      templateKey: 'submission.accepted',
      subject: 'You are in',
      html: `<p><a href="https://cicero.events/auth/verify?token=${TOKEN}">Open your portal</a></p>`,
      text: `Open your portal: https://cicero.events/auth/verify?token=${TOKEN}`,
    });

    expect(stored().bodyHtml).not.toContain(TOKEN);
    expect(stored().bodyText).not.toContain(TOKEN);
  });

  it('leaves a body with no credential in it byte-identical', async () => {
    stubResend();
    const plain = {
      subject: 'Your session is scheduled',
      html: '<p><a href="https://acme.test/agenda">Agenda</a></p>',
      text: 'Agenda: https://acme.test/agenda',
    };

    await sendMail({ to: 'marcus@cicero.events', ...plain });

    expect(stored()).toMatchObject({ bodyHtml: plain.html, bodyText: plain.text });
  });
});
