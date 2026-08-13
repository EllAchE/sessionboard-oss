import { requireApiKey } from '@/app/api/v1/_lib/auth';
import { handle, json, parseBody, PRIVATE_CACHE } from '@/app/api/v1/_lib/respond';
import { programReconcileBody } from '@/app/api/v1/_lib/schemas';
import { reconcileProgram } from '@/lib/services/program-reconcile';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const key = await requireApiKey(request, slug, 'write');
    const input = await parseBody(programReconcileBody, request);
    const data = await reconcileProgram(key.eventId, input);
    return json({ data }, { headers: PRIVATE_CACHE });
  });
}
