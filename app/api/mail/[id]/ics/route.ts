import { getMailEntry } from '@/lib/services/comms';
import { icsFilename } from '@/lib/ics';
import { isUuid } from '@/lib/identifiers';

/**
 * Downloads the calendar body attached to one logged message. `MAIL_TRANSPORT=log` is the default,
 * so on the demo deployment this is the only place the `.ics` a speaker would have received is
 * actually reachable — part of what makes `/organizer/mail` satisfy `T-7a`.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const missing = 'That message carried no calendar invitation.';
  // The id names a `uuid` column, so anything else is a 404 the driver would otherwise turn into a
  // 500 on the way to reporting the same thing.
  if (!isUuid(id)) return new Response(missing, { status: 404 });

  let entry: Awaited<ReturnType<typeof getMailEntry>>;
  try {
    entry = await getMailEntry(id);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return new Response('That message could not be read right now. Try again shortly.', {
      status: 503,
      headers: { 'retry-after': '30' },
    });
  }

  if (!entry?.icsBody) {
    return new Response(missing, { status: 404 });
  }

  return new Response(entry.icsBody, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${icsFilename(entry.subject)}"`,
      'cache-control': 'no-store',
    },
  });
}
