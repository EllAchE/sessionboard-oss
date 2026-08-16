import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { smsLog } from '../../db/schema';
import { appUrl, env } from '../env';
import { normalizePhoneNumber } from '../phone';
import { hasActiveSmsConsent } from './consent';
import { logTransport } from './log';
import { twilioTransport } from './twilio';
import type { OutgoingSms, SmsTransport } from './transport';

export type { OutgoingSms, SmsTransport } from './transport';

function selectTransport(): SmsTransport {
  const configured = env('SMS_TRANSPORT') ?? 'log';
  if (configured === 'twilio') {
    const sid = env('TWILIO_ACCOUNT_SID');
    const token = env('TWILIO_AUTH_TOKEN');
    // Falling back rather than throwing is deliberate: a missing key should degrade to the dev
    // mailbox, not take down every notification that has an SMS-preferring recipient.
    const callbackBase = appUrl();
    let publicCallbacks = false;
    try {
      const parsed = new URL(callbackBase);
      publicCallbacks = parsed.protocol === 'https:' && parsed.hostname !== 'localhost';
    } catch {
      publicCallbacks = false;
    }
    return sid && token && publicCallbacks
      ? twilioTransport(sid, token, `${callbackBase}/api/webhooks/twilio/status`)
      : logTransport();
  }
  return logTransport();
}

/**
 * Verification is the one SMS allowed before consent: it proves ownership so consent can later be
 * granted. Keeping it separate from `sendSms` means no ordinary caller can bypass the consent gate.
 * Log mode persists the code in `/organizer/sms` and returns it to the signed-in requester; it never
 * contacts Twilio.
 */
export async function sendPhoneVerificationCode(input: {
  to: string;
  code: string;
}): Promise<{ sent: boolean; mode: SmsTransport['name']; logCode?: string }> {
  const db = getDb();
  const transport = selectTransport();
  const from = env('SMS_FROM') ?? '';
  const to = normalizePhoneNumber(input.to);
  const body = `Your Cicero verification code is ${input.code}. It expires in 10 minutes.`;
  const [row] = await db
    .insert(smsLog)
    .values({
      eventId: null,
      toPhone: to,
      fromPhone: from,
      body,
      templateKey: 'phone.verification',
      status: 'queued',
    })
    .returning({ id: smsLog.id });

  try {
    const result = await transport.send({ to, from, body });
    await db
      .update(smsLog)
      .set({
        status: 'sent',
        sentAt: new Date(),
        statusUpdatedAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
      })
      .where(eq(smsLog.id, row.id));
    return {
      sent: true,
      mode: transport.name,
      ...(transport.name === 'log' ? { logCode: input.code } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(smsLog)
      .set({ status: 'failed', error: message, statusUpdatedAt: new Date() })
      .where(eq(smsLog.id, row.id));
    return { sent: false, mode: transport.name };
  }
}

export type SendSmsInput = Omit<OutgoingSms, 'from'> & {
  from?: string;
  eventId?: string | null;
  templateKey?: string | null;
};

/**
 * The SMS equivalent of `sendMail` (`lib/mail/index.ts`) — same insert-before-dispatch shape, same
 * "never throws" contract, so a failed send is still readable at `/organizer/sms` with its error attached.
 */
export async function sendSms(input: SendSmsInput): Promise<{ id: string; sent: boolean }> {
  const db = getDb();
  const transport = selectTransport();
  const from = input.from ?? env('SMS_FROM') ?? '';
  let to: string | null = null;
  let inputError: string | null = null;
  try {
    to = normalizePhoneNumber(input.to);
  } catch (error) {
    inputError = error instanceof Error ? error.message : String(error);
  }

  const [row] = await db
    .insert(smsLog)
    .values({
      eventId: input.eventId ?? null,
      toPhone: to ?? input.to.trim(),
      fromPhone: from,
      body: input.body,
      templateKey: input.templateKey ?? null,
      status: 'queued',
    })
    .returning({ id: smsLog.id });

  try {
    if (inputError || !to) throw new Error(inputError ?? 'Invalid SMS destination');
    if (!(await hasActiveSmsConsent(to))) {
      throw new Error('SMS suppressed: this phone number has not opted in');
    }
    const result = await transport.send({ ...input, to, from });
    await db
      .update(smsLog)
      .set({
        status: 'sent',
        sentAt: new Date(),
        statusUpdatedAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
      })
      .where(eq(smsLog.id, row.id));
    return { id: row.id, sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    await db
      .update(smsLog)
      .set({ status: 'failed', error: message, statusUpdatedAt: new Date() })
      .where(eq(smsLog.id, row.id));
    return { id: row.id, sent: false };
  }
}

/** Which transport is live, for the organizer SMS mailbox banner and the deployment checklist. */
export function activeSmsTransportName(): SmsTransport['name'] {
  return selectTransport().name;
}
