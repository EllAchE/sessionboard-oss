'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
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
          <ClipboardCheck size={16} aria-hidden />
          <span className={styles.wordmark}>Cicero</span>
          <span className={styles.brandRole}>Curia</span>
        </Link>
        <nav className={styles.nav} aria-label="Councillor">
          <Link
            href="/review"
            className={styles.navLink}
            data-active={pathname === '/review'}
          >
            My petitions
          </Link>
        </nav>
        <div className={styles.topbarRight}>
          <span className={styles.eventName}>{eventName}</span>
          {canDecide ? (
            <Link href="/admin/submissions" className={styles.navLink}>
              Magistrate view
            </Link>
          ) : null}
          <ThemeToggle />
          <span className={styles.actor}>{actorName}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Leave the Forum
            </Button>
          </form>
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
