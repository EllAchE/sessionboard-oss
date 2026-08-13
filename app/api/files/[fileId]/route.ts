import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { participant } from '@/db/schema';
import { getFileRecord } from '@/lib/services/files';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * The absolute headshot URL `/api/v1` hands to unauthenticated callers and `lib/accelevents/sync`
 * hands to Accelevents. Both consumers are outside Cicero — a public speaker list is read without a
 * session, and Accelevents fetches the image from its own servers — so this route cannot ask for one.
 *
 * Access is proven structurally instead, the same way `app/embed/[slug]/headshot/[fileId]` proves it:
 * the id has to already be some participant's `headshotFileId`. A slide deck, a submission
 * attachment or a signed contract is never any participant's headshot, so no id for one survives the
 * lookup and this route cannot be walked to reach them. The embed route scopes that check to one
 * event because it has a slug to scope by; here the owning event is whatever the participant row
 * names, and `getFileRecord` re-checks it against the `file` row so a headshot id cannot be paired
 * with another event's object.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;

  // `headshot_file_id` is a `uuid` column, so a path segment that is not one is a cast error rather
  // than a miss. Refused up front, or a junk URL 500s where it should 404.
  if (!UUID.test(fileId)) return missing();

  const owner = await getDb().query.participant.findFirst({
    where: eq(participant.headshotFileId, fileId),
  });
  if (!owner) return missing();

  try {
    const record = await getFileRecord(owner.eventId, fileId);
    const object = await getStorage().get(record.storageKey);

    return new Response(object.body, {
      headers: {
        'content-type': record.contentType || object.contentType,
        'content-length': String(record.sizeBytes),
        'content-disposition': 'inline',
        // Public rather than private, unlike the signed-in file routes: this one is meant to be
        // cached by whatever CDN sits in front of a conference website.
        'cache-control': 'public, max-age=300, s-maxage=3600',
      },
    });
  } catch {
    return missing();
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every refusal is the same 404. Distinguishing "no such file" from "a file you may not have" would
 * turn this route into an oracle for which ids exist, which is the one thing an unauthenticated
 * bytes endpoint must not answer.
 */
function missing(): Response {
  return new Response('Not found', { status: 404 });
}
