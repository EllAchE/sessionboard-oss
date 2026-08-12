import type { MailTransport, OutgoingMail, SendResult } from './transport';

/**
 * Self-host only. `nodemailer` is imported lazily because a static import would drag a pile of Node
 * built-ins into the Workers bundle for a transport that can never run there — Workers has no raw
 * TCP for SMTP. Selecting this transport on Workers is a configuration error, not a fallback.
 */
export function smtpTransport(url: string, allowInsecure: boolean): MailTransport {
  return {
    name: 'smtp',
    async send(mail: OutgoingMail): Promise<SendResult> {
      const { createTransport } = await import('nodemailer');
      const transporter = createTransport({
        url,
        // MailHog and the compose stack speak plaintext on 1025 with a self-signed certificate.
        ...(allowInsecure ? { tls: { rejectUnauthorized: false } } : {}),
      } as never);

      const info = (await transporter.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: mail.replyTo,
        ...(mail.ics
          ? {
              // `method=REQUEST` must survive onto the MIME part or the invite reads as a plain
              // attachment and `C-3`'s update-in-place behaviour silently stops working.
              icalEvent: { method: 'REQUEST', content: mail.ics, filename: 'invite.ics' },
            }
          : {}),
      })) as { messageId?: string };

      return { providerMessageId: info.messageId };
    },
  };
}
