import { groupByDay, listSessions, requireEvent, toEventPayload } from '../../../_lib/queries';
import { PUBLIC_CACHE, handle, json } from '../../../_lib/respond';
import { enforcePublicApiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    await enforcePublicApiRateLimit(request);
    const { slug } = await context.params;
    const event = await requireEvent(slug);
    const sessions = await listSessions(
      event.id,
      { status: 'published' },
      { paginate: false },
    );
    const { days, unscheduled } = groupByDay(sessions.data, event.timezone);

    return json({ event: toEventPayload(event), days, unscheduled }, { headers: PUBLIC_CACHE });
  });
}
