import { listSpeakers, requireEvent } from '../../../_lib/queries';
import { PUBLIC_CACHE, handle, json, parseQuery } from '../../../_lib/respond';
import { speakerListQuery } from '../../../_lib/schemas';
import { enforcePublicApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    await enforcePublicApiRateLimit(request);
    const { slug } = await context.params;
    const filters = parseQuery(speakerListQuery, new URL(request.url));
    const event = await requireEvent(slug);
    const result = await listSpeakers(event, filters);
    return json(result, { headers: PUBLIC_CACHE });
  });
}
