import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { event } from '@/db/schema';
import {
  parseAgendaOptimizationWeights,
  type AgendaOptimizationWeights,
} from '@/lib/ai/agenda-optimizer';
import { requireCapability, type EventContext } from '@/lib/context';
import { notFound } from '@/lib/errors';

export async function saveAgendaOptimizationWeights(
  ctx: EventContext,
  value: unknown,
): Promise<AgendaOptimizationWeights> {
  requireCapability(ctx, 'agenda:manage');
  const weights = parseAgendaOptimizationWeights(value);
  const [updated] = await getDb()
    .update(event)
    .set({ agendaOptimizationWeights: weights, updatedAt: new Date() })
    .where(eq(event.id, ctx.eventId))
    .returning({ id: event.id });
  if (!updated) throw notFound('That event');
  return weights;
}
