export type OutgoingSms = {
  to: string;
  from: string;
  body: string;
};

export type SendResult = { providerMessageId?: string };

export interface SmsTransport {
  readonly name: 'twilio' | 'log';
  send(sms: OutgoingSms): Promise<SendResult>;
}
