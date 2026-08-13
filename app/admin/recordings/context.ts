import { requireEventContext } from '@/lib/auth';
import { requireCapability } from '@/lib/context';
import { currentEventId } from '@/lib/services/events';

export async function recordingsContext() {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'agenda:manage');
  return ctx;
}
