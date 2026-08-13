'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui';
import styles from '../portal.module.css';

export type PortalTab = {
  id: string;
  label: string;
  href: string;
  count?: number | null;
  alert?: boolean;
};

export function PortalTabs({ tabs }: { tabs: PortalTab[] }) {
  const pathname = usePathname();

  /** Longest matching href wins, so /portal/x/tasks does not also light up Home. */
  const activeId = tabs
    .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.id;

  return (
    <nav className={styles.tabs} aria-label="Orator atrium">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(styles.tab, tab.id === activeId && styles.tabActive)}
          aria-current={tab.id === activeId ? 'page' : undefined}
        >
          {tab.label}
          {tab.count ? (
            <span className={cn(styles.tabCount, !tab.alert && styles.tabCountQuiet)}>
              {tab.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
