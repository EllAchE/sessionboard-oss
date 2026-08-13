import { requireApiKey } from '../../../../../_lib/auth';
import { acceleventsProgramSyncBody } from '../../../../../_lib/schemas';
import { PRIVATE_CACHE, handle, json, parseBody } from '../../../../../_lib/respond';
import { reconcilePublishedProgram } from '@/lib/accelevents';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const key = await requireApiKey(request, slug, 'write');
    const input = await parseBody(acceleventsProgramSyncBody, request);
    const summary = await reconcilePublishedProgram(key.eventId, input);
    return json(summary, { headers: PRIVATE_CACHE });
  });
}
