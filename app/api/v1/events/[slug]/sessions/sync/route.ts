import { invalid } from '@/lib/errors';
import {
  parseSessionSyncCsv,
  sessionSyncJsonBodySchema,
  syncPublishedSessions,
} from '@/lib/services/session-sync';
import { requireApiKey } from '../../../../_lib/auth';
import { handle, json, parseBody, parseQuery, PRIVATE_CACHE } from '../../../../_lib/respond';
import { sessionSyncQuery } from '../../../../_lib/schemas';

export const dynamic = 'force-dynamic';

const CSV_CONTENT_TYPES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']);

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await context.params;
    const key = await requireApiKey(request, slug);
    const query = parseQuery(sessionSyncQuery, new URL(request.url));
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

    const rows = CSV_CONTENT_TYPES.has(contentType ?? '')
      ? parseSessionSyncCsv(await request.text())
      : contentType === 'application/json'
        ? (await parseBody(sessionSyncJsonBodySchema, request)).rows
        : undefined;
    if (!rows) throw invalid('Send the agenda as text/csv or application/json');

    const result = await syncPublishedSessions(key.eventId, rows, {
      dryRun: query.dryRun !== 'false',
    });
    return json(result, { headers: PRIVATE_CACHE });
  });
}
