import { Button } from '@/components/ui';
import styles from './not-found.module.css';

/**
 * The app-wide 404. Every `notFound()` outside `/portal` lands here, so the copy stays neutral
 * about who is reading it — an attendee following a stale programme link and an organizer
 * mistyping a workspace URL see the same page. `/portal` keeps its own narrower version.
 */
export default function NotFound() {
  return (
    <main className={styles.root}>
      <div className={styles.panel}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>We could not find that page</h1>
        <p className={styles.body}>
          The link may be out of date, or the page may have moved since it was shared.
        </p>
        <div className={styles.actions}>
          <Button href="/" variant="primary">
            Go to the home page
          </Button>
        </div>
      </div>
    </main>
  );
}
