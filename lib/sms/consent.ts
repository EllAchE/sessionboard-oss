import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { smsConsent, user } from '../../db/schema';
import { normalizePhoneNumber } from '../phone';

export type SmsConsentSource =
  | 'organizer_settings'
  | 'speaker_profile'
  | 'phone_verification'
  | 'notification_preference'
  | 'twilio_inbound'
  | 'migration_reconsent';

export async function hasActiveSmsConsent(phone: string): Promise<boolean> {
  const normalized = normalizePhoneNumber(phone);
  const row = await getDb().query.smsConsent.findFirst({
    where: eq(smsConsent.phone, normalized),
    columns: { status: true },
  });
  return row?.status === 'opted_in';
}

export async function recordSmsConsent(
  phone: string,
  optedIn: boolean,
  source: SmsConsentSource,
): Promise<void> {
  const normalized = normalizePhoneNumber(phone);
  const now = new Date();
  await getDb()
    .insert(smsConsent)
    .values({
      phone: normalized,
      status: optedIn ? 'opted_in' : 'opted_out',
      source,
      consentedAt: optedIn ? now : null,
      optedOutAt: optedIn ? null : now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: smsConsent.phone,
      set: {
        status: optedIn ? 'opted_in' : 'opted_out',
        source,
        // Keep the prior opposite timestamp as minimal audit history; `status` says which is newer.
        ...(optedIn ? { consentedAt: now } : { optedOutAt: now }),
        updatedAt: now,
      },
    });
}

/**
 * Fail-closed first half of a preference change. Old destinations and explicit opt-outs are
 * blocked before the user row changes, so a partial write can suppress a send but never authorize
 * one the user declined.
 */
export async function blockSmsBeforePreferenceChange(input: {
  previousPhone: string | null;
  nextPhone: string | null;
  nextEnabled: boolean;
  source: SmsConsentSource;
}): Promise<void> {
  if (input.previousPhone && input.previousPhone !== input.nextPhone) {
    await recordSmsConsent(input.previousPhone, false, input.source);
  }
  if (input.nextPhone && !input.nextEnabled) {
    await recordSmsConsent(input.nextPhone, false, input.source);
  }
}

/** Enabling is written last: no preference can send until its consent row exists. */
export async function grantSmsAfterPreferenceChange(
  phone: string | null,
  enabled: boolean,
  source: SmsConsentSource,
): Promise<void> {
  if (phone && enabled) await recordSmsConsent(phone, true, source);
}

export async function applyInboundSmsPreference(
  phone: string,
  optedIn: boolean,
): Promise<void> {
  const normalized = normalizePhoneNumber(phone);
  await recordSmsConsent(normalized, optedIn, 'twilio_inbound');
  await getDb()
    .update(user)
    .set({ notifySms: optedIn, updatedAt: new Date() })
    .where(eq(user.phone, normalized));
}
