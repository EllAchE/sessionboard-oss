import { redirect } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { currentActor } from '@/lib/auth';
import { DEFAULT_TIMEZONE, addDays, zonedDateKey } from '@/lib/event-dates';
import { NewEventForm } from './NewEventForm';
import styles from './new-event.module.css';

export const metadata = { title: 'New event · Cicero' };

/**
 * `E-1`. Start and end are required, so the form opens on a plausible pair — a single day, six weeks
 * out, 09:00 to 17:00 — rather than on two empty boxes. Computed here rather than in the browser so
 * the server render and the hydration agree.
 */
function defaultWindow(now = new Date()): { startsAt: string; endsAt: string } {
  const day = addDays(zonedDateKey(now, DEFAULT_TIMEZONE), 42);
  return { startsAt: `${day}T09:00`, endsAt: `${day}T17:00` };
}

export default async function NewEventPage() {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/events/new');

  const { startsAt, endsAt } = defaultWindow();

  return (
    <main className={styles.root}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Create an event</CardTitle>
        </CardHeader>
        <CardBody>
          <NewEventForm
            defaultStartsAt={startsAt}
            defaultEndsAt={endsAt}
            defaultTimezone={DEFAULT_TIMEZONE}
          />
        </CardBody>
      </Card>
    </main>
  );
}
