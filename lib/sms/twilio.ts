import { unavailable } from '../errors';
import type { OutgoingSms, SendResult, SmsTransport } from './transport';

/**
 * HTTP rather than the `twilio` SDK: same reasoning as `lib/mail/resend.ts` — Workers has no Node
 * built-ins to shim, and one `fetch` against the REST API needs none.
 */
export function twilioTransport(accountSid: string, authToken: string): SmsTransport {
  return {
    name: 'twilio',
    async send(sms: OutgoingSms): Promise<SendResult> {
      const body = new URLSearchParams({ To: sms.to, From: sms.from, Body: sms.body });

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body,
        },
      );

      if (!response.ok) {
        throw unavailable(`Twilio rejected the message (${response.status}): ${await response.text()}`);
      }
      const json = (await response.json()) as { sid?: string };
      return { providerMessageId: json.sid };
    },
  };
}
