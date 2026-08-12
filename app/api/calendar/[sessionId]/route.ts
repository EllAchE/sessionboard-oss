import { sessionCalendarDownload } from '@/lib/services/comms';

/**
 * `C-3a`. The plain add-to-calendar download, unauthenticated because it is linked from emails and
 * from the public agenda — the body contains only what is already published about the session.
 *
 * `METHOD:PUBLISH` with no ATTENDEE lines, which is what makes a client file it rather than try to
 * RSVP. The push invitation (`C-3`) is a different body, built by the same module.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  const calendar = await sessionCalendarDownload(sessionId);
  if (!calendar) {
    return new Response('That session has no confirmed time yet.', { status: 404 });
  }

  return new Response(calendar.body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${calendar.filename}"`,
      'cache-control': 'no-store',
    },
  });
}
