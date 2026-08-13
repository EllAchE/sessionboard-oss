import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  consent: [] as Array<{ phone: string; optedIn: boolean }>,
  deliveryPatch: null as Record<string, unknown> | null,
  deliverySid: null as string | null,
}));

vi.mock('./consent', () => ({
  applyInboundSmsPreference: vi.fn(async (phone: string, optedIn: boolean) => {
    state.consent.push({ phone, optedIn });
  }),
}));

vi.mock('../../db/client', () => ({
  getDb: () => ({
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.deliveryPatch = patch;
            state.deliverySid = 'SM-known';
            return [{ id: 'sms-1' }];
          },
        }),
      }),
    }),
  }),
}));

import {
  handleInboundSms,
  inboundKeyword,
  isAuthenticTwilioRequest,
  recordTwilioDeliveryStatus,
  twilioRequestSignature,
} from './twilio-webhooks';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  state.consent = [];
  state.deliveryPatch = null;
  state.deliverySid = null;
});

afterEach(() => vi.unstubAllEnvs());

describe('Twilio request signatures', () => {
  it('matches Twilio’s published HMAC-SHA1 test vector', async () => {
    const signature = await twilioRequestSignature(
      'https://example.com/myapp.php?foo=1&bar=2',
      [
        ['CallSid', 'CA1234567890ABCDE'],
        ['Caller', '+14158675310'],
        ['Digits', '1234'],
        ['From', '+14158675310'],
        ['To', '+18005551212'],
      ],
      '12345',
    );
    expect(signature).toBe('L/OH5YylLD5NRKLltdqwSvS0BnU=');
  });

  it('accepts the configured public URL and refuses a changed signature', async () => {
    vi.stubEnv('APP_URL', 'https://cicero.example');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-token');
    const params = form({ From: '+14158675310', Body: 'STOP' });
    const signature = await twilioRequestSignature(
      'https://cicero.example/api/webhooks/twilio/sms',
      [
        ['From', '+14158675310'],
        ['Body', 'STOP'],
      ],
      'test-token',
    );
    const request = new Request('http://internal-worker/api/webhooks/twilio/sms', {
      method: 'POST',
      headers: { 'x-twilio-signature': signature },
    });
    expect(await isAuthenticTwilioRequest(request, params)).toBe(true);

    const forged = new Request(request.url, {
      method: 'POST',
      headers: { 'x-twilio-signature': `${signature.slice(0, -1)}x` },
    });
    expect(await isAuthenticTwilioRequest(forged, params)).toBe(false);
  });
});

describe('inbound opt-out handling', () => {
  it('uses Advanced Opt-Out’s explicit type and disables the normalized destination', async () => {
    const data = form({ OptOutType: 'STOP', Body: 'anything', From: '+1 (415) 867-5310' });
    expect(inboundKeyword(data)).toBe('STOP');
    await handleInboundSms(data);
    expect(state.consent).toEqual([{ phone: '+14158675310', optedIn: false }]);
  });

  it.each(['stop', 'STOPALL', 'Unsubscribe', 'cancel', 'end', 'quit'])(
    'recognizes the standard opt-out keyword %s without Advanced Opt-Out',
    (body) => expect(inboundKeyword(form({ Body: body }))).toBe('STOP'),
  );

  it('recognizes HELP without changing consent', async () => {
    const data = form({ Body: 'help', From: '+14158675310' });
    expect(await handleInboundSms(data)).toBe('HELP');
    expect(state.consent).toEqual([]);
  });
});

describe('delivery callbacks', () => {
  it('records carrier delivery and clears any acceptance error', async () => {
    expect(
      await recordTwilioDeliveryStatus(
        form({ MessageSid: 'SM-known', MessageStatus: 'delivered' }),
      ),
    ).toBe(true);
    expect(state.deliveryPatch).toMatchObject({ status: 'delivered', error: null });
  });

  it('records carrier rejection details', async () => {
    await recordTwilioDeliveryStatus(
      form({
        MessageSid: 'SM-known',
        MessageStatus: 'undelivered',
        ErrorCode: '30003',
        ChannelStatusMessage: 'Unreachable destination handset',
      }),
    );
    expect(state.deliveryPatch).toMatchObject({
      status: 'undelivered',
      error: 'Twilio 30003: Unreachable destination handset',
    });
  });

  it('ignores non-final callbacks so late network delivery cannot regress', async () => {
    expect(
      await recordTwilioDeliveryStatus(form({ MessageSid: 'SM-known', MessageStatus: 'sent' })),
    ).toBe(false);
    expect(state.deliveryPatch).toBeNull();
  });
});
