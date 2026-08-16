import { requireEventContext } from '../../../lib/auth';
import { requireCapability, type EventContext } from '../../../lib/context';
import { currentEventId } from '../../../lib/services/events';

export async function formManageContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'form:manage');
  return ctx;
}
