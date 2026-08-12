import { requireEventContext } from '../../../lib/auth';
import { requireCapability, type EventContext } from '../../../lib/context';
import { currentEventId } from '../../../lib/services/events';

/**
 * Two gates, because the review surfaces serve two roles. A reviewer reaches the queue and the
 * scorecard; only an organizer reaches the decision controls, rounds and assignment. Every page and
 * action in this directory starts at one of these.
 */

export async function reviewContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'submission:read_all');
  return ctx;
}

export async function decideContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'submission:decide');
  return ctx;
}
