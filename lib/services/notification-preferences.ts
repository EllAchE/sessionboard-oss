import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client';
import {
  event,
  notificationPreference,
  phoneVerificationChallenge,
  smsLog,
  unsubscribeToken,
  user,
} from '../../db/schema';
import { appUrl } from '../env';
import { invalid, notFound } from '../errors';
import { hashToken, randomToken, timingSafeEqual } from '../ids';
import { normalizePhoneNumber } from '../phone';
import { blockSmsBeforePreferenceChange, recordSmsConsent } from '../sms/consent';
import { activeSmsTransportName, sendPhoneVerificationCode } from '../sms';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  notificationCategory,
  type NotificationCategory,
} from '../notification-categories';

/**
 * The categories themselves live in `lib/notification-categories.ts`, which imports nothing: the two
 * client components that render a toggle per category cannot import this module without pulling
 * `getDb` into the browser bundle. Re-exported here so the many server-side callers that already
 * reach for them through this module keep working.
 *
 * `deadline` is `AR-51`'s, and needed no migration to add: `notification_preference.template_key` is
 * free text with no enum or check behind it, and the category is derived from the key prefix.
 */
export {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CATEGORY_ROWS,
  notificationCategory,
  type NotificationCategory,
} from '../notification-categories';

export type ChannelOverride = boolean | null;

export type CategoryPreference = { notifyEmail: ChannelOverride; notifySms: ChannelOverride };

export function phoneVerificationIsCurrent(
  account: {
    phone: string | null;
    phoneVerifiedAt: Date | null;
    phoneVerificationTransport: string | null;
  },
  activeTransport = activeSmsTransportName(),
): boolean {
  return Boolean(
    account.phone &&
      account.phoneVerifiedAt &&
      account.phoneVerificationTransport === activeTransport,
  );
}

export type NotificationPrefs = {
  phone: string | null;
  phoneVerified: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
  timezone: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  smsHourlyLimit: number;
  eventNotifyEmail: ChannelOverride;
  eventNotifySms: ChannelOverride;
  categories: Record<NotificationCategory, CategoryPreference>;
};

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 22:00')
  .nullable();

const categoryInput = z.object({
  notifyEmail: z.boolean().nullable(),
  notifySms: z.boolean().nullable(),
});

export const deliveryPreferenceInput = z
  .object({
    timezone: z.string().trim().max(64).nullable().optional(),
    quietStart: time.optional(),
    quietEnd: time.optional(),
    smsHourlyLimit: z.number().int().min(1).max(100).optional(),
    eventNotifyEmail: z.boolean().nullable().optional(),
    eventNotifySms: z.boolean().nullable().optional(),
    categories: z.record(z.enum(NOTIFICATION_CATEGORIES), categoryInput).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.quietStart === null) !== (value.quietEnd === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quietStart'],
        message: 'Set both quiet-hour times or clear both',
      });
    }
    if (value.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value.timezone }).format();
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['timezone'],
          message: 'Use an IANA timezone like America/New_York',
        });
      }
    }
  });
export type DeliveryPreferenceInput = z.input<typeof deliveryPreferenceInput>;

function emptyCategories(): Record<NotificationCategory, CategoryPreference> {
  return Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((key) => [key, { notifyEmail: null, notifySms: null }]),
  ) as Record<NotificationCategory, CategoryPreference>;
}

