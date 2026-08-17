'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';
import styles from './not-found.module.css';

/**
 * The app-wide error boundary. Without one, every route outside `/portal` — the organizer
 * workspace, the reviewer queue, the CRM, public event pages, embeds, share links — falls through
 * to the framework's bare default page: no branding, no explanation, and no way to retry short of
 * reloading. Most of what lands here is a transient database blip, which `reset()` recovers from
 * without the reader losing their place.
 *
 * It borrows the 404's stylesheet deliberately. The two pages are the same object — a centred panel
 * explaining a dead end — and they are reached from the same wide mix of routes, so they should not
 * drift apart.
 */
export default function AppError({
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
    <main className={styles.root}>
      <div className={styles.panel}>
        {/* The digest is the only handle a reader can quote that ties back to a server log line. */}
        <p className={styles.code}>{error.digest ?? 'Error'}</p>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.body}>
          This is usually temporary. Try again, and if it keeps happening the page you came from is
          still where you left it.
        </p>
        <div className={styles.actions}>
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button href="/" variant="secondary">
            Go to the home page
          </Button>
        </div>
      </div>
    </main>
  );
}
