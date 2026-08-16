'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';
import styles from './portal.module.css';

/**
 * A speaker who hits an error must never be shown a stack trace or a dead end. The reset button
 * re-renders the segment, which is enough for the transient database blip this most often is.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <main className={styles.main}>
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Something went wrong</div>
        <p>Try again. Contact the organizers if it keeps happening.</p>
        <div className={styles.taskActions} style={{ justifyContent: 'center', marginTop: 'var(--space-6)' }}>
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </main>
  );
}
