import { afterEach, describe, expect, it, vi } from 'vitest';

const { getCloudflareContext } = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(() => {
    throw new Error('no cloudflare context');
  }),
}));

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }));

import { resolveMailTransport } from './config';

/**
 * `T-6`. The bug this covers is not a crash — it is `MAIL_TRANSPORT=smtp` with no server behind it
 * quietly becoming `log`, so `/admin/mail` shows a full outbox of mail that never left the machine.
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
