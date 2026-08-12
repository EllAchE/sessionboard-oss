import { requireEventContext } from '../../../lib/auth';
import { requireCapability, type EventContext } from '../../../lib/context';
import { currentEventId } from '../../../lib/services/events';

/**
 * A reviewer may read the roster because they already read every submission on it; only an organizer
 * edits people. Every page, action and route in this directory starts at one of these two.
 */

export async function speakersContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'submission:read_all');
  return ctx;
}

export async function manageSpeakersContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'event:manage');
  return ctx;
}
