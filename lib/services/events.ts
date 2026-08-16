import { desc, eq, inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { event, membership } from '@/db/schema';
import { grantRole, requireCurrentActor } from '@/lib/auth';
import { requireEventContext } from '@/lib/auth';
import type { EventContext, MembershipRole } from '@/lib/context';
import { requireCapability } from '@/lib/context';
import { conflict, invalid, notFound } from '@/lib/errors';
import {
  DEFAULT_TIMEZONE,
  isValidTimezone,
  resolveEventWindow,
  utcToLocalInput,
  type EventWindow,
} from '@/lib/event-dates';
import { slugify } from '@/lib/ids';

/**
 * Organizer routes carry no event in their path, so the current event travels in a cookie. Putting it
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
  /** The instants. `startsOn` / `endsOn` are their date-only projection into `timezone`. */
  startsAt: Date;
  endsAt: Date;
  startsOn: string;
  endsOn: string;
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
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    roles: byEvent.get(row.id) ?? [],
  }));
}

/**
 * Which event the organizer shell opens on when the cookie says nothing. The edition someone is running
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
 * The cookie's raw value, for the organizer pages that carry no event segment and check membership
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
    startsAt: row.startsAt,
    endsAt: row.endsAt,
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

// ---------------------------------------------------------------------------
// `E-1`, `E-2` — what an event write may say
// ---------------------------------------------------------------------------

/**
 * There was no validation on this path at all: `createEvent` checked a name and a slug, the settings
 * action carried a lone `endsOn < startsOn` comparison that a blank date skipped, and the create form
 * had neither. Both paths now run the same schema, so a rule cannot hold on one screen and not the
 * other.
 *
 * `startsAt` / `endsAt` arrive as wall-clock readings — `2026-10-12T09:00`, exactly what a
 * `datetime-local` input submits — and are interpreted in the event's own timezone rather than the
 * browser's. `resolveEventWindow` turns the pair into the two instants and their date-only
 * projection; nothing else in the codebase writes those four columns.
 */

/** Blank means "clear it". A field the caller omitted is left alone; see `updateEvent`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((value) => value || null)
    .nullable()
    .transform((value) => value ?? null);

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

const wallClock = (what: string) =>
  z
    .string()
    .trim()
    .regex(WALL_CLOCK, `Give a ${what} date and time`);

/**
 * `websiteUrl` gets a scheme when the organizer omitted one — people type `example.com` — and is
 * then held to `http`/`https`, because the value is rendered as a link on the public page and a
 * `javascript:` URL there is a stored XSS.
 */
const websiteUrl = z
  .string()
  .trim()
  .transform((value) => (value && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value))
  .refine((value) => {
    if (!value) return true;
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'Give a full web address, like https://example.com')
  .transform((value) => value || null)
  .nullable()
  .transform((value) => value ?? null);

const timezoneField = z
  .string()
  .trim()
  .refine(isValidTimezone, 'Use an IANA timezone name, like America/Los_Angeles');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fileRef = z
  .string()
  .trim()
  .nullable()
  .transform((value) => value || null)
  .refine((value) => value === null || UUID.test(value), 'That is not a file reference');

const eventName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(200, 'Keep the name under 200 characters');

/** The metadata half of `E-2`. Shared by create and update; every field is optional on both. */
const metadataShape = {
  tagline: optionalText(200),
  descriptionMarkdown: optionalText(20_000),
  eventType: optionalText(80),
  theme: optionalText(4_000),
  websiteUrl,
  venueName: optionalText(200),
  venueAddress: optionalText(400),
  logoFileId: fileRef,
  bannerFileId: fileRef,
};

/** Every key `metadataShape` covers, for the patch builder. */
const METADATA_KEYS = Object.keys(metadataShape);

const createEventSchema = z.object({
  name: eventName,
  slug: z.string().trim().max(200).nullable().optional(),
  timezone: timezoneField.default(DEFAULT_TIMEZONE),
  startsAt: wallClock('start'),
  endsAt: wallClock('end'),
  tagline: metadataShape.tagline.optional(),
  descriptionMarkdown: metadataShape.descriptionMarkdown.optional(),
  eventType: metadataShape.eventType.optional(),
  theme: metadataShape.theme.optional(),
  websiteUrl: metadataShape.websiteUrl.optional(),
  venueName: metadataShape.venueName.optional(),
  venueAddress: metadataShape.venueAddress.optional(),
  logoFileId: metadataShape.logoFileId.optional(),
  bannerFileId: metadataShape.bannerFileId.optional(),
});

const updateEventSchema = z
  .object({
    name: eventName,
    timezone: timezoneField,
    startsAt: wallClock('start'),
    endsAt: wallClock('end'),
    ...metadataShape,
  })
  .partial();

/** Exported for the tests: the write path's rules should be checkable without a database. */
export const eventWriteSchemas = { create: createEventSchema, update: updateEventSchema };

export type CreateEventInput = {
  name: string;
  slug?: string | null;
  timezone?: string | null;
  /** Wall clock in `timezone`, `YYYY-MM-DDTHH:mm`. Required — `E-1`. */
  startsAt: string;
  endsAt: string;
  tagline?: string | null;
  descriptionMarkdown?: string | null;
  eventType?: string | null;
  theme?: string | null;
  websiteUrl?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  logoFileId?: string | null;
  bannerFileId?: string | null;
};

export type UpdateEventInput = Partial<CreateEventInput>;

/** Zod's field-keyed issues become `AppError.details`, which the panels show under the field. */
function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !details[key]) details[key] = issue.message;
  }
  const first = result.error.issues[0];
  throw invalid(first?.message ?? 'That is not valid', details);
}

