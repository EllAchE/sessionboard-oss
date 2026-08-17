import { listShareLinks } from '@/lib/services/share-links';
import { shareLinkContext } from './context';
import { ShareLinksScreen } from './ShareLinksScreen';
import type { ShareLinkRow } from './types';

export const dynamic = 'force-dynamic';

/**
 * The route stays `/organizer/share-links` while the label reads "Guest links": issued URLs and
 * bookmarks point at this path, and the rename was only ever about what an organizer calls it.
 */
export const metadata = { title: 'Guest links · Cicero' };

export default async function ShareLinksPage() {
  const ctx = await shareLinkContext();
  const links = await listShareLinks(ctx.eventId);

  const rows: ShareLinkRow[] = links.map((link) => ({
    id: link.id,
    label: link.label,
    view: link.view,
    prefix: link.prefix,
    expiresAt: link.expiresAt.toISOString(),
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
    lastViewedAt: link.lastViewedAt ? link.lastViewedAt.toISOString() : null,
    viewCount: link.viewCount,
    createdAt: link.createdAt.toISOString(),
  }));

  return <ShareLinksScreen links={rows} />;
}
