import { listSpeakers, requireEvent } from '../../../_lib/queries';
import { PUBLIC_CACHE, handle, json } from '../../../_lib/respond';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const event = await requireEvent(slug);
    const data = await listSpeakers(event.id);
    return json({ data, total: data.length }, { headers: PUBLIC_CACHE });
  });
}
