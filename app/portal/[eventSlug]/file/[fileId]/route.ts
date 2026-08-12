import { NextResponse } from 'next/server';
import { requireEventContext } from '@/lib/auth';
import { httpStatus, toPublicError } from '@/lib/errors';
import { getEventBySlug } from '@/lib/services/portal';
import { readFile } from '@/lib/services/files';
import { notFound } from '@/lib/errors';

/**
 * Every portal file — headshot, logo, slide deck — is served through here rather than from a public
 * bucket URL, so a leaked object key is worth nothing without a role on the event. `readFile`
 * re-checks the event id against the row, so a file id from one event cannot be read through
 * another event's path.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventSlug: string; fileId: string }> },
) {
  try {
    const { eventSlug, fileId } = await params;
    const event = await getEventBySlug(eventSlug);
    if (!event) throw notFound('That event');

    const ctx = await requireEventContext(event.id);
    const { record, body, contentType } = await readFile(ctx, fileId);

    const download = new URL(request.url).searchParams.has('download');
    const disposition = download ? 'attachment' : 'inline';

    return new Response(body, {
      headers: {
        'content-type': contentType,
        'content-length': String(record.sizeBytes),
        'content-disposition': `${disposition}; filename="${record.filename.replace(/["\\]/g, '')}"`,
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json({ ok: false, message: publicError.message }, { status: httpStatus(error) });
  }
}
