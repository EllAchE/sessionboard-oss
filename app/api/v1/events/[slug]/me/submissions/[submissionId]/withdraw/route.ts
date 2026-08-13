import { getMySubmission, withdrawSubmission } from '@/lib/services/portal';
import { PRIVATE_CACHE, handle, json } from '../../../../../../_lib/respond';
import { mySubmissionPayload, speakerApiSession } from '../../../../../../_lib/speaker';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; submissionId: string }> },
) {
  return handle(async () => {
    const { slug, submissionId } = await context.params;
    const { ctx, me } = await speakerApiSession(request, slug);
    await withdrawSubmission(ctx, me.id, submissionId);
    return json(
      { data: mySubmissionPayload(await getMySubmission(me.id, submissionId)) },
      { headers: PRIVATE_CACHE },
    );
  });
}
