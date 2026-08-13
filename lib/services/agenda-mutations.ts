import { eq, sql } from 'drizzle-orm';
import { getDb, type Database } from '@/db/client';
import { event, scheduledSession } from '@/db/schema';
import { appUrl } from '@/lib/env';
import { sendSessionInvites, type RecipientGraph } from '@/lib/services/comms';

type AgendaDb = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/** `S-5`: the per-event counter is read and bumped in one statement so two writes cannot share a ref. */
export async function allocateSessionRef(
  eventId: string,
  database: AgendaDb = getDb(),
): Promise<number> {
  const [row] = await database
    .update(event)
    .set({ sessionSeq: sql`${event.sessionSeq} + 1`, updatedAt: new Date() })
    .where(eq(event.id, eventId))
    .returning({ ref: event.sessionSeq });
  if (!row) throw new Error('That event could not be found');
  return row.ref;
}

/** A calendar update replaces its predecessor only while the UID remains stable for the row. */
export function mintIcsUid(): string {
  const host = appUrl().replace(/^https?:\/\//, '').split('/')[0] || 'cicero.local';
  return `${crypto.randomUUID()}@${host}`;
}

export async function notifyIfPublished(
  sessionId: string,
  options: { cancel?: boolean } = {},
  graph?: RecipientGraph,
) {
  const row = await getDb().query.scheduledSession.findFirst({
    where: eq(scheduledSession.id, sessionId),
  });
  if (!row) return;
  if (options.cancel) {
    await sendSessionInvites(sessionId, { cancel: true }, graph);
    return;
  }
  if (row.status !== 'published') return;
  await sendSessionInvites(sessionId, {}, graph);
}

export async function cancelPublishedSessionBeforeMutation(eventId: string, sessionId: string) {
  const row = await getDb().query.scheduledSession.findFirst({
    where: eq(scheduledSession.id, sessionId),
  });
  if (row?.eventId !== eventId || row.status !== 'published' || !row.startsAt) return;
  await sendSessionInvites(sessionId, { cancel: true });
}
