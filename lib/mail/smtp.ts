import {
  calendarMimeMethod,
  type MailTransport,
  type OutgoingMail,
  type SendResult,
} from './transport';

/**
 * Either a whole connection URL or the discrete fields. Both are accepted because a self-hoster who
 * has been handed SMTP credentials by their provider has a host, a port, a user and a password —
 * not a URL — and making them assemble one by hand is where the password with an `@` in it goes
 * wrong. `url` wins when both are present.
 */
export type SmtpConfig = {
  url?: string;
  host?: string;
  port?: number;
  /** Implicit TLS on connect (465). STARTTLS on 587 is negotiated regardless and is not this flag. */
  secure?: boolean;
  user?: string;
  password?: string;
};

/** True when there is enough here to open a connection at all. */
export function smtpConfigured(config: SmtpConfig): boolean {
  return Boolean(config.url || config.host);
}

/**
 * Kept separate from the connection so the exact MIME input can be verified without opening a
 * socket. Nodemailer's `icalEvent` is intentionally different from a generic attachment: it emits
 * the calendar inside `multipart/alternative` for Outlook and a second `.ics` file for clients that
 * expose only attachments.
 */
export function nodemailerMessage(mail: OutgoingMail): Record<string, unknown> {
  const method = mail.ics ? calendarMimeMethod(mail.ics) : null;
  return {
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: mail.replyTo,
    ...(mail.ics && method
      ? {
          // The method must survive onto the MIME part or the invite reads as a plain attachment
          // and a cancellation sent as `REQUEST` re-invites the speaker instead of withdrawing.
          icalEvent: {
            method,
            content: mail.ics.body,
            filename: method === 'CANCEL' ? 'cancel.ics' : 'invite.ics',
          },
        }
      : {}),
  };
}

/**
 * `nodemailer` is imported lazily because ordinary Resend messages use HTTP and should not pay to
 * initialise an SMTP client. Current Workers runtimes expose outbound TCP through `node:net`; port
 * 25 remains blocked there, so deployments on Workers must use a submission port such as 465/587.
 */
export function smtpTransport(config: SmtpConfig, allowInsecure: boolean): MailTransport {
  return {
    name: 'smtp',
    async send(mail: OutgoingMail): Promise<SendResult> {
      const { createTransport } = await import('nodemailer');
      const connection = config.url
        ? { url: config.url }
        : {
            host: config.host,
            // 587 (STARTTLS submission) is the near-universal default; 465 wants `secure`.
            port: config.port ?? (config.secure ? 465 : 587),
            secure: config.secure ?? false,
            ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
          };

      const transporter = createTransport({
        ...connection,
        // MailHog and the compose stack speak plaintext on 1025 with a self-signed certificate.
        ...(allowInsecure ? { tls: { rejectUnauthorized: false } } : {}),
      } as never);

      const info = (await transporter.sendMail(nodemailerMessage(mail))) as { messageId?: string };

      return { providerMessageId: info.messageId };
    },
  };
}
