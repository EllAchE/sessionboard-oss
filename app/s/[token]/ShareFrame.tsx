import type { ReactNode } from 'react';
import type { ShareLinkGrant } from '@/lib/services/share-links';
import styles from './share.module.css';

/**
 * The chrome every share-link page carries. Two jobs, both about honesty rather than decoration.
 *
 * The banner tells the reader what they are holding: a private preview that may contain unpublished
 * material, whose link expires, and which the organizer can revoke. Someone forwarded a draft agenda
 * should be able to see from the page that it is a draft, without having been told.
 *
 * The footer states there is nothing else here. A share-link visitor has no account, and the page
 * offers no sign-in prompt, no navigation into the product, and nothing to submit — every share
 * surface is a read.
 */
export function ShareFrame({
  grant,
  eventName,
  children,
}: {
  grant: ShareLinkGrant;
  eventName: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.banner}>
        <div className={styles.bannerMain}>
          <span className={styles.pill}>Private preview</span>
          <p className={styles.bannerText}>
            A working copy of <strong>{eventName}</strong>, shared with you by the organizer. It may
            include sessions and speakers that are not published yet, and it can change or stop
            working at any time.
          </p>
        </div>
        <p className={styles.bannerMeta}>
          Link expires{' '}
          <time dateTime={grant.expiresAt.toISOString()}>
            {grant.expiresAt.toLocaleDateString('en-US', {
              timeZone: 'UTC',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        </p>
      </header>

      {children}

      <footer className={styles.footer}>
        <p>
          Please keep this link to yourself, because anyone who has it can read this page. Send corrections
          to whoever shared it with you.
        </p>
      </footer>
    </div>
  );
}