function minuteToTime(value: number | null): string | null {
  if (value === null) return null;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function timeToMinute(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function scopeKey(eventId?: string | null): string {
  return eventId ?? 'global';
}

export async function getRecipientNotificationPrefs(
  userId: string,
  eventId?: string | null,
): Promise<NotificationPrefs> {
  const db = getDb();
  const [account, rules] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: {
        phone: true,
        phoneVerifiedAt: true,
        phoneVerificationTransport: true,
        notifyEmail: true,
        notifySms: true,
      },
    }),
    db
      .select()
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.userId, userId),
          inArray(notificationPreference.scopeKey, ['global', ...(eventId ? [eventId] : [])]),
        ),
      ),
  ]);
  if (!account) throw notFound('Your account');

  const global = rules.find((row) => row.scopeKey === 'global' && row.templateKey === '*');
  const eventRule = eventId
    ? rules.find((row) => row.scopeKey === eventId && row.templateKey === '*')
    : undefined;
  const categories = emptyCategories();
  if (eventId) {
    for (const category of NOTIFICATION_CATEGORIES) {
      const row = rules.find((candidate) => candidate.scopeKey === eventId && candidate.templateKey === category);
      if (row) categories[category] = { notifyEmail: row.notifyEmail, notifySms: row.notifySms };
    }
  }

  return {
    phone: account.phone,
    phoneVerified: phoneVerificationIsCurrent(account),
    notifyEmail: account.notifyEmail,
    notifySms: account.notifySms && Boolean(account.phoneVerifiedAt),
    timezone: global?.timezone ?? null,
    quietStart: minuteToTime(global?.quietStartMinute ?? null),
    quietEnd: minuteToTime(global?.quietEndMinute ?? null),
    smsHourlyLimit: global?.smsHourlyLimit ?? 6,
    eventNotifyEmail: eventRule?.notifyEmail ?? null,
    eventNotifySms: eventRule?.notifySms ?? null,
    categories,
  };
}

async function upsertRule(input: {
  userId: string;
  eventId: string | null;
  templateKey: string;
  notifyEmail?: ChannelOverride;
  notifySms?: ChannelOverride;
  timezone?: string | null;
  quietStartMinute?: number | null;
  quietEndMinute?: number | null;
  smsHourlyLimit?: number | null;
}): Promise<void> {
  const db = getDb();
  const key = scopeKey(input.eventId);
  const now = new Date();
  const values = {
    userId: input.userId,
    eventId: input.eventId,
    scopeKey: key,
    templateKey: input.templateKey,
    notifyEmail: input.notifyEmail ?? null,
    notifySms: input.notifySms ?? null,
    timezone: input.timezone ?? null,
    quietStartMinute: input.quietStartMinute ?? null,
    quietEndMinute: input.quietEndMinute ?? null,
    smsHourlyLimit: input.smsHourlyLimit ?? null,
    updatedAt: now,
  };
  await db
    .insert(notificationPreference)
    .values(values)
    .onConflictDoUpdate({
      target: [
        notificationPreference.userId,
        notificationPreference.scopeKey,
        notificationPreference.templateKey,
      ],
      set: {
        notifyEmail: values.notifyEmail,
        notifySms: values.notifySms,
        timezone: values.timezone,
        quietStartMinute: values.quietStartMinute,
        quietEndMinute: values.quietEndMinute,
        smsHourlyLimit: values.smsHourlyLimit,
        updatedAt: values.updatedAt,
      },
    });
}

export async function saveDeliveryPreferences(
  userId: string,
  eventId: string,
  input: DeliveryPreferenceInput,
): Promise<NotificationPrefs> {
  const parsed = deliveryPreferenceInput.safeParse(input);
  if (!parsed.success) {
    throw invalid(
      'Some notification preferences need attention',
      Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message])),
    );
  }
  const value = parsed.data;
  const enablesSms =
    value.eventNotifySms === true ||
    Object.values(value.categories ?? {}).some((channels) => channels.notifySms === true);
  const account = enablesSms
    ? await getRecipientNotificationPrefs(userId, eventId)
    : null;
  if (account && (!account.phone || !account.phoneVerified)) {
    throw invalid('Verify a phone number before enabling text messages for this event', {
      phone: 'Request and enter the verification code first',
    });
  }
  if (
    value.timezone !== undefined ||
    value.quietStart !== undefined ||
    value.quietEnd !== undefined ||
    value.smsHourlyLimit !== undefined
  ) {
    const current = await getRecipientNotificationPrefs(userId, eventId);
    await upsertRule({
      userId,
      eventId: null,
      templateKey: '*',
      timezone: value.timezone !== undefined ? value.timezone : current.timezone,
      quietStartMinute: timeToMinute(value.quietStart !== undefined ? value.quietStart : current.quietStart),
      quietEndMinute: timeToMinute(value.quietEnd !== undefined ? value.quietEnd : current.quietEnd),
      smsHourlyLimit: value.smsHourlyLimit ?? current.smsHourlyLimit,
    });
  }
  if (value.eventNotifyEmail !== undefined || value.eventNotifySms !== undefined) {
    const current = await getRecipientNotificationPrefs(userId, eventId);
    await upsertRule({
      userId,
      eventId,
      templateKey: '*',
      notifyEmail: value.eventNotifyEmail !== undefined ? value.eventNotifyEmail : current.eventNotifyEmail,
      notifySms: value.eventNotifySms !== undefined ? value.eventNotifySms : current.eventNotifySms,
    });
  }
  for (const [key, channels] of Object.entries(value.categories ?? {})) {
    await upsertRule({
      userId,
      eventId,
      templateKey: key,
      notifyEmail: channels.notifyEmail,
      notifySms: channels.notifySms,
    });
  }
  // The preference rows land first; consent is the final authorization step. A partial failure can
  // therefore suppress a requested send, but can never authorize one whose preference was not saved.
  if (account?.phone) {
    await recordSmsConsent(account.phone, true, 'notification_preference');
  }
  return getRecipientNotificationPrefs(userId, eventId);
}

