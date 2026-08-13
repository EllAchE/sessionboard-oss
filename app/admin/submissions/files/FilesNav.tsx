'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './files.module.css';

const TABS = [
  { href: '/admin/submissions/files', label: 'The archive' },
  { href: '/admin/submissions/files/deliverables', label: 'Required scrolls' },
  { href: '/admin/submissions/files/history', label: 'The annals' },
];

/** The admin sidebar is owned elsewhere, so the three content screens carry their own switcher. */
export function FilesNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Scrolls and annals">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          className={styles.navLink}
          href={tab.href}
          data-active={
            tab.href === '/admin/submissions/files'
              ? pathname === tab.href || pathname.startsWith('/admin/submissions/files/detail')
              : pathname.startsWith(tab.href)
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
