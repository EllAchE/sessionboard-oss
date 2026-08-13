'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CiceroBrand } from '@/components/CiceroBrand';
import { Button } from '@/components/ui';
import { ThemeToggle } from '../admin/ThemeToggle';
import { signOutAction } from '../admin/shell-actions';
import styles from './review.module.css';

export function ReviewerShell({
  children,
  eventName,
  actorName,
  canDecide,
}: {
  children: React.ReactNode;
  eventName: string;
  actorName: string;
  canDecide: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/review" className={styles.brand}>
          <CiceroBrand markSize={18} />
          <span className={styles.brandRole}>Review</span>
        </Link>
        <nav className={styles.nav} aria-label="Reviewer">
          <Link
            href="/review"
            className={styles.navLink}
            data-active={pathname === '/review'}
          >
            My queue
          </Link>
        </nav>
        <div className={styles.topbarRight}>
          <span className={styles.eventName}>{eventName}</span>
          {canDecide ? (
            <Link href="/admin/submissions" className={styles.navLink}>
              Organizer view
            </Link>
          ) : null}
          <ThemeToggle />
          <span className={styles.actor}>{actorName}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
