import Link from 'next/link';
import { Button } from '@/components/ui';
import styles from './portal.module.css';

export default function PortalNotFound() {
  return (
    <main className={styles.main}>
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>That page is not in your portal</div>
        <p>Check the link or ask an organizer for access.</p>
        <div className={styles.taskActions} style={{ justifyContent: 'center', marginTop: 'var(--space-6)' }}>
          <Link href="/portal">
            <Button variant="secondary">Back to your portals</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
