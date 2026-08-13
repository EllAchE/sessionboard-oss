import { type CalendarMethod, readCalendarMethod } from '../ics';

/**
 * A VCALENDAR body plus the method it is being sent as. Both travel together because the method has
 * to appear twice — once inside the body (`METHOD:CANCEL`) and once on the MIME part
 * (`text/calendar; method=CANCEL`) — and only one of those is visible to the code that attaches it.
 */
export type OutgoingIcs = {
  body: string;
  method: CalendarMethod;
};

export type OutgoingMail = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /**
   * A VCALENDAR body attached as `text/calendar; method=<method>`. `C-3` lives or dies on this being
   * an attachment with the right method parameter rather than an `.ics` link — that is what makes a
   * calendar client update the existing event in place instead of creating a second one, and what
   * makes a cancellation withdraw the entry instead of re-inviting the speaker to it.
   */
  ics?: OutgoingIcs;
};

/**
 * The method to stamp on the MIME part. The body is authoritative: it is what a client parses once
 * the attachment is open, so a disagreement between the two is resolved in its favour and reported
 * rather than silently shipped. `method=REQUEST` on a `METHOD:CANCEL` body is precisely the bug
 * this exists to make impossible.
 */
export function calendarMimeMethod(ics: OutgoingIcs): CalendarMethod {
  const declared = readCalendarMethod(ics.body);
  if (declared && declared !== ics.method) {
    console.warn(
      `Calendar attachment declares METHOD:${declared} but was sent as ${ics.method}; ` +
        `using ${declared} for the MIME method parameter.`,
    );
    return declared;
  }
  return ics.method;
}

export type SendResult = { providerMessageId?: string };

export interface MailTransport {
  readonly name: 'resend' | 'smtp' | 'log';
  send(mail: OutgoingMail): Promise<SendResult>;
}
