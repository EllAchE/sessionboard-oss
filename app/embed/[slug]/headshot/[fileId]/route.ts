import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { file, participant } from '@/db/schema';
import { getStorage } from '@/lib/storage';
import { loadPublicBundle } from '../../../queries';

export const dynamic = 'force-dynamic';

/**
 * Headshots for the public surfaces. Unauthenticated by necessity — an iframe on somebody else's
 * website carries no session — so access is proven structurally instead: the file id must be the
 * `headshotFileId` of a participant who is already visible through `loadPublicBundle`, i.e. one
 * named on a *published* session. Any other file id in this event 404s, so this route cannot be
 * walked to reach an uploaded slide deck or a contract.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; fileId: string }> },
) {
  const { slug, fileId } = await params;

  const bundle = await loadPublicBundle(slug);
  if (!bundle) return new Response('Not found', { status: 404 });

  const visible = bundle.speakers.some((speaker) => speaker.headshotUrl?.endsWith(`/${fileId}`));
  if (!visible) return new Response('Not found', { status: 404 });

  const db = getDb();
  const [record, owner] = await Promise.all([
    db.query.file.findFirst({ where: and(eq(file.id, fileId), eq(file.eventId, bundle.event.id)) }),
    db.query.participant.findFirst({
      where: and(
        eq(participant.eventId, bundle.event.id),
        eq(participant.headshotFileId, fileId),
      ),
    }),
  ]);
  if (!record || !owner) return new Response('Not found', { status: 404 });

  try {
    const object = await getStorage().get(record.storageKey);
    return new Response(object.body, {
      headers: {
        'Content-Type': record.contentType || object.contentType,
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
        'Content-Security-Policy': 'frame-ancestors *',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
