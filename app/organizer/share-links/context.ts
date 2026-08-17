import { requireEventContext } from '@/lib/auth';
import { requireCapability, type EventContext } from '@/lib/context';
import { currentEventId } from '@/lib/services/events';

/**
 * Minting a share link hands an outsider a read of unpublished programme material, so it sits behind
 * `event:manage` — organizers only. A reviewer has `submission:read_all` and could read the same
 * rows in the product, but letting them mint a bearer URL that outlives their own session is a
 * different power, and not one the review role is for.
 */
export async function shareLinkContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'event:manage');
  return ctx;
}
