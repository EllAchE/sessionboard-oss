import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/context';
import { httpStatus, invalid, toPublicError } from '@/lib/errors';
import { PORTAL_LOGO, portalLogoOrganizerUrl } from '@/lib/portal-appearance';
import { currentEventContext } from '@/lib/services/events';
import { adhocSpec, deleteFile, storeFile, validateUpload } from '@/lib/services/files';
import { setPortalLogo } from '@/lib/services/settings';

/**
 * `S-11`. A route handler rather than a Server Action for the same reason the event banner and the
 * sponsor logo uploads are: an action body is capped at 1 MB and a logo off a press kit routinely
 * is not. Validation is the files service's, against the same `FileRequestSpec` shape every other
 * upload uses, so the accepted types and the size ceiling are enforced in one place and merely
 * described in the panel.
 *
 * `setPortalLogo` creates the `portal_theme` row if the event has never had one, which is the whole
 * point of `S-11` — before this, uploading a portal logo was impossible and a row existed only on a
 * seeded event.
 */
export async function POST(request: Request) {
  try {
    const ctx = await currentEventContext();
    requireCapability(ctx, 'event:manage');

    const body = await request.formData();
    const picked = body.get('image');
    if (!(picked instanceof File) || picked.size === 0) throw invalid('Choose an image to upload');

    const candidate = {
      filename: picked.name,
      contentType: picked.type || 'application/octet-stream',
      sizeBytes: picked.size,
    };
    validateUpload(
      adhocSpec(PORTAL_LOGO.label, {
        acceptedTypes: PORTAL_LOGO.acceptedTypes,
        maxSizeMb: PORTAL_LOGO.maxSizeMb,
        allowMultiple: false,
      }),
      candidate,
    );

    const stored = await storeFile(ctx, { ...candidate, bytes: await picked.arrayBuffer() });
    const { previousFileId } = await setPortalLogo(ctx, stored.id);

    // One slot holds one image, so the image it replaced is unreachable from any screen.
    if (previousFileId) {
      try {
        await deleteFile(ctx, previousFileId);
      } catch (error) {
        console.error(`portal logo cleanup failed: ${String(error)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      fileId: stored.id,
      url: portalLogoOrganizerUrl(stored.id),
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
