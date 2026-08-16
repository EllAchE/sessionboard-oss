import type { SendResult, SmsTransport } from './transport';

/**
 * The default. Every send is already persisted to `sms_log` by `sendSms`, and `/organizer/sms` renders
 * that table — so this transport does nothing and loses nothing. Same rationale as `lib/mail/log.ts`.
 */
export function logTransport(): SmsTransport {
  return {
    name: 'log',
    async send(): Promise<SendResult> {
      return {};
    },
  };
}
