import Link from 'next/link';
import { Button } from '@/components/ui';
import styles from './portal.module.css';

export default function PortalNotFound() {
  return (
    <main className={styles.main}>
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>That page is not in your portal</div>
        <p>
          Either the link is wrong, or you do not have a role on this event. If an organizer invited
          you, open the link in their email again — it signs you in on the way through.
        </p>
        <div className={styles.taskActions} style={{ justifyContent: 'center', marginTop: 'var(--space-6)' }}>
          <Link href="/portal">
            <Button variant="secondary">Back to your portals</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
