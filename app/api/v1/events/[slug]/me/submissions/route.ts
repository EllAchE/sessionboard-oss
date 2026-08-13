import { listMySubmissions } from '@/lib/services/portal';
import { PRIVATE_CACHE, handle, json } from '../../../../_lib/respond';
import { mySubmissionPayload, speakerApiSession } from '../../../../_lib/speaker';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const { me } = await speakerApiSession(request, slug);
    const data = (await listMySubmissions(me.id)).map(mySubmissionPayload);
    return json({ data, total: data.length }, { headers: PRIVATE_CACHE });
  });
}
