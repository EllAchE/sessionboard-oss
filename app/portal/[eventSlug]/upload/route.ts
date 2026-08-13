import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireEventContext } from '@/lib/auth';
import { httpStatus, invalid, notFound, toPublicError } from '@/lib/errors';
import { replaceDeliverable } from '@/lib/services/content';
import { adhocSpec, storeFile, validateUpload, type UploadInput } from '@/lib/services/files';
import { ensureParticipant, getEventBySlug, setHeadshot } from '@/lib/services/portal';
import { attachTaskFiles } from '@/lib/services/tasks';

/**
 * Uploads are a route handler rather than a Server Action on purpose: a Server Action body is capped
 * at 1 MB by default, and a slide deck is the one thing a speaker uploads that is never that small.
 * Validation still lives in `lib/services/files.ts`, so this is transport and nothing else.
 */

const HEADSHOT_SPEC = adhocSpec('Headshot', {
  acceptedTypes: ['image/*'],
  maxSizeMb: 10,
  allowMultiple: false,
});

async function toUploads(picked: File[]): Promise<UploadInput[]> {
  return Promise.all(
    picked.map(async (entry) => ({
      filename: entry.name,
      contentType: entry.type || 'application/octet-stream',
      sizeBytes: entry.size,
      bytes: await entry.arrayBuffer(),
    })),
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ eventSlug: string }> }) {
  try {
    const { eventSlug } = await params;
    const event = await getEventBySlug(eventSlug);
    if (!event) throw notFound('That event');

    const ctx = await requireEventContext(event.id);
    const me = await ensureParticipant(ctx);

    const body = await request.formData();
    const intent = String(body.get('intent') ?? '');
    const picked = body.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (picked.length === 0) throw invalid('Choose a scroll to lodge');

    if (intent === 'headshot') {
      const [candidate] = await toUploads(picked.slice(0, 1));
      validateUpload(HEADSHOT_SPEC, candidate);
      const stored = await storeFile(ctx, candidate);
      await setHeadshot(ctx, me.id, stored.id);
      revalidatePath(`/portal/${eventSlug}`, 'layout');
      return NextResponse.json({ ok: true, message: 'Portrait placed in the gallery' });
    }

    if (intent === 'task') {
      const assignmentId = String(body.get('assignmentId') ?? '');
      if (!assignmentId) throw invalid('That duty is absent from the ledger');
      await attachTaskFiles(ctx, me.id, assignmentId, await toUploads(picked));
      revalidatePath(`/portal/${eventSlug}`, 'layout');
      return NextResponse.json({
        ok: true,
        message: picked.length === 1 ? 'Scroll entered in the archive' : `${picked.length} scrolls entered in the archive`,
      });
    }

    if (intent === 'replace') {
      const fileId = String(body.get('fileId') ?? '');
      if (!fileId) throw invalid('That scroll is absent from the archive');
      const [candidate] = await toUploads(picked.slice(0, 1));
      const next = await replaceDeliverable(ctx, fileId, candidate);
      revalidatePath(`/portal/${eventSlug}`, 'layout');
      return NextResponse.json({
        ok: true,
        message: `Filed as version ${next.version}—the earlier record remains in the annals`,
        fileId: next.id,
      });
    }

    throw invalid('The atrium has no decree calling for that record');
  } catch (error) {
    const publicError = toPublicError(error);
    // `toPublicError` drops the original so a connection string cannot reach the speaker; logging it
    // here is the other half of that bargain. Without it a failed upload leaves no trace anywhere,
    // which is how a misrouted storage backend once hid behind "Something went wrong" indefinitely.
    if (publicError.code === 'internal') {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error(`portal upload failed: ${detail}`);
    }
    return NextResponse.json({ ok: false, message: publicError.message }, { status: httpStatus(error) });
  }
}
