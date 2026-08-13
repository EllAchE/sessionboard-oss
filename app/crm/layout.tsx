import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import { currentEventId, listEventsForUser } from '@/lib/services/events';
import { AdminShell } from '../admin/AdminShell';
import { CrmNav } from './CrmNav';
import styles from './crm.module.css';

/**
 * The CRM is organization-scoped, but organizer authority still comes from an event membership.
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/crm');

  const events = await listEventsForUser(actor.userId);
  const organizing = events.filter((candidate) => candidate.roles.includes('organizer'));
  if (organizing.length === 0) {
    const reviewing = events.some((candidate) => candidate.roles.includes('reviewer'));
    redirect(reviewing ? '/review' : '/portal');
  }

  let eventId = '';
  if (organizing.length > 0) {
    try {
      eventId = await currentEventId();
    } catch {
      eventId = organizing[0].id;
    }
    if (!organizing.some((candidate) => candidate.id === eventId)) eventId = organizing[0].id;
  }

  return (
    <AdminShell events={organizing} currentEventId={eventId} actorName={actor.name ?? actor.email}>
      <div className={styles.shell}>
        <CrmNav />
        {children}
      </div>
    </AdminShell>
  );
}
