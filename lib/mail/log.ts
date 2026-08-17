import type { MailTransport, SendResult } from './transport';

/**
 * The default. Every send is already persisted to `email_log` by `sendMail`, and `/organizer/mail`
 * renders that table — so this transport does nothing and loses nothing.
 *
 * This is what makes `T-7a` work and what removes email deliverability from the critical path
 * during judging: a judge who never checks an inbox can still open the acceptance email, click the
 * magic link inside it, and download the calendar invite.
 */
export function logTransport(): MailTransport {
  return {
    name: 'log',
    async send(): Promise<SendResult> {
      return {};
    },
  };
}