/** Only the keys the caller actually sent, so an update patches rather than blanks. */
function metadataPatch(values: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of METADATA_KEYS) {
    if (values[key] !== undefined) patch[key] = values[key];
  }
  return patch;
}

function windowOrThrow(timezone: string, startsAt: string, endsAt: string): EventWindow {
  const resolved = resolveEventWindow(timezone, startsAt, endsAt);
  if (!resolved.ok) {
    throw invalid(resolved.problem.message, { [resolved.problem.field]: resolved.problem.message });
  }
  return resolved.window;
}

/**
 * The cold-start path: a judge arrives with no account, signs in, and lands here. The creator is
 * made owner and organizer in the same breath, because an event nobody can administer is a dead end.
 */
export async function createEvent(userId: string, input: CreateEventInput) {
  const db = getDb();
  const values = parse(createEventSchema, input);

  const slug = slugify(values.slug?.trim() || values.name);
  if (!slug) throw invalid('That name does not make a usable URL', { slug: 'Choose a different name' });

  const taken = await db.query.event.findFirst({ where: eq(event.slug, slug) });
  if (taken) throw conflict(`The URL /${slug} is already taken`, { slug: 'Already in use' });

  const window = windowOrThrow(values.timezone, values.startsAt, values.endsAt);

  const [created] = await db
    .insert(event)
    .values({
      ...metadataPatch(values),
      name: values.name,
      slug,
      timezone: window.timezone,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      startsOn: window.startsOn,
      endsOn: window.endsOn,
      ownerUserId: userId,
    })
    .returning();

  await grantRole(userId, created.id, 'organizer');
  return created;
}

/**
 * Changing only the timezone keeps the wall clock, not the instant: an organizer who corrects
 * `America/Denver` to `America/Chicago` means "the doors still open at 09:00", not "shift the
 * conference an hour". The same reading is therefore re-resolved in the new zone.
 */
export async function updateEvent(ctx: EventContext, input: UpdateEventInput) {
  requireCapability(ctx, 'event:manage');
  const values = parse(updateEventSchema, input);
  const current = await getEvent(ctx.eventId);

  const patch: Record<string, unknown> = metadataPatch(values);
  if (values.name !== undefined) patch.name = values.name;

  if (values.timezone !== undefined || values.startsAt !== undefined || values.endsAt !== undefined) {
    const timezone = values.timezone ?? current.timezone;
    const window = windowOrThrow(
      timezone,
      values.startsAt ?? utcToLocalInput(current.startsAt, current.timezone),
      values.endsAt ?? utcToLocalInput(current.endsAt, current.timezone),
    );
    patch.timezone = window.timezone;
    patch.startsAt = window.startsAt;
    patch.endsAt = window.endsAt;
    patch.startsOn = window.startsOn;
    patch.endsOn = window.endsOn;
  }

  if (Object.keys(patch).length === 0) return current;

  const [updated] = await getDb().update(event).set(patch).where(eq(event.id, ctx.eventId)).returning();
  return updated;
}
