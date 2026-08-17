import { env } from '@/lib/env';
import {
  isAuthenticTwilioRequest,
  recordTwilioDeliveryStatus,
} from '@/lib/sms/twilio-webhooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!env('TWILIO_AUTH_TOKEN')) return new Response('Twilio is not configured', { status: 503 });

  // See the inbound SMS webhook: an unparseable body is a 400, never a 500, because Twilio retries
  // 5xx and the request will never become parseable on the second attempt.
  let params: FormData;
  try {
    params = await request.formData();
  } catch {
    return new Response('Expected a Twilio form-encoded body', { status: 400 });
  }

  if (!(await isAuthenticTwilioRequest(request, params))) {
    return new Response('Invalid Twilio signature', { status: 401 });
  }

  try {
    await recordTwilioDeliveryStatus(params);
  } catch (error) {
    // A delivery receipt is advisory: the message was already sent. Dropping one is strictly better
    // than a 500 that makes Twilio redeliver every receipt while the database is the thing at fault.
    console.error(error instanceof Error ? error.message : String(error));
  }
  return new Response(null, { status: 200 });
}
