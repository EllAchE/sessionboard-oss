import { unavailable } from '../errors';
import { smtpTransport } from './smtp';
import { type MailTransport, type OutgoingMail, type SendResult } from './transport';

/**
 * Ordinary messages use Resend's HTTP API. Calendar messages deliberately use Resend's SMTP
 * endpoint instead: the HTTP API exposes `.ics` only as a file attachment, while an Outlook meeting
 * request must also carry the calendar as a `text/calendar; method=...` MIME alternative.
 *
 * `smtpTransport` gives Nodemailer the calendar through `icalEvent`, which emits both that
 * alternative and a downloadable attachment. Gmail understands either shape; Outlook needs the
 * former. Resend accepts the same API key as the SMTP password, so this does not add another secret
 * or another mail provider.
 */
function resendCalendarTransport(apiKey: string): MailTransport {
  return smtpTransport(
    {
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      user: 'resend',
      password: apiKey,
    },
    false,
  );
}

export function resendTransport(apiKey: string): MailTransport {
  return {
    name: 'resend',
    async send(mail: OutgoingMail): Promise<SendResult> {
      if (mail.ics) return resendCalendarTransport(apiKey).send(mail);

      const body: Record<string, unknown> = {
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      };
      if (mail.replyTo) body.reply_to = mail.replyTo;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw unavailable(`Resend rejected the message (${response.status}): ${await response.text()}`);
      }
      const json = (await response.json()) as { id?: string };
      return { providerMessageId: json.id };
    },
  };
}
