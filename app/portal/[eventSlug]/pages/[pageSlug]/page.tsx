import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { can } from '@/lib/context';
import { getPortalPage, listPortalPages } from '@/lib/services/portal';
import { formatDate } from '../../../format';
import styles from '../../../portal.module.css';
import { portalSession } from '../../context';

/**
 * `S-6`, `S-7`. The body arrives as HTML from `getPortalPage`, which picks the trusted renderer only
 * for organizer-authored pages with `allowRawHtml`. Nothing a speaker writes is ever rendered here.
 */
export default async function PortalPageView({
  params,
}: {
  params: Promise<{ eventSlug: string; pageSlug: string }>;
}) {
  const { eventSlug, pageSlug } = await params;
  const { event, ctx } = await portalSession(eventSlug);

  /** An organizer previewing their own portal should see a draft page; a speaker never does. */
  const includeUnpublished = can(ctx, 'portal:manage');
  const [page, siblings] = await Promise.all([
    getPortalPage(event.id, pageSlug, includeUnpublished),
    listPortalPages(event.id, includeUnpublished),
  ]);
  if (!page) notFound();

  return (
    <div className={styles.grid2}>
      <aside>
        <Link href={`/portal/${eventSlug}/pages`} className={styles.metaLine}>
          <ChevronLeft size={14} aria-hidden /> All notices
        </Link>
        <nav className={styles.sidebarLinks} style={{ marginTop: 'var(--space-4)' }}>
          {siblings.map((sibling) => (
            <Link
              key={sibling.id}
              href={`/portal/${eventSlug}/pages/${sibling.slug}`}
              className={
                sibling.slug === page.slug
                  ? `${styles.sidebarLink} ${styles.sidebarLinkActive}`
                  : styles.sidebarLink
              }
            >
              {sibling.title}
              {!sibling.published ? ' (unproclaimed)' : ''}
            </Link>
          ))}
        </nav>
      </aside>

      <article>
        <h1 className={styles.pageTitle}>{page.title}</h1>
        <p className={styles.faint} style={{ marginBottom: 'var(--space-6)' }}>
          Revised {formatDate(page.updatedAt, event.timezone)}
          {!page.published ? ' · not yet proclaimed to orators' : ''}
        </p>
        <div className={styles.prose} dangerouslySetInnerHTML={{ __html: page.html }} />
      </article>
    </div>
  );
}
