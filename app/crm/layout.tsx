import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import { currentEventId, listEventsForUser } from '@/lib/services/events';
import { AdminShell } from '../admin/AdminShell';
import { CrmNav } from './CrmNav';
import styles from './crm.module.css';

/**
 * The CRM sits above events, so unlike `/admin` it does not require one to exist. It borrows the
 * organizer shell for navigation and nothing else — no service call below this point takes an
 * event id.
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/crm');

  const events = await listEventsForUser(actor.userId);

  let eventId = '';
  if (events.length > 0) {
    try {
      eventId = await currentEventId();
    } catch {
      eventId = events[0].id;
    }
    if (!events.some((candidate) => candidate.id === eventId)) eventId = events[0].id;
  }

  return (
    <AdminShell events={events} currentEventId={eventId} actorName={actor.name ?? actor.email}>
      <div className={styles.shell}>
        <CrmNav />
        {children}
      </div>
    </AdminShell>
  );
}
