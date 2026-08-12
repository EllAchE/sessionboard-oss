import Link from 'next/link';
import styles from './comms.module.css';

/**
 * `/admin/comms` and `/admin/mail` carry the current event in a query parameter rather than a path
 * segment, so every internal link has to preserve it. This is the one place that knows that.
 */
export type CommsTab = 'compose' | 'templates' | 'mail';

const TABS: Array<{ id: CommsTab; label: string; href: string }> = [
  { id: 'compose', label: 'Compose', href: '/admin/comms' },
  { id: 'templates', label: 'Templates', href: '/admin/comms/templates' },
  { id: 'mail', label: 'Mailbox', href: '/admin/mail' },
];

export function CommsTabs({ active, eventSlug }: { active: CommsTab; eventSlug?: string | null }) {
  const suffix = eventSlug ? `?event=${encodeURIComponent(eventSlug)}` : '';
  return (
    <nav className={styles.tabsRow} aria-label="Communications">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`${tab.href}${suffix}`}
          className={`${styles.tabLink} ${tab.id === active ? styles.tabLinkActive : ''}`}
          aria-current={tab.id === active ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
