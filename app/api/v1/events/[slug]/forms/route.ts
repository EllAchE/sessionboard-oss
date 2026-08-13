import { listOpenCalls } from '@/lib/services/submissions';
import { requireEvent } from '../../../_lib/queries';
import { PUBLIC_CACHE, handle, isoOrNull, json } from '../../../_lib/respond';

export const dynamic = 'force-dynamic';

/** Public discovery only: closed and draft CFPs are deliberately absent. */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const event = await requireEvent(slug);
    const calls = await listOpenCalls(event.id);
    const data = calls.map((call) => ({ ...call, closesAt: isoOrNull(call.closesAt) }));
    return json({ data, total: data.length }, { headers: PUBLIC_CACHE });
  });
}
