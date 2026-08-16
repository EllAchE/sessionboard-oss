import { NextResponse } from 'next/server';
import { httpStatus, toPublicError } from '@/lib/errors';
import { currentEventContext } from '@/lib/services/events';
import { readFile } from '@/lib/services/files';

export const dynamic = 'force-dynamic';

/**
 * `S-11`. The organizer's preview of the portal logo, in the shape
 * `app/organizer/sponsors/logo/[fileId]` established. Logos live in Postgres or R2 and never on a
 * public URL, so the panel reads them back through here; `readFile` re-checks the event id against
 * the row, which is what stops a file id from another event being read through this one.
 *
 * The speaker sees the same bytes through `/portal/{eventSlug}/file/{fileId}`, where the check is
 * their role on the event. Two routes rather than one because the two audiences are proved
 * differently, and an organizer looking at settings has no participant row to prove.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const [ctx, { fileId }] = await Promise.all([currentEventContext(), params]);
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
