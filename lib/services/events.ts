import { and, desc, eq, inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { event, membership } from '@/db/schema';
import { grantRole, requireCurrentActor } from '@/lib/auth';
import { requireEventContext } from '@/lib/auth';
import type { EventContext, MembershipRole } from '@/lib/context';
import { requireCapability } from '@/lib/context';
import { conflict, invalid, notFound } from '@/lib/errors';
import { slugify } from '@/lib/ids';

/**
 * Admin routes carry no event in their path, so the current event travels in a cookie. Putting it
 * in the URL instead would mean every feature route learns an `[eventSlug]` segment, and the switch
 * is a rare action compared with the navigation it would tax.
 */
export const EVENT_COOKIE = 'cicero_event';

export type EventSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  timezone: string;
  startsOn: string | null;
  endsOn: string | null;
  roles: MembershipRole[];
};

export async function listEventsForUser(userId: string): Promise<EventSummary[]> {
  const db = getDb();
  const rows = await db.query.membership.findMany({ where: eq(membership.userId, userId) });
  if (rows.length === 0) return [];

  const byEvent = new Map<string, MembershipRole[]>();
  for (const row of rows) {
    byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row.role]);
  }

  const events = await db.query.event.findMany({
    where: inArray(event.id, [...byEvent.keys()]),
    orderBy: [desc(event.createdAt)],
  });

  return events.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    timezone: row.timezone,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    roles: byEvent.get(row.id) ?? [],
  }));
}

/**
 * Which event the admin shell opens on when the cookie says nothing. The edition someone is running
 * is almost always the next one to happen, so an event still ahead beats one already past, and the
 * soonest of those wins. Undated events sort last. Order within a tie is the caller's — newest
 * first, as `listEventsForUser` returns them.
 *
 * Picking arbitrarily instead, which is what a bare `findFirst` does, means an organizer with two
 * events lands on whichever row the database happened to return.
 */
export function pickDefaultEvent<T extends { startsOn: string | null }>(
  events: T[],
  today = new Date(),
): T | undefined {
  const stamp = today.toISOString().slice(0, 10);
  const upcoming = events.filter((row) => row.startsOn && row.startsOn >= stamp);
  if (upcoming.length > 0) {
    return upcoming.reduce((best, row) => (row.startsOn! < best.startsOn! ? row : best));
  }

  const past = events.filter((row) => row.startsOn);
  if (past.length > 0) {
    return past.reduce((best, row) => (row.startsOn! > best.startsOn! ? row : best));
  }
  return events[0];
}

/**
 * The cookie is a hint, never an authorisation. `requireEventContext` still checks membership, so a
 * stale or hand-edited cookie resolves to `not_found` rather than to someone else's event.
 */
export async function currentEventId(): Promise<string> {
  const store = await cookies();
  const fromCookie = store.get(EVENT_COOKIE)?.value;
  if (fromCookie) return fromCookie;

  const actor = await requireCurrentActor();
  const mine = await listEventsForUser(actor.userId);
  const fallback = pickDefaultEvent(mine.filter((row) => row.roles.includes('organizer')));
  if (!fallback) throw notFound('An event you can manage');
  return fallback.id;
}

export async function currentEventContext(): Promise<EventContext> {
  return requireEventContext(await currentEventId());
}

/**
 * The cookie's raw value, for the admin pages that carry no event segment and check membership
 * themselves. Unlike `currentEventId` it never throws, because those pages have their own empty
 * state for someone who has no events yet.
 */
export async function currentEventIdHint(): Promise<string | null> {
  const store = await cookies();
  return store.get(EVENT_COOKIE)?.value ?? null;
}

/**
 * Unauthenticated: the landing page has to offer a way into a published programme without knowing
 * who is asking. Newest first, because the edition someone wants is almost always the current one.
 */
export async function listPublicEvents(limit = 8): Promise<EventSummary[]> {
  const rows = await getDb().query.event.findMany({
    orderBy: [desc(event.createdAt)],
    limit,
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    timezone: row.timezone,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    roles: [],
  }));
}

export async function getEvent(eventId: string) {
  const row = await getDb().query.event.findFirst({ where: eq(event.id, eventId) });
  if (!row) throw notFound('Event');
  return row;
}

export async function getEventBySlug(slug: string) {
  const row = await getDb().query.event.findFirst({ where: eq(event.slug, slug) });
  if (!row) throw notFound('Event');
  return row;
}

export type CreateEventInput = {
  name: string;
  slug?: string | null;
  tagline?: string | null;
  timezone?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
};

/**
 * The cold-start path: a judge arrives with no account, signs in, and lands here. The creator is
 * made owner and organizer in the same breath, because an event nobody can administer is a dead end.
 */
export async function createEvent(userId: string, input: CreateEventInput) {
  const db = getDb();
  const name = input.name.trim();
  if (!name) throw invalid('An event needs a name', { name: 'Name is required' });

  const slug = slugify(input.slug?.trim() || name);
  if (!slug) throw invalid('That name does not make a usable URL', { slug: 'Choose a different name' });

  const taken = await db.query.event.findFirst({ where: eq(event.slug, slug) });
  if (taken) throw conflict(`The URL /${slug} is already taken`, { slug: 'Already in use' });

  const [created] = await db
    .insert(event)
    .values({
      name,
      slug,
      tagline: input.tagline?.trim() || null,
      timezone: input.timezone?.trim() || 'America/Los_Angeles',
      startsOn: input.startsOn || null,
      endsOn: input.endsOn || null,
      ownerUserId: userId,
    })
    .returning();

  await grantRole(userId, created.id, 'organizer');
  return created;
}

export async function updateEvent(ctx: EventContext, input: Partial<CreateEventInput>) {
  requireCapability(ctx, 'event:manage');
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.tagline !== undefined) patch.tagline = input.tagline?.trim() || null;
  if (input.timezone !== undefined) patch.timezone = input.timezone?.trim() || 'America/Los_Angeles';
  if (input.startsOn !== undefined) patch.startsOn = input.startsOn || null;
  if (input.endsOn !== undefined) patch.endsOn = input.endsOn || null;
  if (Object.keys(patch).length === 0) return getEvent(ctx.eventId);

  const [updated] = await getDb().update(event).set(patch).where(eq(event.id, ctx.eventId)).returning();
  return updated;
}
