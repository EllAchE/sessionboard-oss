import { listPortalPages } from '@/lib/services/portal';
import Link from 'next/link';
import styles from '../../portal.module.css';
import { portalSession } from '../context';

export const metadata = { title: 'Speaker information · Speaker portal' };

/** `S-6`. */
export default async function PortalPagesIndex({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const { event } = await portalSession(eventSlug);
  const pages = await listPortalPages(event.id);

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Speaker information</h1>
        <p className={styles.pageLead}>
          Reference material written by the {event.name} organizers i.e. travel, AV, house style.
        </p>
      </div>

      {pages.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>Nothing published yet</div>
          <p>The organizers have not written any speaker information for this event.</p>
        </div>
      ) : (
        <div className={styles.typeGrid}>
          {pages.map((page) => (
            <Link key={page.id} href={`/portal/${eventSlug}/pages/${page.slug}`} className={styles.typeCard}>
              <div className={styles.typeLabel}>{page.title}</div>
              <div className={styles.typeDescription}>Read this page</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