export type ResolvedDelivery = {
  notifyEmail: boolean;
  notifySms: boolean;
  timezone: string;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  smsHourlyLimit: number;
};

type Rule = typeof notificationPreference.$inferSelect;

/** Pure precedence function used by previews, sends and tests. */
export function resolveDeliveryRules(input: {
  baseEmail: boolean;
  baseSms: boolean;
  phoneVerified: boolean;
  participantTimezone?: string | null;
  eventId: string;
  templateKey: string;
  rules: Rule[];
}): ResolvedDelivery {
  const category = notificationCategory(input.templateKey);
  const ordered = [
    input.rules.find((row) => row.scopeKey === 'global' && row.templateKey === '*'),
    input.rules.find((row) => row.scopeKey === 'global' && row.templateKey === category),
    input.rules.find((row) => row.scopeKey === input.eventId && row.templateKey === '*'),
    input.rules.find((row) => row.scopeKey === input.eventId && row.templateKey === category),
  ].filter((row): row is Rule => Boolean(row));

  let resolved: ResolvedDelivery = {
    notifyEmail: input.baseEmail,
    notifySms: input.baseSms && input.phoneVerified,
    timezone: input.participantTimezone || 'UTC',
    quietStartMinute: null,
    quietEndMinute: null,
    smsHourlyLimit: 6,
  };
  for (const row of ordered) {
    resolved = {
      notifyEmail: row.notifyEmail ?? resolved.notifyEmail,
      notifySms: (row.notifySms ?? resolved.notifySms) && input.phoneVerified,
      timezone: row.timezone ?? resolved.timezone,
      quietStartMinute: row.quietStartMinute ?? resolved.quietStartMinute,
      quietEndMinute: row.quietEndMinute ?? resolved.quietEndMinute,
      smsHourlyLimit: row.smsHourlyLimit ?? resolved.smsHourlyLimit,
    };
  }
  return resolved;
}

export async function resolveRecipientDelivery(input: {
  userId: string;
  eventId: string;
  templateKey: string;
  baseEmail: boolean;
  baseSms: boolean;
  phoneVerified: boolean;
  participantTimezone?: string | null;
}): Promise<ResolvedDelivery> {
  const rules = await getDb()
    .select()
    .from(notificationPreference)
    .where(
      and(
        eq(notificationPreference.userId, input.userId),
        inArray(notificationPreference.scopeKey, ['global', input.eventId]),
      ),
    );
  return resolveDeliveryRules({ ...input, rules });
}

export function isQuietTime(delivery: ResolvedDelivery, now: Date): boolean {
  const { quietStartMinute: start, quietEndMinute: end } = delivery;
  if (start === null && end === null) return false;
  if (start === null || end === null) return true;
  if (start === end) return false;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: delivery.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return true;
  }
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return true;
  const local = hour * 60 + minute;
  return start < end ? local >= start && local < end : local >= start || local < end;
}

