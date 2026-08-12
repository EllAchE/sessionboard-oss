import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '../../../db/client';
import { membership } from '../../../db/schema';
import { requireCurrentActor, requireEventContext } from '../../../lib/auth';
import { requireCapability, type EventContext } from '../../../lib/context';
import { notFound } from '../../../lib/errors';

/**
 * The admin routes carry no event in the path, so the event is resolved here: the switcher's cookie
 * if one is set, otherwise the only event this organizer manages. `requireEventContext` still does
 * the membership check, so a stale or forged cookie resolves to `not_found` rather than access.
 */

const EVENT_COOKIE = 'cicero_event';

export async function currentEventId(): Promise<string> {
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

export async function formManageContext(): Promise<EventContext> {
  const ctx = await requireEventContext(await currentEventId());
  requireCapability(ctx, 'form:manage');
  return ctx;
}
