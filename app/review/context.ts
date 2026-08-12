import { cookies } from 'next/headers';
import { currentActor } from '@/lib/auth';
import type { EventContext } from '@/lib/context';
import { can } from '@/lib/context';
import { EVENT_COOKIE, listEventsForUser, type EventSummary } from '@/lib/services/events';

/**
 * The reviewer surface resolves its own event rather than calling `currentEventId`, whose fallback
 * looks for an organizer membership — a reviewer who has never opened the admin has no event cookie
 * and no organizer row, and would be told the event does not exist.
 */
export type ReviewerSession = {
  ctx: EventContext;
  event: EventSummary;
  /** An organizer may open this surface; they keep author identity and their own admin routes. */
  canDecide: boolean;
};

export async function reviewerSession(): Promise<ReviewerSession | null> {
  const actor = await currentActor();
  if (!actor) return null;

  const events = await listEventsForUser(actor.userId);
  const reviewing = events.filter(
    (candidate) =>
      candidate.roles.includes('reviewer') || candidate.roles.includes('organizer'),
  );
  if (reviewing.length === 0) return null;

  const preferred = (await cookies()).get(EVENT_COOKIE)?.value;
  const event = reviewing.find((candidate) => candidate.id === preferred) ?? reviewing[0];
  const ctx: EventContext = { actor, eventId: event.id, roles: event.roles };

  return { ctx, event, canDecide: can(ctx, 'submission:decide') };
}
