import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { smsLog } from '../../db/schema';
import { appUrl, env } from '../env';
import { timingSafeEqual } from '../ids';
import { normalizePhoneNumber } from '../phone';
import { applyInboundSmsPreference } from './consent';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function signedUrl(request: Request): string {
  const received = new URL(request.url);
  return `${appUrl()}${received.pathname}${received.search}`;
}

/** Twilio signs the exact public URL followed by every form key/value in ordinal key order. */
export async function twilioRequestSignature(
  url: string,
  params: ReadonlyArray<readonly [string, string]>,
  authToken: string,
): Promise<string> {
  // Twilio specifies Unix-style case-sensitive ordering, not locale collation.
  const sorted = [...params].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const payload = sorted.reduce((value, [key, entry]) => `${value}${key}${entry}`, url);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToBase64(new Uint8Array(digest));
}

export async function isAuthenticTwilioRequest(
  request: Request,
  params: FormData,
): Promise<boolean> {
  const provided = request.headers.get('x-twilio-signature');
  const authToken = env('TWILIO_AUTH_TOKEN');
  if (!provided || !authToken) return false;

  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (typeof value === 'string') entries.push([key, value]);
  });
  const expected = await twilioRequestSignature(signedUrl(request), entries, authToken);
  return timingSafeEqual(provided, expected);
}

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'UNSTOP', 'YES']);
const HELP_WORDS = new Set(['HELP', 'INFO']);

export type InboundKeyword = 'STOP' | 'START' | 'HELP' | null;

export function inboundKeyword(params: FormData): InboundKeyword {
  const advanced = String(params.get('OptOutType') ?? '').trim().toUpperCase();
  if (advanced === 'STOP' || advanced === 'START' || advanced === 'HELP') return advanced;
  const body = String(params.get('Body') ?? '').trim().toUpperCase();
  if (STOP_WORDS.has(body)) return 'STOP';
  if (START_WORDS.has(body)) return 'START';
  if (HELP_WORDS.has(body)) return 'HELP';
  return null;
}

export async function handleInboundSms(params: FormData): Promise<InboundKeyword> {
  const keyword = inboundKeyword(params);
  if (keyword !== 'STOP' && keyword !== 'START') return keyword;
  const from = normalizePhoneNumber(String(params.get('From') ?? ''));
  await applyInboundSmsPreference(from, keyword === 'START');
  return keyword;
}

const FINAL_STATUS = new Set(['delivered', 'undelivered', 'failed']);

/** Only final states are persisted, so late `sent` callbacks cannot regress `delivered`. */
export async function recordTwilioDeliveryStatus(params: FormData): Promise<boolean> {
  const messageSid = String(params.get('MessageSid') ?? params.get('SmsSid') ?? '').trim();
  const status = String(params.get('MessageStatus') ?? params.get('SmsStatus') ?? '')
    .trim()
    .toLowerCase();
  if (!messageSid || !FINAL_STATUS.has(status)) return false;

  const errorCode = String(params.get('ErrorCode') ?? '').trim();
  const errorMessage = String(params.get('ChannelStatusMessage') ?? '').trim();
  const error = status === 'delivered'
    ? null
    : [errorCode ? `Twilio ${errorCode}` : 'Twilio delivery failed', errorMessage]
        .filter(Boolean)
        .join(': ');

  const updated = await getDb()
    .update(smsLog)
    .set({
      status: status as 'delivered' | 'undelivered' | 'failed',
      error,
      statusUpdatedAt: new Date(),
    })
    .where(eq(smsLog.providerMessageId, messageSid))
    .returning({ id: smsLog.id });
  return updated.length > 0;
}

export function twimlMessage(body?: string): Response {
  const escaped = body
    ?.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const xml = escaped
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  return new Response(xml, { status: 200, headers: { 'content-type': 'text/xml; charset=utf-8' } });
}
