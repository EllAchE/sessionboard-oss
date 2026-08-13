import { env, envFlag } from '../env';
import { smtpConfigured, type SmtpConfig } from './smtp';

/**
 * `T-6`. Which transport the environment actually asks for, and — when it asks for one it has not
 * configured — the sentence that says so.
 *
 * Kept apart from `./index` so it can be read without dragging the database in, and because the
 * failure this guards is a configuration failure rather than a send failure: an unconfigured
 * `MAIL_TRANSPORT=smtp` degrades to `log`, where every message still lands in `email_log` and reads
 * as sent at `/admin/mail` while never leaving the machine. Degrading is the right behaviour —
 * losing acceptance emails because a provider key expired would be worse — but it has to be *loud*,
 * or a self-hoster's first real send is discovered missing by the speaker who never got it.
 */

export type ResolvedMail =
  | { transport: 'resend'; apiKey: string; warning: null }
  | { transport: 'smtp'; smtp: SmtpConfig; allowInsecure: boolean; warning: null }
  | { transport: 'log'; warning: string | null };

const FALLBACK =
  'Falling back to the log transport: mail is recorded in email_log and readable at /admin/mail, but nothing is delivered.';

/** Reads the discrete SMTP variables `.env.example` documents, alongside `SMTP_URL`. */
export function smtpConfigFromEnv(): SmtpConfig {
  const port = env('SMTP_PORT');
  const parsedPort = port ? Number.parseInt(port, 10) : Number.NaN;
  return {
    url: env('SMTP_URL') || undefined,
    host: env('SMTP_HOST') || undefined,
    port: Number.isFinite(parsedPort) ? parsedPort : undefined,
    secure: envFlag('SMTP_SECURE'),
    user: env('SMTP_USER') || undefined,
    password: env('SMTP_PASSWORD') || undefined,
  };
}

export function resolveMailTransport(): ResolvedMail {
  const configured = env('MAIL_TRANSPORT') ?? 'log';

  if (configured === 'resend') {
    const apiKey = env('RESEND_API_KEY');
    return apiKey
      ? { transport: 'resend', apiKey, warning: null }
      : {
          transport: 'log',
          warning: `MAIL_TRANSPORT=resend but RESEND_API_KEY is not set. ${FALLBACK}`,
        };
  }

  if (configured === 'smtp') {
    const smtp = smtpConfigFromEnv();
    return smtpConfigured(smtp)
      ? { transport: 'smtp', smtp, allowInsecure: envFlag('SMTP_ALLOW_INSECURE'), warning: null }
      : {
          transport: 'log',
          warning: `MAIL_TRANSPORT=smtp but no SMTP server is configured. Set SMTP_URL, or SMTP_HOST with SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_SECURE. ${FALLBACK}`,
        };
  }

  if (configured !== 'log') {
    return {
      transport: 'log',
      warning: `MAIL_TRANSPORT=${configured} is not a transport this build knows (expected resend, smtp or log). ${FALLBACK}`,
    };
  }

  // The documented default. Silent on purpose: `log` is a complete dev mailbox, not a misconfiguration.
  return { transport: 'log', warning: null };
}
