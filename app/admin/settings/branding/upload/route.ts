import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/context';
import { httpStatus, invalid, toPublicError } from '@/lib/errors';
import { EVENT_BRANDING, isBrandingKind, eventBrandingUrl } from '@/lib/event-branding';
import { adhocSpec, deleteFile, storeFile, validateUpload } from '@/lib/services/files';
import { currentEventContext, getEvent, updateEvent } from '@/lib/services/events';

/**
 * `E-3`. A route handler rather than a Server Action for the same reason the headshot upload is one:
 * an action body is capped at 1 MB and a 1500 × 500 banner routinely is not. The validation is the
 * files service's, against the same `FileRequestSpec` shape every other upload uses, so the accepted
 * types and the size ceiling are enforced in one place and merely described in the panel.
 */
export async function POST(request: Request) {
  try {
    const ctx = await currentEventContext();
    requireCapability(ctx, 'event:manage');

    const body = await request.formData();
    const kind = String(body.get('kind') ?? '');
    if (!isBrandingKind(kind)) throw invalid('That is not an image slot on this event');
    const spec = EVENT_BRANDING[kind];

    const picked = body.get('image');
    if (!(picked instanceof File) || picked.size === 0) throw invalid('Choose an image to upload');

    const candidate = {
      filename: picked.name,
      contentType: picked.type || 'application/octet-stream',
      sizeBytes: picked.size,
    };
    validateUpload(
      adhocSpec(spec.label, {
        acceptedTypes: spec.acceptedTypes,
        maxSizeMb: spec.maxSizeMb,
        allowMultiple: false,
      }),
      candidate,
    );

    const before = await getEvent(ctx.eventId);
    const stored = await storeFile(ctx, { ...candidate, bytes: await picked.arrayBuffer() });
    await updateEvent(ctx, { [spec.column]: stored.id });

    // One slot holds one image, so the image it replaced is unreachable from any screen.
    const previous = before[spec.column];
    if (previous) {
      try {
        await deleteFile(ctx, previous);
      } catch (error) {
        console.error(`branding cleanup failed: ${String(error)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      fileId: stored.id,
      url: eventBrandingUrl(before.slug, stored.id),
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
