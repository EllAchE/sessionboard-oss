import { requireApiKey } from '../../../_lib/auth';
import { listSubmissions } from '../../../_lib/queries';
import { PRIVATE_CACHE, handle, json, parseQuery } from '../../../_lib/respond';
import { submissionListQuery } from '../../../_lib/schemas';

export const dynamic = 'force-dynamic';

/** Key-scoped: submissions carry submitter emails and pre-decision status, so no public read. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const filters = parseQuery(submissionListQuery, new URL(request.url));
    const key = await requireApiKey(request, slug);
    const data = await listSubmissions(key.eventId, filters);
    return json({ data, total: data.length }, { headers: PRIVATE_CACHE });
  });
}
