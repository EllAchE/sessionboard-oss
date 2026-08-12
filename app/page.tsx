import { Button, Card, CardBody, CardHeader, CardDescription, CardTitle } from '@/components/ui';
import { currentActor } from '@/lib/auth';
import { listEventsForUser, listPublicEvents } from '@/lib/services/events';
import styles from './home.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Cicero' };

/**
 * The front door has to answer "where do I go" for four different people at once — an organizer
 * with events, an organizer with none, a speaker, and an attendee who only wants the programme —
 * without knowing which one is asking until the session is read.
 */
export default async function Home() {
  const actor = await currentActor();
  const [mine, published] = await Promise.all([
    actor ? listEventsForUser(actor.userId) : Promise.resolve([]),
    listPublicEvents(),
  ]);

  const organizing = mine.filter((entry) => entry.roles.includes('organizer'));
  const speaking = mine.filter(
    (entry) => !entry.roles.includes('organizer') && entry.roles.includes('speaker'),
  );
  const reviewing = mine.filter((entry) => entry.roles.includes('reviewer'));

  return (
    <main className={styles.root}>
      <div className={styles.masthead}>
        <h1 className={styles.wordmark}>Cicero</h1>
        <p className={styles.tagline}>
          Conference software for the part nobody enjoys: the call for speakers, the review, the
          agenda, and every email in between. Open source, and yours to run.
        </p>
      </div>

      <div className={styles.actions}>
        {actor ? (
          <>
            {organizing.length > 0 && (
              <Button href="/admin" variant="primary">
                Organizer dashboard
              </Button>
            )}
            {organizing.length > 0 && <Button href="/crm">Speaker database</Button>}
            {organizing.length === 0 && (
              <Button href="/events/new" variant="primary">
                Create your first event
              </Button>
            )}
            {speaking.length > 0 && <Button href="/portal">Speaker portal</Button>}
            {reviewing.length > 0 && <Button href="/review">Review queue</Button>}
            {organizing.length > 0 && <Button href="/events/new">New event</Button>}
          </>
        ) : (
          <>
            <Button href="/signin" variant="primary">
              Sign in
            </Button>
            <Button href="/signin?next=/events/new">Start an event</Button>
          </>
        )}
      </div>

      <div className={styles.panels}>
        {actor && mine.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your events</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className={styles.linkList}>
                {mine.map((entry) => (
                  <li key={entry.id} className={styles.linkRow}>
                    <a className={styles.linkName} href={`/${entry.slug}`}>
                      {entry.name}
                    </a>
                    <span className={styles.linkNote}>{entry.roles.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {published.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Public programmes</CardTitle>
              <CardDescription>
                Schedule, speakers and sessions — readable without an account.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <ul className={styles.linkList}>
                {published.map((entry) => (
                  <li key={entry.id} className={styles.linkRow}>
                    <a className={styles.linkName} href={`/${entry.slug}`}>
                      {entry.name}
                    </a>
                    <span className={styles.linkNote}>
                      {entry.tagline ?? `/${entry.slug}`}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>

      <p className={styles.footer}>
        This instance records every email it sends at <a href="/admin/mail">/admin/mail</a>, so a
        sign-in link is always readable without an inbox.
      </p>
    </main>
  );
}
