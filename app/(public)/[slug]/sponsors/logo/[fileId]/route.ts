import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { event as eventTable, file } from '@/db/schema';
import { isPublicSponsorLogo } from '@/lib/services/sponsors';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * `E-7`. Sponsor logos for the public wall. Unauthenticated by necessity — the wall is a front-door
 * page and an organizer session is exactly what its readers do not have — so access is proven
 * structurally rather than checked, the way `app/(public)/[slug]/branding/[fileId]` proves it.
 *
 * The proof is `isPublicSponsorLogo`: the id in the path must be the one *currently* occupying the
 * logo slot of a sponsor row on the event named by the slug. That is a narrower thing than "a file
 * on this event", which is what the private `/admin/sponsors/logo/[fileId]` checks and what would
 * make this route a hole. A file id belonging to another event's sponsor fails on the event id; a
 * headshot, a slide deck or a signed contract sitting in this event's `file` table fails because no
 * sponsor row points at it. So this route cannot be walked to reach anything but a logo an organizer
 * has already chosen to put on a public page, and `lib/storage`'s no-presigned-URL rule is intact:
 * the bytes still leave through a server-side check.
 *
 * Cached for a year like the event branding, and safe for the same reason — the upload route stores
 * a new `file` row and writes its id into the slot, so a replaced logo is a different URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; fileId: string }> },
) {
  const { slug, fileId } = await params;
  const db = getDb();

  const owner = await db.query.event.findFirst({ where: eq(eventTable.slug, slug) });
  if (!owner) return new Response('Not found', { status: 404 });

  if (!(await isPublicSponsorLogo(owner.id, fileId))) {
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
