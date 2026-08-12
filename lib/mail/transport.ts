export type OutgoingMail = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /**
   * A VCALENDAR body attached as `text/calendar; method=REQUEST`. `C-3` lives or dies on this being
   * an attachment with the right method parameter rather than an `.ics` link — that is what makes a
   * calendar client update the existing event in place instead of creating a second one.
   */
  ics?: string;
};

export type SendResult = { providerMessageId?: string };

export interface MailTransport {
  readonly name: 'resend' | 'smtp' | 'log';
  send(mail: OutgoingMail): Promise<SendResult>;
}
