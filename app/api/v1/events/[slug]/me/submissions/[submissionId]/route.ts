import { recordRevision } from '@/lib/services/content';
import { getMySubmission, updateMySubmission } from '@/lib/services/portal';
import { PRIVATE_CACHE, handle, json, parseBody } from '../../../../../_lib/respond';
import { updateMySubmissionBody } from '../../../../../_lib/schemas';
import { mySubmissionPayload, speakerApiSession } from '../../../../../_lib/speaker';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; submissionId: string }> },
) {
  return handle(async () => {
    const { slug, submissionId } = await context.params;
    const { me } = await speakerApiSession(request, slug);
    return json(
      { data: mySubmissionPayload(await getMySubmission(me.id, submissionId)) },
      { headers: PRIVATE_CACHE },
    );
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string; submissionId: string }> },
) {
  return handle(async () => {
    const { slug, submissionId } = await context.params;
    const body = await parseBody(updateMySubmissionBody, request);
    const { ctx, me } = await speakerApiSession(request, slug);

    await getMySubmission(me.id, submissionId);
    await recordRevision(ctx, 'session', submissionId, 'Edited the session content through the API');
    await updateMySubmission(ctx, me.id, submissionId, body);
    return json(
      { data: mySubmissionPayload(await getMySubmission(me.id, submissionId)) },
      { headers: PRIVATE_CACHE },
    );
  });
}
