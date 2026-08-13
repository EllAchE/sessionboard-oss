import { listOpenCalls } from '@/lib/services/submissions';
import { requireEvent } from '../../../_lib/queries';
import { PUBLIC_CACHE, handle, isoOrNull, json } from '../../../_lib/respond';
import { enforcePublicApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Public discovery only: closed and draft CFPs are deliberately absent. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    await enforcePublicApiRateLimit(request);
    const { slug } = await context.params;
    const event = await requireEvent(slug);
    const calls = await listOpenCalls(event.id);
    /**
     * `F-9`, the same way `/forms/{formId}` does it: `name` is the title a submitter is meant to
     * see, which is the organizer's external title when they set one and the internal name until
     * they do. Identical for every form that has no external title, and the raw field ships beside
     * it.
     */
    const data = calls.map((call) => ({
      slug: call.slug,
      name: call.externalTitle,
      externalTitle: call.externalTitle,
      closesAt: isoOrNull(call.closesAt),
    }));
    return json({ data, total: data.length }, { headers: PUBLIC_CACHE });
  });
}
