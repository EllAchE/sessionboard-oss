import { NextResponse } from 'next/server';
import { httpStatus, invalid, toPublicError } from '@/lib/errors';
import { SESSION_RECORDING_UPLOAD } from '@/lib/session-recording';
import { attachStoredRecording } from '@/lib/services/recordings';
import { deleteFile, storeFile, validateUpload } from '@/lib/services/files';
import { recordingsContext } from '../context';

const MAX_MULTIPART_BYTES = (SESSION_RECORDING_UPLOAD.maxSizeMb + 2) * 1024 * 1024;

/**
 * The same bounded, event-scoped upload path used by other files. The multipart envelope is
 * rejected before parsing when its declared size is excessive; the validated File is capped again
 * before its bytes reach storage. Full-length masters should use the HTTPS association workflow.
 */
export async function POST(request: Request) {
  try {
    const ctx = await recordingsContext();
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_MULTIPART_BYTES) {
      throw invalid(`Session recording accepts files up to ${SESSION_RECORDING_UPLOAD.maxSizeMb} MB`);
    }

    const body = await request.formData();
    const sessionId = String(body.get('sessionId') ?? '');
    if (!sessionId) throw invalid('Choose a session');
    const picked = body.get('recording');
    if (!(picked instanceof File) || picked.size === 0) throw invalid('Choose a video to upload');

    const candidate = {
      filename: picked.name,
      contentType: picked.type || 'application/octet-stream',
      sizeBytes: picked.size,
    };
    validateUpload(SESSION_RECORDING_UPLOAD, candidate);
    const stored = await storeFile(ctx, { ...candidate, bytes: await picked.arrayBuffer() });
    try {
      await attachStoredRecording(ctx, sessionId, stored.id);
    } catch (error) {
      await deleteFile(ctx, stored.id).catch((cleanupError) =>
        console.error(`recording upload cleanup failed: ${String(cleanupError)}`),
      );
      throw error;
    }

    return NextResponse.json({ ok: true, fileId: stored.id });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
