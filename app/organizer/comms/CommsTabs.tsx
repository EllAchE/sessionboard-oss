import Link from 'next/link';
import styles from './comms.module.css';

/**
 * `/organizer/comms` and `/organizer/sent` carry the current event in a query parameter rather than a path
 * segment, so every internal link has to preserve it. This is the one place that knows that.
 */
export type CommsTab = 'compose' | 'templates' | 'sent';

const TABS: Array<{ id: CommsTab; label: string; href: string }> = [
  { id: 'compose', label: 'Compose', href: '/organizer/comms' },
  { id: 'templates', label: 'Templates', href: '/organizer/comms/templates' },
  /**
   * One tab, not one per channel. Email and SMS were separate strips over the same master/detail
   * view, which made "did this reach her" a question you had to ask twice. `/organizer/sent` shows
   * both and keeps the channel as a filter inside the list.
   */
  { id: 'sent', label: 'Sent', href: '/organizer/sent' },
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
