import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { sponsor } from '../../db/schema';
import type { EventContext } from '../context';
import { requireCapability } from '../context';
import { conflict, invalid, notFound } from '../errors';
import { positionDrift, positionsForReorder, type Positioned } from './settings';

/**
 * `E-7`: the organisations backing an event. Modelled and administered exactly like the taxonomy
 * lists in `settings.ts` — event-scoped, ordered, unique by name — because a sponsor list is the
 * same shape of thing as a track list and inventing a second set of conventions for it would only
 * make two surfaces behave differently for no reason.
 *
 * The two places it departs from that file are deliberate:
 *
 *  - **Nothing depends on a sponsor.** No other table carries a `sponsor_id`, so a delete cannot
 *    silently blank a field on forty rows and none of `settings.ts`'s dependent-counting,
 *    `reassignTo` or `force` machinery is needed. If a sponsor is ever attached to a session, that
 *    reasoning has to come back with it.
 *  - **Order is per kind.** Sponsors and exhibitors are ranked against their own sort, so an
 *    organizer ordering the sponsor wall by tier does not have exhibitors interleaved through the
 *    positions.
 *
 * Writes need `event:manage`, like every other event-configuration write. Reads are open to anyone
 * in the event, matching `settings.ts`.
 */

export const SPONSOR_KINDS = ['sponsor', 'exhibitor'] as const;
export const SPONSOR_STATUSES = ['draft', 'published'] as const;

export type SponsorKind = (typeof SPONSOR_KINDS)[number];
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export function isSponsorKind(value: string): value is SponsorKind {
  return (SPONSOR_KINDS as readonly string[]).includes(value);
}

/**
 * Singular nouns for messages, so a refusal reads "an exhibitor" rather than "a sponsor" — or,
 * before this was a map, "a exhibitor". The article is carried with the noun because both messages
 * below need it and neither should be re-deriving it.
 */
const NOUN: Record<SponsorKind, { one: string; article: string }> = {
  sponsor: { one: 'sponsor', article: 'a sponsor' },
  exhibitor: { one: 'exhibitor', article: 'an exhibitor' },
};

export type SponsorRecord = {
  id: string;
  kind: SponsorKind;
  status: SponsorStatus;
  name: string;
  tier: string | null;
  websiteUrl: string | null;
  description: string | null;
  boothLocation: string | null;
  logoFileId: string | null;
  position: number;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const name = z.string().trim().min(1, 'Name is required').max(120);

// `error`, not Zod 3's `errorMap`; same single override, and the only two `z.enum` calls in the
// codebase that customise their message.
const kind = z.enum(SPONSOR_KINDS, { error: () => 'Choose sponsor or exhibitor' });

export const sponsorStatusInput = z.enum(SPONSOR_STATUSES, {
  error: () => 'Choose draft or published',
});

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null)
    .nullable()
    .optional();

/**
 * The same treatment `event.websiteUrl` gets, and for the same reason: a scheme is added when the
 * organizer omitted one, because people type `example.com`, and the result is then held to
 * `http`/`https`, because this value is rendered as a link and a `javascript:` URL there is a
 * stored XSS.
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
  .optional();

/** A logo is a row in `file`; the column holds a bare uuid, so this is all that can be checked. */
const logoFileId = z
  .string()
  .trim()
  .transform((value) => value || null)
  .refine((value) => value === null || UUID.test(value), 'That is not a file reference')
  .nullable()
  .optional();

export const sponsorInput = z.object({
  kind,
  name,
  tier: optionalText(60, 'Keep the tier short'),
  websiteUrl,
  description: optionalText(2000, 'That description is too long'),
  boothLocation: optionalText(120, 'Keep the booth location short'),
  logoFileId,
});

export type SponsorInput = z.input<typeof sponsorInput>;

/** Zod's field-keyed issues become `AppError.details`, which the Server Action shows inline. */
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

// ---------------------------------------------------------------------------
// Ordering — per (event, kind)
// ---------------------------------------------------------------------------

async function readPositions(eventId: string, forKind: SponsorKind): Promise<Positioned[]> {
  const rows = await getDb()
    .select({ id: sponsor.id, position: sponsor.position })
    .from(sponsor)
    .where(and(eq(sponsor.eventId, eventId), eq(sponsor.kind, forKind)))
    .orderBy(asc(sponsor.position), asc(sponsor.createdAt));
  return rows.map((row) => ({ id: row.id, position: row.position }));
}

