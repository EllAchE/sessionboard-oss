import { listSessions, requireEvent } from '../../../_lib/queries';
import { PUBLIC_CACHE, handle, json, parseQuery } from '../../../_lib/respond';
import { sessionListQuery } from '../../../_lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const filters = parseQuery(sessionListQuery, new URL(request.url));
    const event = await requireEvent(slug);
    const data = await listSessions(event.id, filters);
    return json({ data, total: data.length }, { headers: PUBLIC_CACHE });
  });
}
