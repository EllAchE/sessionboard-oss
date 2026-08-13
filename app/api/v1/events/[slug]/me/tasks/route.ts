import { listPortalTasks } from '@/lib/services/tasks';
import { PRIVATE_CACHE, handle, json } from '../../../../_lib/respond';
import { speakerApiSession, speakerTaskPayload } from '../../../../_lib/speaker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const { ctx, me } = await speakerApiSession(request, slug);
    const data = (await listPortalTasks(ctx.eventId, me.id)).map(speakerTaskPayload);
    return json({ data, total: data.length }, { headers: PRIVATE_CACHE });
  });
}
