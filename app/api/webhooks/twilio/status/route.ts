import { env } from '@/lib/env';
import {
  isAuthenticTwilioRequest,
  recordTwilioDeliveryStatus,
} from '@/lib/sms/twilio-webhooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await request.formData();
  if (!env('TWILIO_AUTH_TOKEN')) return new Response('Twilio is not configured', { status: 503 });
  if (!(await isAuthenticTwilioRequest(request, params))) {
    return new Response('Invalid Twilio signature', { status: 401 });
  }
  await recordTwilioDeliveryStatus(params);
  return new Response(null, { status: 200 });
}
