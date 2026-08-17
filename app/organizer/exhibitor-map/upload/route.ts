import { NextResponse } from 'next/server';
import { EXHIBITOR_MAP_UPLOAD } from '@/lib/exhibitor-map';
import { httpStatus, invalid, toPublicError } from '@/lib/errors';
import { uploadExhibitorMap } from '@/lib/services/exhibitor-map';
import { exhibitorMapContext } from '../context';

const MAX_MULTIPART_BYTES = (EXHIBITOR_MAP_UPLOAD.maxSizeMb + 2) * 1024 * 1024;

/** `AR-37`. Route handlers accept the PDF bytes without raising the Server Action body ceiling. */
export async function POST(request: Request) {
  try {
    const ctx = await exhibitorMapContext();
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_MULTIPART_BYTES) {
      throw invalid(`Exhibitor map accepts files up to ${EXHIBITOR_MAP_UPLOAD.maxSizeMb} MB`);
    }

    const body = await request.formData();
    const picked = body.get('map');
    if (!(picked instanceof File) || picked.size === 0) throw invalid('Choose a PDF to upload');
    const bytes = await picked.arrayBuffer();
    const uploaded = await uploadExhibitorMap(ctx, {
      filename: picked.name,
      contentType: picked.type || 'application/octet-stream',
      sizeBytes: picked.size,
      bytes,
    });

    return NextResponse.json({ ok: true, fileId: uploaded.fileId });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
