import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import { EVENT_COOKIE, listEventsForUser } from '@/lib/services/events';
import styles from './portal.module.css';

export const metadata = { title: 'Speaker portal · Cicero' };

/**
 * The portal lives under an event slug, so this exists for the speaker who bookmarks `/portal` or
 * arrives from a magic link with no event on it. One event means one redirect and no decision.
 */
export default async function PortalIndexPage() {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/portal');

  const events = await listEventsForUser(actor.userId);
  if (events.length === 1) redirect(`/portal/${events[0].slug}`);

  /**
   * A link that named an event leaves that event on the session (`adoptTokenEvent`), and someone who
   * arrived through one has already answered the only question this page asks. Offering the list
   * anyway made the organizer workspace's own "Speaker portal" action open a chooser rather than a
   * portal. Matched against live memberships, so a cookie that outlived its event falls through to
   * the list rather than redirecting into a 404.
   */
  const preferred = (await cookies()).get(EVENT_COOKIE)?.value;
  const named = preferred ? events.find((candidate) => candidate.id === preferred) : undefined;
  if (named) redirect(`/portal/${named.slug}`);

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Your speaker portals</h1>
        <p className={styles.pageLead}>
          {events.length === 0
            ? 'You’re not on any events yet. Ask an organizer to add you.'
            : 'Pick the event you are speaking at.'}
        </p>
      </div>

      <div className={styles.typeGrid}>
        {events.map((event) => (
          <Link key={event.id} href={`/portal/${event.slug}`} className={styles.typeCard}>
            <div className={styles.typeLabel}>{event.name}</div>
            <div className={styles.typeDescription}>{event.tagline ?? 'Open your portal'}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
