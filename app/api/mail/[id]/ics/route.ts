import { getMailEntry } from '@/lib/services/comms';
import { icsFilename } from '@/lib/ics';

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
  const entry = await getMailEntry(id);
  if (!entry?.icsBody) {
    return new Response('That message carried no calendar invitation.', { status: 404 });
  }

  return new Response(entry.icsBody, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${icsFilename(entry.subject)}"`,
      'cache-control': 'no-store',
    },
  });
}
