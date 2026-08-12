import { NextResponse } from 'next/server';
import { httpStatus, toPublicError } from '../../../../../lib/errors';
import { readFile } from '../../../../../lib/services/files';
import { speakersContext } from '../../context';

export const dynamic = 'force-dynamic';

/**
 * Headshots are stored in Postgres or R2, never on a public URL, so the roster reads them back
 * through here. `readFile` re-checks the event id against the row, which is what stops a file id
 * from another event being read through this one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const [ctx, { fileId }] = await Promise.all([speakersContext(), params]);
    const { record, body, contentType } = await readFile(ctx, fileId);

    return new Response(body, {
      headers: {
        'content-type': contentType,
        'content-length': String(record.sizeBytes),
        'content-disposition': 'inline',
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
