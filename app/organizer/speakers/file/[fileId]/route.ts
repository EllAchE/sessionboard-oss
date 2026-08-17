import { NextResponse } from 'next/server';
import { httpStatus, toPublicError } from '../../../../../lib/errors';
import { readFile } from '../../../../../lib/services/files';
import { speakersContext } from '../../context';

export const dynamic = 'force-dynamic';

/**
 * `SPK-10`. What a speaker uploaded, served from their organizer-side record. The neighbouring
 * `photo/` route exists for the avatar preview and only ever renders inline; this one is the
 * download control, so it sends the stored filename and defaults to `attachment`.
 *
 * It is gated on `speakersContext` rather than on the file library's stricter `submission:decide`,
 * because the roster is already readable by a reviewer and a download control that 403s for half the
 * people who can see it is worse than no control at all. `readFile` re-checks the event id against
 * the row, which is what stops a file id from another event being read through this one.
 */
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const [ctx, { fileId }] = await Promise.all([speakersContext(), params]);
    const { record, body, contentType } = await readFile(ctx, fileId);

    const inline = new URL(request.url).searchParams.has('inline');

    return new Response(body, {
      headers: {
        'content-type': contentType,
        'content-length': String(record.sizeBytes),
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${record.filename.replace(/["\\]/g, '')}"`,
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
