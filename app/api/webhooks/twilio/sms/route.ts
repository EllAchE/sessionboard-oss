import { env } from '@/lib/env';
import { InvalidPhoneNumberError } from '@/lib/phone';
import {
  handleInboundSms,
  isAuthenticTwilioRequest,
  twimlMessage,
} from '@/lib/sms/twilio-webhooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!env('TWILIO_AUTH_TOKEN')) return new Response('Twilio is not configured', { status: 503 });

  // Parsing comes after the configuration check and inside a guard on purpose. This endpoint is
  // unauthenticated by construction — the signature check needs the parsed body — so anything on
  // the internet can POST it an empty or malformed request. Letting `formData()` throw returns a
  // 500, and a 500 is the one answer Twilio retries, so a scanner that cannot even form a request
  // would earn itself a retry schedule. 400 is both the truth and terminal.
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
    const keyword = await handleInboundSms(params);
    // Advanced Opt-Out already sent Twilio's configured reply. Sending another is both noisy and
    // billable, so only plain HELP receives Cicero's minimal TwiML response.
    if (keyword === 'HELP' && !params.get('OptOutType')) {
      return twimlMessage('Cicero alerts. Reply STOP to opt out or START to resume.');
    }
    return twimlMessage();
  } catch (error) {
    // A malformed From value must not turn into a retry storm. It was authenticated, but cannot be
    // associated with a compliant destination.
    if (error instanceof InvalidPhoneNumberError) {
      return new Response('Invalid phone number', { status: 400 });
    }
    throw error;
  }
}
