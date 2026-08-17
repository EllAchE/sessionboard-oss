import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env, handleInboundSms, isAuthenticTwilioRequest, recordTwilioDeliveryStatus } = vi.hoisted(
  () => ({
    env: vi.fn(),
    handleInboundSms: vi.fn(),
    isAuthenticTwilioRequest: vi.fn(),
    recordTwilioDeliveryStatus: vi.fn(),
  }),
);

vi.mock('@/lib/env', () => ({ env }));
vi.mock('@/lib/sms/twilio-webhooks', () => ({
  handleInboundSms,
  isAuthenticTwilioRequest,
  recordTwilioDeliveryStatus,
  twimlMessage: (body?: string) => new Response(body ?? '', { status: 200 }),
}));

import { POST as inbound } from './sms/route';
import { POST as status } from './status/route';

/** A body that announces form encoding and then is not form encoding. */
function malformed(): Request {
  return new Request('https://example.test/api/webhooks/twilio', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=----nope' },
    body: 'not actually multipart',
  });
}

function signed(fields: Record<string, string>): Request {
  return new Request('https://example.test/api/webhooks/twilio', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

describe('Twilio webhooks never answer a bad request with a retryable status', () => {
  beforeEach(() => {
    env.mockReset().mockReturnValue('a-token');
    isAuthenticTwilioRequest.mockReset().mockResolvedValue(true);
    handleInboundSms.mockReset().mockResolvedValue(undefined);
    recordTwilioDeliveryStatus.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  // Twilio retries 5xx. An unparseable body will not parse on the second attempt either, so a 5xx
  // here buys nothing and costs a retry schedule — from an endpoint anyone on the internet can POST.
  it.each([
    ['inbound sms', inbound],
    ['delivery status', status],
  ])('answers 400, not 5xx, when %s receives an unparseable body', async (_label, handler) => {
    const response = await handler(malformed());

    expect(response.status).toBe(400);
  });

  it('checks configuration before parsing anything', async () => {
    env.mockReturnValue(undefined);

    expect((await inbound(malformed())).status).toBe(503);
  });

  it('still rejects an unsigned request', async () => {
    isAuthenticTwilioRequest.mockResolvedValue(false);

    expect((await inbound(signed({ From: '+15005550006', Body: 'HELP' }))).status).toBe(401);
  });

  // The message was already sent; the receipt is advisory. Failing it would make Twilio redeliver
  // every receipt for as long as the database is unwell.
  it('acknowledges a delivery receipt it could not record', async () => {
    recordTwilioDeliveryStatus.mockRejectedValue(new Error('connection terminated'));

    const response = await status(signed({ MessageStatus: 'delivered' }));

    expect(response.status).toBe(200);
  });
});
