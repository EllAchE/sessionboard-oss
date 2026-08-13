import Link from 'next/link';
import type { PublicEvent } from '../../embed/queries';
import styles from './public-event.module.css';

const TABS = [
  { id: 'home', label: 'Forum', path: '' },
  { id: 'agenda', label: 'Fasti', path: '/agenda' },
  { id: 'itinerary', label: 'My route', path: '/itinerary' },
  { id: 'sessions', label: 'Orations', path: '/sessions' },
  { id: 'speakers', label: 'Orators', path: '/speakers' },
];

export function PublicChrome({
  event,
  active,
  children,
}: {
  event: PublicEvent;
  active: string;
  children: React.ReactNode;
}) {
  const dates = [event.startsOn, event.endsOn].filter(Boolean).join(' – ');

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <span className={styles.brand}>
            <Link href={`/${event.slug}`} className={styles.brandName}>
              {event.name}
            </Link>
            {dates || event.venueName ? (
              <span className={styles.brandMeta}>
                {[dates, event.venueName].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </span>
          <nav className={styles.nav}>
            {TABS.map((tab) => (
              <Link
                key={tab.id}
                href={`/${event.slug}${tab.path}`}
                className={styles.navLink}
                data-active={tab.id === active}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>
            {event.name}
            {event.websiteUrl ? (
              <>
                {' · '}
                <a href={event.websiteUrl} rel="noreferrer" target="_blank">
                  Official event scroll
                </a>
              </>
            ) : null}
          </span>
          <span>Proclaimed by Cicero</span>
        </div>
      </footer>
    </div>
  );
}

export { styles as publicStyles };
