import { PUBLIC_CACHE, handle, json } from '../../_lib/respond';
import { requireEvent, toEventPayload } from '../../_lib/queries';
import { enforcePublicApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    await enforcePublicApiRateLimit(request);
    const { slug } = await context.params;
    const event = await requireEvent(slug);
    return json(toEventPayload(event), { headers: PUBLIC_CACHE });
  });
}
