import { groupByDay, listSessions, requireEvent, toEventPayload } from '../../../_lib/queries';
import { PUBLIC_CACHE, handle, json } from '../../../_lib/respond';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const event = await requireEvent(slug);
    const sessions = await listSessions(event.id, { status: 'published' });
    const { days, unscheduled } = groupByDay(sessions, event.timezone);

    return json({ event: toEventPayload(event), days, unscheduled }, { headers: PUBLIC_CACHE });
  });
}