async function writePositions(rows: Positioned[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await Promise.all(
    rows.map((row) =>
      db.update(sponsor).set({ position: row.position }).where(eq(sponsor.id, row.id)),
    ),
  );
}

async function nextPosition(eventId: string, forKind: SponsorKind): Promise<number> {
  return (await readPositions(eventId, forKind)).length;
}

/** Called after every delete so the list stays 0..n-1 and a later insert cannot collide. */
async function compactPositions(eventId: string, forKind: SponsorKind): Promise<void> {
  const rows = await readPositions(eventId, forKind);
  const next = positionsForReorder(rows, []);
  await writePositions(positionDrift(rows, next));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function toRecord(row: typeof sponsor.$inferSelect): SponsorRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    name: row.name,
    tier: row.tier,
    websiteUrl: row.websiteUrl,
    description: row.description,
    boothLocation: row.boothLocation,
    logoFileId: row.logoFileId,
    position: row.position,
  };
}

/**
 * Both kinds in one read, ordered so the caller can group without a second query. `kind` leads the
 * sort only to keep the two blocks contiguous; within a kind the organizer's order is what shows.
 */
export async function listSponsors(ctx: EventContext): Promise<SponsorRecord[]> {
  const rows = await getDb()
    .select()
    .from(sponsor)
    .where(eq(sponsor.eventId, ctx.eventId))
    .orderBy(asc(sponsor.kind), asc(sponsor.position), asc(sponsor.createdAt));
  return rows.map(toRecord);
}

// ---------------------------------------------------------------------------
// The public reads
// ---------------------------------------------------------------------------

/**
 * The three functions below back the public sponsor wall, and are the only ones in this file a
 * stranger can reach. They take an event id rather than an `EventContext` precisely because there is
 * no context to construct: an unauthenticated request has no membership, so the parameter has to be
 * the thing the route already proved from the slug in the path.
 *
 * All three predicates include `status = published`. Keeping that boundary in the service makes the
 * wall, nav, API, embeds, and logo bytes fail closed together when an organizer returns a row to
 * draft.
 */

/** Both kinds, in the organizer's order, exactly as `listSponsors` returns them for the board. */
export async function listPublicSponsors(eventId: string): Promise<SponsorRecord[]> {
  const rows = await getDb()
    .select()
    .from(sponsor)
    .where(and(eq(sponsor.eventId, eventId), eq(sponsor.status, 'published')))
    .orderBy(asc(sponsor.kind), asc(sponsor.position), asc(sponsor.createdAt));
  return rows.map(toRecord);
}

/**
 * Whether the microsite should carry a Sponsors tab at all. Existence rather than a count, because
 * the chrome runs this on every public page render and the answer it needs is a boolean — an event
 * with no sponsors must not grow a tab onto an empty page.
 */
export async function eventHasSponsors(eventId: string): Promise<boolean> {
  const row = await getDb().query.sponsor.findFirst({
    columns: { id: true },
    where: and(eq(sponsor.eventId, eventId), eq(sponsor.status, 'published')),
  });
  return Boolean(row);
}

/**
 * The access boundary behind `/[slug]/sponsors/logo/[fileId]`, kept here rather than inlined in the
 * route so there is exactly one definition of what that route may serve.
 *
 * This is a structural proof in the sense `app/(public)/[slug]/branding/[fileId]` means it: the
 * answer is true only when `fileId` is *currently* sitting in the `logo_file_id` slot of a sponsor
 * row on this event. Nothing about the caller is consulted and nothing about the file is trusted —
 * a file id from another event fails the `eventId` half, and a file id on this event that is a
 * headshot, a slide deck or a signed contract fails because no sponsor row points at it. Replacing a
 * logo writes a new file id into the slot, so the id this returns true for stops being servable the
 * moment it stops being the logo.
 */
export async function isPublicSponsorLogo(eventId: string, fileId: string): Promise<boolean> {
  if (!UUID.test(fileId)) return false;
  const row = await getDb().query.sponsor.findFirst({
    columns: { id: true },
    where: and(
      eq(sponsor.eventId, eventId),
      eq(sponsor.status, 'published'),
      eq(sponsor.logoFileId, fileId),
    ),
  });
  return Boolean(row);
}

