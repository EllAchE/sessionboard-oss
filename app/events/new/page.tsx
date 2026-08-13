import { redirect } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, Input } from '@/components/ui';
import { currentActor } from '@/lib/auth';
import { createEventAction } from '@/app/admin/shell-actions';
import styles from './new-event.module.css';

export const metadata = { title: 'New event · Cicero' };

export default async function NewEventPage() {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/events/new');

  return (
    <main className={styles.root}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Create an event</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={createEventAction} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <Input name="name" required placeholder="Cascadia Systems Conf 2026" />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>URL</span>
              <Input name="slug" placeholder="cascadia-2026" />
              <span className={styles.hint}>Leave blank to derive it from the name.</span>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Tagline</span>
              <Input name="tagline" placeholder="Two days on the systems we actually run" />
            </label>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>Starts</span>
                <Input name="startsOn" type="date" />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Ends</span>
                <Input name="endsOn" type="date" />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>Time zone</span>
              <Input name="timezone" defaultValue="America/Los_Angeles" />
            </label>
            <Button type="submit" variant="primary">
              Create event
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
