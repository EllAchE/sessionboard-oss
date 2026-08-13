import { completeSimpleTask } from '@/lib/services/tasks';
import { PRIVATE_CACHE, handle, json } from '../../../../../../_lib/respond';
import { speakerApiSession } from '../../../../../../_lib/speaker';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; assignmentId: string }> },
) {
  return handle(async () => {
    const { slug, assignmentId } = await context.params;
    const { ctx, me } = await speakerApiSession(request, slug);
    const status = await completeSimpleTask(ctx, me.id, assignmentId);
    return json({ data: { assignmentId, status } }, { headers: PRIVATE_CACHE });
  });
}
