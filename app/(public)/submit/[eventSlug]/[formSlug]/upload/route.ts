import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { file } from '@/db/schema';
import { currentActor } from '@/lib/auth';
import { httpStatus, invalid, toPublicError } from '@/lib/errors';
import { getStorage, storageKey } from '@/lib/storage';
import { isAcceptingSubmissions, loadPublicForm } from '@/lib/services/submissions';

/**
 * File-type answers upload here before the submission exists, and before the submitter has an
 * account — the alternative is asking a stranger to create a login before they can attach a slide
 * deck. The gate is the form itself: an open form on a real event accepts one bounded file.
 */

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventSlug: string; formSlug: string }> },
) {
  try {
    const { eventSlug, formSlug } = await params;
    const bundle = await loadPublicForm(eventSlug, formSlug);
    if (!bundle || bundle.form.status === 'draft') throw invalid('That form could not be found');
    if (!isAcceptingSubmissions(bundle.form)) throw invalid('This form is closed');

    const body = await request.formData();
    const picked = body.get('file');
    if (!(picked instanceof File)) throw invalid('No file was attached');
    if (picked.size === 0) throw invalid('That file is empty');
    if (picked.size > MAX_BYTES) throw invalid('Files must be 25 MB or smaller');

    const key = storageKey(bundle.event.id, picked.name);
    const contentType = picked.type || 'application/octet-stream';
    await getStorage().put(key, await picked.arrayBuffer(), contentType);

    const actor = await currentActor();
    const [row] = await getDb()
      .insert(file)
      .values({
        eventId: bundle.event.id,
        storageKey: key,
        filename: picked.name,
        contentType,
        sizeBytes: picked.size,
        uploadedByUserId: actor?.userId ?? null,
      })
      .returning({ id: file.id });

    return NextResponse.json({ ok: true, fileId: row.id, filename: picked.name });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { ok: false, message: publicError.message },
      { status: httpStatus(error) },
    );
  }
}
