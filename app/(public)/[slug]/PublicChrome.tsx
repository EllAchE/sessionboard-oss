import Link from 'next/link';
import { eventHasSponsors } from '@/lib/services/sponsors';
import type { PublicEvent } from '../../embed/queries';
import { ConferenceCountdown } from './ConferenceCountdown';
import styles from './public-event.module.css';

type Tab = {
  id: string;
  label: string;
  path: string;
  /**
   * Absent means the tab is always there — the core pages exist for every event, empty or not,
   * because "no sessions yet" is information an attendee came for.
   *
   * Present means the tab is earned. `E-7` is the first page that is genuinely optional per event:
   * most conferences have no sponsors in Cicero at all, and a Sponsors tab leading to a blank page
   * is worse than no tab. The predicate lives in the row rather than in a branch below it so the
   * next conditional page is a line in this array and not a second special case — and so the tab
   * keeps its declared position instead of being appended wherever the branch happens to run.
   */
  when?: (event: PublicEvent) => Promise<boolean>;
};

const TABS: Tab[] = [
  { id: 'home', label: 'Overview', path: '' },
  { id: 'agenda', label: 'Agenda', path: '/agenda' },
  { id: 'itinerary', label: 'Schedule', path: '/itinerary' },
  { id: 'sessions', label: 'Sessions', path: '/sessions' },
  { id: 'speakers', label: 'Speakers', path: '/speakers' },
  {
    id: 'sponsors',
    label: 'Sponsors',
    path: '/sponsors',
    when: (event) => eventHasSponsors(event.id),
  },
];

/**
 * Resolved here rather than threaded in as a prop from each page. Every public page renders this
 * chrome, so a flag per conditional tab would be an edit in each of them per tab, and as many
 * chances for one page to disagree with the rest about which nav an event has. The chrome is the
 * thing that owns the nav, so it is the thing that asks.
 *
 * The predicates run together, so adding a second conditional tab costs no extra round trip.
 */
async function visibleTabs(event: PublicEvent): Promise<Tab[]> {
  const shown = await Promise.all(TABS.map((tab) => tab.when?.(event) ?? true));
  return TABS.filter((_, index) => shown[index]);
}

export async function PublicChrome({
  event,
  active,
  children,
}: {
  event: PublicEvent;
  active: string;
  children: React.ReactNode;
}) {
  const dates = [event.startsOn, event.endsOn].filter(Boolean).join(' – ');
  const tabs = await visibleTabs(event);

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <span className={styles.brandRow}>
            {/* `E-3`. Decorative: the event name is right beside it and reads the same. */}
            {event.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a route handler serves this, not the image optimiser
              <img src={event.logoUrl} alt="" className={styles.brandLogo} />
            ) : null}
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
            {event.startsOn ? (
              <ConferenceCountdown
                startsOn={event.startsOn}
                endsOn={event.endsOn}
                timeZone={event.timezone}
                initialNow={Date.now()}
              />
            ) : null}
          </span>
          <nav className={styles.nav}>
            {tabs.map((tab) => (
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
                  Event website
                </a>
              </>
            ) : null}
          </span>
          <span>Powered by Cicero</span>
        </div>
      </footer>
    </div>
  );
}

export { styles as publicStyles };
