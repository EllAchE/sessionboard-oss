import { NextResponse } from 'next/server';
import { httpStatus, toPublicError } from '@/lib/errors';
import { readFile } from '@/lib/services/files';
import { sponsorsContext } from '../../context';

export const dynamic = 'force-dynamic';

/**
 * `E-7`. Logos are stored in Postgres or R2, never on a public URL, so the board reads them back
 * through here — the same shape as `app/admin/speakers/photo/[fileId]`. `readFile` re-checks the
 * event id against the row, which is what stops a file id from another event being read through
 * this one.
 *
 * Private and organizer-facing. There is no public sponsor page in this change, so there is
 * deliberately no unauthenticated route beside this one; adding one means proving access
 * structurally the way `app/(public)/[slug]/branding/[fileId]` does.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const [ctx, { fileId }] = await Promise.all([sponsorsContext(), params]);
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
