import { z } from 'zod';
import { requireCurrentActor } from '@/lib/auth';
import {
  confirmPhoneVerification,
  startPhoneVerification,
} from '@/lib/services/notification-preferences';
import { handle, json, parseBody } from '../../v1/_lib/respond';

export const dynamic = 'force-dynamic';

const startBody = z.object({ phone: z.string().min(1).max(40) });
const confirmBody = startBody.extend({ code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  return handle(async () => {
    const [actor, body] = await Promise.all([requireCurrentActor(), parseBody(startBody, request)]);
    return json({ data: await startPhoneVerification(actor.userId, body.phone) });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const [actor, body] = await Promise.all([
      requireCurrentActor(),
      parseBody(confirmBody, request),
    ]);
    const verified = await confirmPhoneVerification(actor.userId, body.phone, body.code);
    return json({ data: { phone: verified.phone, verifiedAt: verified.verifiedAt.toISOString() } });
  });
}
