import { isUuid } from '@/lib/identifiers';
import { sessionCalendarDownload } from '@/lib/services/comms';

/**
 * `C-3a`. The plain add-to-calendar download, unauthenticated because it is linked from emails and
 * from the public agenda — the body contains only what is already published about the session.
 *
 * `METHOD:PUBLISH` with no ATTENDEE lines, which is what makes a client file it rather than try to
 * RSVP. The push invitation (`C-3`) is a different body, built by the same module.
 */
export const dynamic = 'force-dynamic';

const MISSING = 'That session has no confirmed time yet.';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  // A mail client that truncated the link, or a crawler walking the path space, hands us something
  // that is not a UUID. That is a 404, not a database error — the `uuid` column would reject it at
  // the driver and the throw would escape this handler as a 500.
  if (!isUuid(sessionId)) {
    return new Response(MISSING, { status: 404 });
  }

  let calendar: Awaited<ReturnType<typeof sessionCalendarDownload>>;
  try {
    calendar = await sessionCalendarDownload(sessionId);
  } catch (error) {
    // This link lives in an email forever. When the read fails, say so in a way a calendar client
    // will retry rather than cache.
    console.error(error instanceof Error ? error.message : String(error));
    return new Response('The calendar file could not be built right now. Try again shortly.', {
      status: 503,
      headers: { 'retry-after': '30' },
    });
  }

  if (!calendar) {
    return new Response(MISSING, { status: 404 });
  }

  return new Response(calendar.body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="${calendar.filename}"`,
      'cache-control': 'no-store',
    },
  });
}