async function requireSponsor(ctx: EventContext, sponsorId: string) {
  const row = await getDb().query.sponsor.findFirst({
    where: and(eq(sponsor.id, sponsorId), eq(sponsor.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That sponsor');
  return row;
}

export async function getSponsor(ctx: EventContext, sponsorId: string): Promise<SponsorRecord> {
  return toRecord(await requireSponsor(ctx, sponsorId));
}

/**
 * `sponsor_event_kind_name` is unique, so the collision is caught here and reported against the
 * field rather than surfacing as a driver error.
 */
async function assertNameFree(
  ctx: EventContext,
  forKind: SponsorKind,
  value: string,
  exceptId?: string,
) {
  const clash = await getDb().query.sponsor.findFirst({
    where: and(
      eq(sponsor.eventId, ctx.eventId),
      eq(sponsor.kind, forKind),
      eq(sponsor.name, value),
    ),
  });
  if (clash && clash.id !== exceptId) {
    const [first, ...rest] = NOUN[forKind].article;
    throw conflict(`${first.toUpperCase()}${rest.join('')} called ${value} already exists`, {
      name: 'Already in use',
    });
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createSponsor(
  ctx: EventContext,
  input: SponsorInput,
): Promise<SponsorRecord> {
  requireCapability(ctx, 'event:manage');
  const values = parse(sponsorInput, input);
  await assertNameFree(ctx, values.kind, values.name);
  const [created] = await getDb()
    .insert(sponsor)
    .values({
      eventId: ctx.eventId,
      kind: values.kind,
      name: values.name,
      tier: values.tier ?? null,
      websiteUrl: values.websiteUrl ?? null,
      description: values.description ?? null,
      boothLocation: values.boothLocation ?? null,
      logoFileId: values.logoFileId ?? null,
      position: await nextPosition(ctx.eventId, values.kind),
    })
    .returning();
  return toRecord(created);
}

/**
 * A patch, so an unsent key is left alone rather than blanked — the upload route sets nothing but
 * `logoFileId`, and the form sends only the fields the organizer actually touched.
 *
 * Changing `kind` moves the row between two independently-ordered lists, so it lands at the end of
 * the new one. Leaving the old position would drop it into the middle of a list it has never been
 * ranked against, and collide with whatever already holds that slot.
 */
export async function updateSponsor(
  ctx: EventContext,
  sponsorId: string,
  patch: Partial<SponsorInput>,
): Promise<SponsorRecord> {
  requireCapability(ctx, 'event:manage');
  const existing = await requireSponsor(ctx, sponsorId);
  const values = parse(sponsorInput.partial(), patch);

  const nextKind = values.kind ?? existing.kind;
  const nextName = values.name ?? existing.name;
  if (values.kind !== undefined || values.name !== undefined) {
    await assertNameFree(ctx, nextKind, nextName, sponsorId);
  }

  const moved = values.kind !== undefined && values.kind !== existing.kind;
  const [updated] = await getDb()
    .update(sponsor)
    .set(moved ? { ...values, position: await nextPosition(ctx.eventId, nextKind) } : values)
    .where(eq(sponsor.id, sponsorId))
    .returning();

  if (moved) await compactPositions(ctx.eventId, existing.kind);
  return toRecord(updated);
}

/** Publication is a deliberate organizer action, separate from editing descriptive fields. */
export async function setSponsorStatus(
  ctx: EventContext,
  sponsorId: string,
  status: SponsorStatus,
): Promise<SponsorRecord> {
  requireCapability(ctx, 'event:manage');
  const existing = await requireSponsor(ctx, sponsorId);
  const next = parse(sponsorStatusInput, status);
  if (existing.status === next) return toRecord(existing);

  const [updated] = await getDb()
    .update(sponsor)
    .set({ status: next })
    .where(and(eq(sponsor.id, sponsorId), eq(sponsor.eventId, ctx.eventId)))
    .returning();
  return toRecord(updated);
}

/**
 * No dependent check and no `reassignTo`: nothing in the schema points at a sponsor, so the delete
 * cannot strand a reference the way removing a track can.
 */
export async function removeSponsor(ctx: EventContext, sponsorId: string): Promise<void> {
  requireCapability(ctx, 'event:manage');
  const existing = await requireSponsor(ctx, sponsorId);
  await getDb().delete(sponsor).where(eq(sponsor.id, sponsorId));
  await compactPositions(ctx.eventId, existing.kind);
}

/**
 * Reorders one kind's list. An id belonging to the other kind is refused rather than silently
 * merged: the two lists are ranked separately, so renumbering one from a mixed list would give it
 * the other's ranks. `positionsForReorder` would reject it too, but its message is about events and
 * would be a lie here.
 */
export async function reorderSponsors(
  ctx: EventContext,
  forKind: SponsorKind,
  orderedIds: string[],
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  if (!isSponsorKind(forKind)) throw invalid('That is not a sponsor list');

  const existing = await readPositions(ctx.eventId, forKind);
  const known = new Set(existing.map((row) => row.id));
  if (orderedIds.some((id) => !known.has(id))) {
    throw invalid(`That order lists a row that is not ${NOUN[forKind].article} on this event`);
  }

  const next = positionsForReorder(existing, orderedIds);
  await writePositions(positionDrift(existing, next));
}