export async function maySendSmsNow(
  phone: string,
  delivery: ResolvedDelivery,
  now = new Date(),
): Promise<boolean> {
  if (!delivery.notifySms || isQuietTime(delivery, now)) return false;
  const recent = await getDb()
    .select({ id: smsLog.id })
    .from(smsLog)
    .where(
      and(
        eq(smsLog.toPhone, normalizePhoneNumber(phone)),
        // Carrier-accepted messages still consume the recipient's ceiling if the handset later
        // reports them undeliverable. Locally rejected attempts never reached a carrier and do not.
        inArray(smsLog.status, ['sent', 'delivered', 'undelivered']),
        gte(smsLog.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
      ),
    );
  return recent.length < delivery.smsHourlyLimit;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_ATTEMPTS = 5;

export function phoneChallengeUsable(
  challenge: Pick<
    typeof phoneVerificationChallenge.$inferSelect,
    'verifiedAt' | 'expiresAt' | 'attempts'
  >,
  now = new Date(),
): boolean {
  return (
    challenge.verifiedAt === null &&
    challenge.expiresAt.getTime() > now.getTime() &&
    challenge.attempts < OTP_ATTEMPTS
  );
}

function otpCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(value).padStart(6, '0');
}

export async function startPhoneVerification(
  userId: string,
  rawPhone: string,
): Promise<{ phone: string; mode: 'log' | 'twilio'; logCode?: string }> {
  const phone = normalizePhoneNumber(rawPhone);
  const now = new Date();
  const recent = await getDb()
    .select({ createdAt: phoneVerificationChallenge.createdAt })
    .from(phoneVerificationChallenge)
    .where(
      and(
        eq(phoneVerificationChallenge.userId, userId),
        gte(phoneVerificationChallenge.createdAt, new Date(now.getTime() - 60 * 60 * 1000)),
      ),
    );
  if (recent.some((row) => row.createdAt.getTime() > now.getTime() - 60 * 1000)) {
    throw invalid('Wait a minute before requesting another verification code');
  }
  if (recent.length >= 5) {
    throw invalid('Too many verification codes were requested. Try again in an hour.');
  }
  const code = otpCode();
  const deliveryTransport = activeSmsTransportName();
  await getDb().insert(phoneVerificationChallenge).values({
    userId,
    phone,
    codeHash: await hashToken(`${phone}:${code}`),
    deliveryTransport,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  });
  const sent = await sendPhoneVerificationCode({ to: phone, code });
  if (!sent.sent) throw invalid('The verification code could not be sent');
  return { phone, mode: sent.mode, ...(sent.logCode ? { logCode: sent.logCode } : {}) };
}

export async function confirmPhoneVerification(
  userId: string,
  rawPhone: string,
  code: string,
  now = new Date(),
): Promise<{ phone: string; verifiedAt: Date }> {
  const phone = normalizePhoneNumber(rawPhone);
  const challenge = await getDb().query.phoneVerificationChallenge.findFirst({
    where: and(
      eq(phoneVerificationChallenge.userId, userId),
      eq(phoneVerificationChallenge.phone, phone),
      isNull(phoneVerificationChallenge.verifiedAt),
    ),
    orderBy: [desc(phoneVerificationChallenge.createdAt)],
  });
  if (!challenge || !phoneChallengeUsable(challenge, now)) {
    throw invalid('That verification code has expired. Request a new one.');
  }
  const actual = await hashToken(`${phone}:${code.trim()}`);
  if (!timingSafeEqual(actual, challenge.codeHash)) {
    await getDb()
      .update(phoneVerificationChallenge)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(phoneVerificationChallenge.id, challenge.id));
    throw invalid('That verification code is not correct');
  }

  const account = await getDb().query.user.findFirst({
    where: eq(user.id, userId),
    columns: { phone: true },
  });
  if (!account) throw notFound('Your account');
  await blockSmsBeforePreferenceChange({
    previousPhone: account.phone,
    nextPhone: phone,
    nextEnabled: false,
    source: 'phone_verification',
  });
  await recordSmsConsent(phone, false, 'phone_verification');
  await getDb()
    .update(user)
    .set({
      phone,
      phoneVerifiedAt: now,
      phoneVerificationTransport: challenge.deliveryTransport,
      notifySms: false,
      updatedAt: now,
    })
    .where(eq(user.id, userId));
  await getDb()
    .update(phoneVerificationChallenge)
    .set({ verifiedAt: now })
    .where(eq(phoneVerificationChallenge.id, challenge.id));
  return { phone, verifiedAt: now };
}

