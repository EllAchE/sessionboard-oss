import { unavailable } from '../errors';
import {
  calendarMimeMethod,
  type MailTransport,
  type OutgoingMail,
  type SendResult,
} from './transport';

/**
 * HTTP rather than the `resend` SDK: Workers cannot open an SMTP socket, and one `fetch` has no
 * Node built-ins to shim. Attachments are base64 in the JSON body, which is how the ICS rides along.
 */

/** `btoa` is byte-oriented, so a non-ASCII speaker name in a summary line has to be encoded first. */
function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function resendTransport(apiKey: string): MailTransport {
  return {
    name: 'resend',
    async send(mail: OutgoingMail): Promise<SendResult> {
      const body: Record<string, unknown> = {
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      };
      if (mail.replyTo) body.reply_to = mail.replyTo;
      if (mail.ics) {
        // The method parameter is the message's own, never a constant: a `CANCEL` body shipped as
        // `method=REQUEST` leaves the withdrawn session sitting on the speaker's calendar.
        const method = calendarMimeMethod(mail.ics);
        body.attachments = [
          {
            filename: method === 'CANCEL' ? 'cancel.ics' : 'invite.ics',
            content: base64Utf8(mail.ics.body),
            content_type: `text/calendar; method=${method}; charset=utf-8`,
          },
        ];
      }

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
