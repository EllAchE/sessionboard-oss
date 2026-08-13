import { requireEventContext } from '../../../lib/auth';
import { requireCapability, type EventContext } from '../../../lib/context';
import { currentEventId } from '../../../lib/services/events';

/**
 * `E-7`. Two gates, matching `app/admin/speakers/context.ts`: a reviewer may read the list, because
 * a sponsor is not confidential and the name shows up beside sessions anyway, but only an organizer
 * edits it. Every page, action and route in this directory starts at one of these.
 */

export async function sponsorsContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'submission:read_all');
  return ctx;
}

export async function manageSponsorsContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'event:manage');
  return ctx;
}
