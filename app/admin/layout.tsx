import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import { currentEventId, listEventsForUser } from '@/lib/services/events';
import { AdminShell } from './AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/admin');

  const events = await listEventsForUser(actor.userId);
  if (events.length === 0) redirect('/events/new');

  /** A cookie pointing at a deleted or unshared event falls back rather than 404ing the whole shell. */
  let eventId: string;
  try {
    eventId = await currentEventId();
  } catch {
    eventId = events[0].id;
  }
  if (!events.some((candidate) => candidate.id === eventId)) eventId = events[0].id;

  return (
    <AdminShell events={events} currentEventId={eventId} actorName={actor.name ?? actor.email}>
      {children}
    </AdminShell>
  );
}
