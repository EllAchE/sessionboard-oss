import { NextResponse } from 'next/server';
import { httpStatus, toPublicError } from '../../../../../lib/errors';
import { readFile } from '../../../../../lib/services/files';
import { decideContext } from '../../context';

export const dynamic = 'force-dynamic';

/**
 * The single-file counterpart to the archive, so a row in the table is a link rather than a
 * one-item download. `readFile` re-checks the event id against the row, so a file id from another
 * event is a 404 here whatever the organizer's roles elsewhere.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const [ctx, { fileId }] = await Promise.all([decideContext(), params]);
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
