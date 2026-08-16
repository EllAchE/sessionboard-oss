import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth';
import { reviewerSession } from './context';
import { ReviewerShell } from './ReviewerShell';

/**
 * `CFP-10`. Everything a reviewer can reach hangs off this layout, and it carries no organizer
 * navigation at all — no event configuration, no decisions, no organizer sections. The absence is the
 * feature: a surface that merely hides those controls still ships them to the browser.
 */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await reviewerSession();
  if (!session) {
    const actor = await currentActor();
    redirect(actor ? '/' : '/signin?next=/review');
  }

  return (
    <ReviewerShell
      eventName={session.event.name}
      actorName={session.ctx.actor.name ?? session.ctx.actor.email}
      canDecide={session.canDecide}
    >
      {children}
    </ReviewerShell>
  );
}
