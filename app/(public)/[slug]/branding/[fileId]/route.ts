import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { event as eventTable, file } from '@/db/schema';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * `E-3`. The event logo and banner for the public pages. Unauthenticated by necessity — the pages
 * that render these are the front door — so access is proven structurally rather than checked: the
 * file id has to be one of exactly two ids on the event named in the path. Any other file id 404s,
 * so this route cannot be walked to reach an uploaded deck, a headshot or a contract.
 *
 * The id changes whenever the image does, which is what makes a year-long cache safe.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; fileId: string }> },
) {
  const { slug, fileId } = await params;
  const db = getDb();

  const owner = await db.query.event.findFirst({ where: eq(eventTable.slug, slug) });
  if (!owner) return new Response('Not found', { status: 404 });
  if (fileId !== owner.logoFileId && fileId !== owner.bannerFileId) {
    return new Response('Not found', { status: 404 });
  }

  const record = await db.query.file.findFirst({
    where: and(eq(file.id, fileId), eq(file.eventId, owner.id)),
  });
  if (!record) return new Response('Not found', { status: 404 });

  try {
    const object = await getStorage().get(record.storageKey);
    return new Response(object.body, {
      headers: {
        'Content-Type': record.contentType || object.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': 'frame-ancestors *',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
