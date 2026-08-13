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

function resendFromEnv(): ResolvedMail | null {
  const apiKey = env('RESEND_API_KEY');
  return apiKey ? { transport: 'resend', apiKey, warning: null } : null;
}

function smtpFromEnv(): ResolvedMail | null {
  const smtp = smtpConfigFromEnv();
  return smtpConfigured(smtp)
    ? { transport: 'smtp', smtp, allowInsecure: envFlag('SMTP_ALLOW_INSECURE'), warning: null }
    : null;
}

export function resolveMailTransport(): ResolvedMail {
  const configured = env('MAIL_TRANSPORT') ?? 'log';

  /**
   * `auto` is what the deployed worker asks for, and the reason flipping the demo to real mail is a
   * secret rather than a commit: whichever transport has credentials wins, and with none it is the
   * dev mailbox. Unlike naming a transport outright this is not a promise that mail will leave, so
   * landing on `log` here is an answer rather than a misconfiguration and stays quiet. Which
   * transport actually won is never a guess — `/admin/mail` names it in the banner.
   */
  if (configured === 'auto') {
    return resendFromEnv() ?? smtpFromEnv() ?? { transport: 'log', warning: null };
  }

  if (configured === 'resend') {
    return (
      resendFromEnv() ?? {
        transport: 'log',
        warning: `MAIL_TRANSPORT=resend but RESEND_API_KEY is not set. ${FALLBACK}`,
      }
    );
  }

  if (configured === 'smtp') {
    return (
      smtpFromEnv() ?? {
        transport: 'log',
        warning: `MAIL_TRANSPORT=smtp but no SMTP server is configured. Set SMTP_URL, or SMTP_HOST with SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_SECURE. ${FALLBACK}`,
      }
    );
  }

  if (configured !== 'log') {
    return {
      transport: 'log',
      warning: `MAIL_TRANSPORT=${configured} is not a transport this build knows (expected auto, resend, smtp or log). ${FALLBACK}`,
    };
  }

  // The documented default. Silent on purpose: `log` is a complete dev mailbox, not a misconfiguration.
  return { transport: 'log', warning: null };
}

/**
 * Domains the IANA has reserved so that they can never resolve to a real host: RFC 2606's
 * `.test` / `.example` / `.invalid` / `.localhost` and `example.com` / `.net` / `.org`, plus
 * RFC 6761's restatement of the same. The seed populates both demo events entirely out of these —
 * `organizer@example.com`, six hundred senators at `@first-settlement.example` — precisely because
 * no mailbox behind them can ever exist.
 */
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost']);
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);

/**
 * True when the address is one nothing can ever be delivered to.
 *
 * Two things hang off this. `sendMail` routes these recipients to the log transport whatever else
 * is configured, so a live Resend key does not spend the demo's sender reputation hard-bouncing six
 * hundred fictional senators — real addresses still get real mail in the same run. And `lib/auth`
 * uses it as one of the conditions under which a magic link may be shown on screen: an address that
 * provably has no inbox is an address whose owner cannot be locked out of one.
 */
export function undeliverableRecipient(address: string): boolean {
  const at = address.lastIndexOf('@');
  if (at < 0) return false;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '');
  if (!domain) return false;
  if (RESERVED_DOMAINS.has(domain)) return true;
  return RESERVED_TLDS.has(domain.slice(domain.lastIndexOf('.') + 1));
}
