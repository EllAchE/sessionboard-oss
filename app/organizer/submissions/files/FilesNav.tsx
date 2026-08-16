'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './files.module.css';

const TABS = [
  { href: '/organizer/submissions/files', label: 'All files' },
  { href: '/organizer/submissions/files/deliverables', label: 'Deliverables' },
  { href: '/organizer/submissions/files/history', label: 'Content history' },
];

/** The organizer sidebar is owned elsewhere, so the three content screens carry their own switcher. */
export function FilesNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Content and files">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          className={styles.navLink}
          href={tab.href}
          data-active={
            tab.href === '/organizer/submissions/files'
              ? pathname === tab.href || pathname.startsWith('/organizer/submissions/files/detail')
              : pathname.startsWith(tab.href)
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
