import { cache } from 'react';
import type { PublicBundle } from '@/app/embed/model';
import { loadSharePreviewBundle } from '@/lib/services/share-preview';
import { resolveShareLink, type ShareLinkGrant } from '@/lib/services/share-links';

/**
 * `AD-9`. Resolving a share link, once per request.
 *
 * `cache()`-wrapped for the same reason `loadPublicBundle` is: `generateMetadata` and the page body
 * both need the grant and the bundle, and without request-scoped memoization every render costs a
 * second token lookup and a second fan-out of programme queries.
 *
 * The bundle is loaded from `grant.eventId` and never from anything in the URL. `/s/[token]` carries
 * no slug, no view and no entity id, so a bearer has no parameter to tamper with: the event and the
 * view they get are the ones the organizer chose at mint time, and a token for event A has no
 * expressible way to name event B.
 */
export type ShareContext = { grant: ShareLinkGrant; bundle: PublicBundle };

export const shareContext = cache(async (token: string): Promise<ShareContext | null> => {
  const grant = await resolveShareLink(token);
  if (!grant) return null;

  const bundle = await loadSharePreviewBundle(grant.eventId);
  if (!bundle) return null;

  return { grant, bundle };
});
