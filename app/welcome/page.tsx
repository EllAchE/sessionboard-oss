import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CiceroMark } from '@/components/CiceroBrand';
import { Button, Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { currentActor } from '@/lib/auth';
import { listEventsForUser } from '@/lib/services/events';
import { welcomeDestination } from './destination';
import styles from './welcome.module.css';

export const metadata = { title: 'Welcome · Cicero' };

/**
 * The landing an account gets before it belongs to anything.
 *
 * Sign-up used to point `next` straight at `/events/new`, and the organizer shell bounced a
 * membershipless account to the same form, so every road out of a fresh account ended on "create an
 * event" — a screen that is wrong for the majority of the people this product serves. Speakers and
 * reviewers outnumber organizers at every conference, and an invited one who signed up anyway was
 * shown the one job they were not there to do.
 *
 * So the fork is asked out loud instead. An account that already holds a membership never sees this
 * page at all: `welcomeDestination` sends it on to the surface it belongs to, which keeps a
 * bookmark of `/welcome` from becoming a dead end a returning organizer has to click through.
 */
export default async function WelcomePage() {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/welcome');

  const destination = welcomeDestination(await listEventsForUser(actor.userId));
  if (destination) redirect(destination);

  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <Link className={styles.brand} href="/" aria-label="Cicero home">
          <CiceroMark size={36} />
          <span>Cicero</span>
        </Link>

        <div className={styles.head}>
          <h1 className={styles.title}>Welcome to Cicero</h1>
          <p className={styles.lead}>
            You’re signed in as {actor.email}. Nothing is attached to this account yet.
          </p>
        </div>

        <div className={styles.choices}>
          <Card className={styles.choice}>
            <CardHeader>
              <CardTitle>Create an event</CardTitle>
              <CardDescription>
                Run a conference end to end: the call for speakers, review rounds, the agenda, and
                speaker follow-up.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <Button href="/events/new" variant="primary" fullWidth>
                Create an event
              </Button>
            </CardBody>
          </Card>

          {/*
            Not a link, because there is nothing here for this person to click. The account they
            need already exists on the organizer's side; what they are missing is the message, and
            the only two ways out of that are their inbox and their organizer.
          */}
          <Card className={styles.choice}>
            <CardHeader>
              <CardTitle>I was invited to speak or review</CardTitle>
              <CardDescription>
                Then you don’t need to set anything up. Speakers and reviewers get their own link by
                email, and opening it puts you straight into your portal or your review queue.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <p className={styles.hint}>
                Check the inbox for {actor.email}, including spam. If there’s nothing there, ask your
                organizer to send the invitation again, or to check which address they used.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </main>
  );
}
