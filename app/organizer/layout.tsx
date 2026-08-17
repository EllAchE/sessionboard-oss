import { redirect } from 'next/navigation';
import { HotkeyProvider } from '@/components/hotkeys/HotkeyProvider';
import { currentActor } from '@/lib/auth';
import { currentEventId, listEventsForUser } from '@/lib/services/events';
import { OrganizerShell } from './OrganizerShell';

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect('/signin?next=/organizer');

  const events = await listEventsForUser(actor.userId);
  if (events.length === 0) redirect('/events/new');

  /**
   * `CFP-10`. The organizer shell is organizer navigation end to end, so a reviewer never enters it —
   * they are sent to their own surface rather than shown controls they cannot use.
   */
  const organizing = events.filter((candidate) => candidate.roles.includes('organizer'));
  if (organizing.length === 0) {
    const reviewing = events.some((candidate) => candidate.roles.includes('reviewer'));
    redirect(reviewing ? '/review' : '/portal');
  }

  /** A cookie pointing at a deleted or unshared event falls back rather than 404ing the whole shell. */
  let eventId: string;
  try {
    eventId = await currentEventId();
  } catch {
    eventId = organizing[0].id;
  }
  if (!organizing.some((candidate) => candidate.id === eventId)) eventId = organizing[0].id;

  /**
   * The provider wraps the shell rather than living inside it, so the shell itself can register the
   * workspace-wide shortcuts through `useHotkeys` instead of having to nest a second component just
   * to reach a context it would otherwise be providing.
   */
  return (
    <HotkeyProvider>
      <OrganizerShell
        events={organizing}
        currentEventId={eventId}
        actorName={actor.name ?? actor.email}
      >
        {children}
      </OrganizerShell>
    </HotkeyProvider>
  );
}
