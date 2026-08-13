import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import { listEventsForUser } from '@/lib/services/events';
import styles from './portal.module.css';

export const metadata = { title: 'Orator atrium · Cicero' };

/**
 * The portal lives under an event slug, so this exists for the speaker who bookmarks `/portal` or
 * arrives from a magic link with no event on it. One event means one redirect and no decision.
 */
export default async function PortalIndexPage() {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/portal');

  const events = await listEventsForUser(actor.userId);
  if (events.length === 1) redirect(`/portal/${events[0].slug}`);

  return (
    <main className={styles.main}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Your private atria</h1>
        <p className={styles.pageLead}>
          {events.length === 0
            ? 'No assembly has entered your name in its rolls. Open a magistrate’s sealed link or ask to be summoned.'
            : 'Choose the assembly before which you will speak.'}
        </p>
      </div>

      <div className={styles.typeGrid}>
        {events.map((event) => (
          <Link key={event.id} href={`/portal/${event.slug}`} className={styles.typeCard}>
            <div className={styles.typeLabel}>{event.name}</div>
            <div className={styles.typeDescription}>{event.tagline ?? 'Enter your atrium'}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
