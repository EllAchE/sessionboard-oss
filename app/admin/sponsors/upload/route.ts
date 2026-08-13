import { NextResponse } from 'next/server';
import { httpStatus, invalid, toPublicError } from '@/lib/errors';
import { adhocSpec, deleteFile, storeFile, validateUpload } from '@/lib/services/files';
import { getSponsor, updateSponsor } from '@/lib/services/sponsors';
import { SPONSOR_LOGO } from '@/lib/sponsor-branding';
import { manageSponsorsContext } from '../context';

/**
 * `E-7`. A route handler rather than a Server Action for the same reason the headshot and the event
 * banner uploads are: an action body is capped at 1 MB and a logo off a press kit routinely is not.
 * Validation is the files service's, against the same `FileRequestSpec` shape every other upload
 * uses, so the accepted types and the size ceiling are enforced in one place and merely described
 * in the panel.
 *
 * Unlike the headshot route this writes the column itself, because the slot holds exactly one image
 * and there is no surrounding form to reconcile with — same reasoning as the branding upload.
 */
export async function POST(request: Request) {
  try {
    const ctx = await manageSponsorsContext();

    const body = await request.formData();
    const sponsorId = String(body.get('sponsorId') ?? '');
    if (!sponsorId) throw invalid('That upload names no sponsor');

    // Proves the row is on this event before a byte is stored, so a file id from another event's
    // sponsor cannot be created here and an upload cannot leave orphaned bytes behind a 404.
    const before = await getSponsor(ctx, sponsorId);

    const picked = body.get('logo');
    if (!(picked instanceof File) || picked.size === 0) throw invalid('Choose an image to upload');

    const candidate = {
      filename: picked.name,
      contentType: picked.type || 'application/octet-stream',
      sizeBytes: picked.size,
    };
    validateUpload(
      adhocSpec(SPONSOR_LOGO.label, {
        acceptedTypes: SPONSOR_LOGO.acceptedTypes,
        maxSizeMb: SPONSOR_LOGO.maxSizeMb,
        allowMultiple: false,
      }),
      candidate,
    );

    const stored = await storeFile(ctx, { ...candidate, bytes: await picked.arrayBuffer() });
    await updateSponsor(ctx, sponsorId, { logoFileId: stored.id });

    // One slot holds one image, so the image it replaced is unreachable from any screen.
    if (before.logoFileId) {
      try {
        await deleteFile(ctx, before.logoFileId);
      } catch (error) {
        console.error(`sponsor logo cleanup failed: ${String(error)}`);
      }
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