const UNSUBSCRIBE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function unsubscribeTokenUsable(
  record: Pick<typeof unsubscribeToken.$inferSelect, 'usedAt' | 'expiresAt'>,
  now = new Date(),
): boolean {
  return record.usedAt === null && record.expiresAt.getTime() > now.getTime();
}

export function unsubscribePreferenceScope(
  record: Pick<typeof unsubscribeToken.$inferSelect, 'userId' | 'eventId' | 'templateKey'>,
) {
  return {
    userId: record.userId,
    eventId: record.eventId,
    templateKey: notificationCategory(record.templateKey),
    notifyEmail: false as const,
  };
}

export async function mintUnsubscribeLink(
  userId: string,
  eventId: string,
  templateKey: string,
): Promise<string> {
  const token = randomToken();
  await getDb().insert(unsubscribeToken).values({
    tokenHash: await hashToken(token),
    userId,
    eventId,
    templateKey: notificationCategory(templateKey),
    expiresAt: new Date(Date.now() + UNSUBSCRIBE_TTL_MS),
  });
  return `${appUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function appendUnsubscribeLink(
  content: { html: string; text: string },
  link: string,
): { html: string; text: string } {
  return {
    html: `${content.html}<p style="font-size:12px;color:#6A6255"><a href="${link}">Unsubscribe from this kind of email</a></p>`,
    text: `${content.text}\n\nUnsubscribe from this kind of email: ${link}`,
  };
}

/** Applies the recipient's rule and adds a scoped link to event mail sent to a Cicero account. */
export async function prepareEventMail(input: {
  to: string;
  eventId?: string | null;
  templateKey?: string | null;
  html: string;
  text: string;
}): Promise<{ html: string; text: string; allowed: boolean }> {
  if (!input.eventId || !input.templateKey || input.templateKey === 'auth.magic_link') {
    return { html: input.html, text: input.text, allowed: true };
  }
  const account = await getDb().query.user.findFirst({
    where: eq(user.email, input.to.trim().toLowerCase()),
    columns: { id: true, notifyEmail: true },
  });
  if (!account) return { html: input.html, text: input.text, allowed: true };
  const delivery = await resolveRecipientDelivery({
    userId: account.id,
    eventId: input.eventId,
    templateKey: input.templateKey,
    baseEmail: account.notifyEmail,
    baseSms: false,
    phoneVerified: false,
  });
  if (!delivery.notifyEmail) return { html: input.html, text: input.text, allowed: false };
  const link = await mintUnsubscribeLink(account.id, input.eventId, input.templateKey);
  return { ...appendUnsubscribeLink(input, link), allowed: true };
}

async function unsubscribeRecord(rawToken: string) {
  const tokenHash = await hashToken(rawToken);
  return getDb().query.unsubscribeToken.findFirst({ where: eq(unsubscribeToken.tokenHash, tokenHash) });
}

export async function inspectUnsubscribeToken(rawToken: string, now = new Date()) {
  const record = await unsubscribeRecord(rawToken);
  if (!record || !unsubscribeTokenUsable(record, now)) throw invalid('That unsubscribe link has expired');
  const eventRow = await getDb().query.event.findFirst({
    where: eq(event.id, record.eventId),
    columns: { name: true },
  });
  if (!eventRow) throw notFound('That event');
  const category = notificationCategory(record.templateKey);
  return { eventName: eventRow.name, category, categoryLabel: NOTIFICATION_CATEGORY_LABELS[category] };
}

export async function consumeUnsubscribeToken(rawToken: string, now = new Date()) {
  const record = await unsubscribeRecord(rawToken);
  if (!record || !unsubscribeTokenUsable(record, now)) throw invalid('That unsubscribe link has expired');
  const scope = unsubscribePreferenceScope(record);
  await upsertRule({
    ...scope,
  });
  const [used] = await getDb()
    .update(unsubscribeToken)
    .set({ usedAt: now })
    .where(and(eq(unsubscribeToken.id, record.id), isNull(unsubscribeToken.usedAt)))
    .returning({ id: unsubscribeToken.id });
  if (!used) throw invalid('That unsubscribe link has already been used');
  return { category: notificationCategory(record.templateKey), eventId: record.eventId };
}
