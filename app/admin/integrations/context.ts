import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { membership } from '@/db/schema';
import { requireCurrentActor, requireEventContext } from '@/lib/auth';
import { requireCapability, type EventContext } from '@/lib/context';
import { notFound } from '@/lib/errors';

/**
 * Same event resolution the rest of `/admin` uses — the switcher's cookie, else the one event this
 * organizer manages — kept local so this screen does not depend on another workstream's file.
 * `integration:manage` is the gate: an API key reads every submission on the event, and the sync
 * buttons send speaker names and emails to a third party.
 */

const EVENT_COOKIE = 'cicero_event';

async function currentEventId(): Promise<string> {
  const store = await cookies();
  const fromCookie = store.get(EVENT_COOKIE)?.value;
  if (fromCookie) return fromCookie;

  const actor = await requireCurrentActor();
  const row = await getDb().query.membership.findFirst({
    where: and(eq(membership.userId, actor.userId), eq(membership.role, 'organizer')),
  });
  if (!row) throw notFound('An event you can manage');
  return row.eventId;
}

export async function integrationContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'integration:manage');
  return ctx;
}
