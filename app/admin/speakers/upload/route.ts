import { NextResponse } from 'next/server';
import { httpStatus, invalid, toPublicError } from '../../../../lib/errors';
import { adhocSpec, storeFile, validateUpload } from '../../../../lib/services/files';
import { manageSpeakersContext } from '../context';

/**
 * A route handler rather than a Server Action because a Server Action body is capped at 1 MB and a
 * headshot straight off a phone is routinely larger. Validation still lives in the files service, so
 * this is transport and nothing else.
 */

const HEADSHOT = adhocSpec('Speaker photo', {
  acceptedTypes: ['image/*'],
  maxSizeMb: 10,
  allowMultiple: false,
});

export async function POST(request: Request) {
  try {
    const ctx = await manageSpeakersContext();
    const body = await request.formData();
    const picked = body.get('photo');
    if (!(picked instanceof File) || picked.size === 0) throw invalid('Choose an image to upload');

    const candidate = {
      filename: picked.name,
      contentType: picked.type || 'application/octet-stream',
      sizeBytes: picked.size,
    };
    validateUpload(HEADSHOT, candidate);
    const stored = await storeFile(ctx, { ...candidate, bytes: await picked.arrayBuffer() });

    return NextResponse.json({ ok: true, fileId: stored.id });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
