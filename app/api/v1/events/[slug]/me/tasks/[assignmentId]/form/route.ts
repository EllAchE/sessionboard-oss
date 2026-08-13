import { saveTaskForm } from '@/lib/services/tasks';
import { PRIVATE_CACHE, handle, json, parseBody } from '../../../../../../_lib/respond';
import { taskFormBody } from '../../../../../../_lib/schemas';
import { speakerApiSession } from '../../../../../../_lib/speaker';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string; assignmentId: string }> },
) {
  return handle(async () => {
    const { slug, assignmentId } = await context.params;
    const body = await parseBody(taskFormBody, request);
    const { ctx, me } = await speakerApiSession(request, slug);
    const status = await saveTaskForm(ctx, me.id, assignmentId, body.answers, body.submit);
    return json({ data: { assignmentId, status } }, { headers: PRIVATE_CACHE });
  });
}
