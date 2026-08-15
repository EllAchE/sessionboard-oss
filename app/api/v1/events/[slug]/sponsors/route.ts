import { listApiSponsors, requireEvent } from '../../../_lib/queries';
import { PRIVATE_CACHE, handle, json, parseQuery } from '../../../_lib/respond';
import { sponsorListQuery } from '../../../_lib/schemas';
import { enforcePublicApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    await enforcePublicApiRateLimit(request);
    const { slug } = await context.params;
    const filters = parseQuery(sponsorListQuery, new URL(request.url));
    const event = await requireEvent(slug);
    // Publication is revocable without changing this URL, so a shared cache could expose a draft.
    return json(await listApiSponsors(event, filters), { headers: PRIVATE_CACHE });
  });
}
