import { afterEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(() => {
    throw new Error('no cloudflare context');
  }),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

import { resolveMailTransport, undeliverableRecipient } from './config';

/**
 * `T-6`. The bug this covers is not a crash — it is `MAIL_TRANSPORT=smtp` with no server behind it
 * quietly becoming `log`, so `/organizer/mail` shows a full outbox of mail that never left the machine.
 * Degrading is still the behaviour; being quiet about it is not.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('transport selection', () => {
  it('defaults to log without a word of complaint', () => {
    expect(resolveMailTransport()).toEqual({ transport: 'log', warning: null });
  });

  it('is silent when log is asked for explicitly', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'log');
    expect(resolveMailTransport()).toEqual({ transport: 'log', warning: null });
  });

  it('selects resend when a key is present', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_123');
    expect(resolveMailTransport()).toEqual({
      transport: 'resend',
      apiKey: 're_123',
      warning: null,
    });
  });

  it('warns when resend is asked for without a key', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'resend');
    const resolved = resolveMailTransport();
    expect(resolved.transport).toBe('log');
    expect(resolved.warning).toMatch(/RESEND_API_KEY is not set/);
  });

  it('accepts a connection URL', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtp');
    vi.stubEnv('SMTP_URL', 'smtp://localhost:1025');
    vi.stubEnv('SMTP_ALLOW_INSECURE', 'true');
    expect(resolveMailTransport()).toMatchObject({
      transport: 'smtp',
      allowInsecure: true,
      smtp: { url: 'smtp://localhost:1025' },
    });
  });

  /** The variables `.env.example` has always documented, which the code used to ignore outright. */
  it('accepts the discrete host fields', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtp');
    vi.stubEnv('SMTP_HOST', 'mail.example.com');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_USER', 'cicero');
    vi.stubEnv('SMTP_PASSWORD', 'secret');
    vi.stubEnv('SMTP_SECURE', 'true');

    expect(resolveMailTransport()).toEqual({
      transport: 'smtp',
      allowInsecure: false,
      warning: null,
      smtp: {
        url: undefined,
        host: 'mail.example.com',
        port: 465,
        secure: true,
        user: 'cicero',
        password: 'secret',
      },
    });
  });

  it('warns when smtp is asked for with nothing configured', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtp');
    const resolved = resolveMailTransport();
    expect(resolved.transport).toBe('log');
    expect(resolved.warning).toMatch(/SMTP_URL/);
    expect(resolved.warning).toMatch(/SMTP_HOST/);
  });

  it('treats a blank host as unconfigured rather than as a server', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtp');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_PORT', '587');
    expect(resolveMailTransport().transport).toBe('log');
  });

  it('warns on a transport name it does not know', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'sendgrid');
    const resolved = resolveMailTransport();
    expect(resolved.transport).toBe('log');
    expect(resolved.warning).toMatch(/not a transport this build knows/);
  });
});

/**
 * What makes the deployed demo one secret away from real mail instead of one commit away: `auto`
 * takes whichever transport has credentials, so `wrangler secret put RESEND_API_KEY` is the flip.
 */
describe('auto', () => {
  it('is the dev mailbox with nothing configured, and does not call that a mistake', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'auto');
    expect(resolveMailTransport()).toEqual({ transport: 'log', warning: null });
  });

  it('becomes resend the moment a key exists', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'auto');
    vi.stubEnv('RESEND_API_KEY', 're_123');
    expect(resolveMailTransport()).toEqual({ transport: 'resend', apiKey: 're_123', warning: null });
  });

  it('falls to a configured SMTP server when there is no Resend key', () => {
    vi.stubEnv('MAIL_TRANSPORT', 'auto');
    vi.stubEnv('SMTP_URL', 'smtp://localhost:1025');
    expect(resolveMailTransport()).toMatchObject({ transport: 'smtp' });
  });
});

/**
 * The property the demo's security rests on: these domains are reserved by RFC 2606 / 6761 and can
 * never have a mailbox behind them, which is why the seed uses them and why an on-screen magic link
 * for one cannot lock a real person out of anything.
 */
describe('recipients nothing can be delivered to', () => {
  it('recognises the reserved domains the seed is built from', () => {
    expect(undeliverableRecipient('organizer@example.com')).toBe(true);
    expect(undeliverableRecipient('octavian@first-settlement.example')).toBe(true);
    expect(undeliverableRecipient('someone@example.NET')).toBe(true);
    expect(undeliverableRecipient('someone@example.org')).toBe(true);
    expect(undeliverableRecipient('dev@app.localhost')).toBe(true);
    expect(undeliverableRecipient('qa@thing.invalid')).toBe(true);
    expect(undeliverableRecipient('reviewer@example.test')).toBe(true);
  });

  it('does not mistake a real domain for a reserved one', () => {
    expect(undeliverableRecipient('speaker@acme.com')).toBe(false);
    expect(undeliverableRecipient('speaker@example.com.attacker.net')).toBe(false);
    expect(undeliverableRecipient('speaker@notexample.com')).toBe(false);
    expect(undeliverableRecipient('speaker@example.computer')).toBe(false);
    expect(undeliverableRecipient('not-an-address')).toBe(false);
    expect(undeliverableRecipient('trailing@')).toBe(false);
  });
});
