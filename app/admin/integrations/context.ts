import { requireEventContext } from '@/lib/auth';
import { requireCapability, type EventContext } from '@/lib/context';
import { currentEventId } from '@/lib/services/events';

/**
 * `integration:manage` rather than a lesser gate: an API key reads every submission on the event,
 * and the sync buttons send speaker names and emails to a third party.
 */
export async function integrationContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'integration:manage');
  return ctx;
}
