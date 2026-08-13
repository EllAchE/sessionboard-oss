import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client';
import {
  fieldLibraryEntry,
  fieldType,
  formField,
  persona,
  portalTheme,
  room,
  scheduledSession,
  sessionFormat,
  submission,
  submissionTag,
  tag,
  track,
  user,
} from '../../db/schema';
import type { EventContext } from '../context';
import { requireCapability } from '../context';
import { conflict, invalid, notFound } from '../errors';
import { e164PhoneInput } from '../phone';
import { normalizeAccent } from '../portal-appearance';
import {
  blockSmsBeforePreferenceChange,
  grantSmsAfterPreferenceChange,
} from '../sms/consent';

/**
 * `E-1`–`E-5`: the six lists every other surface picks from. Nothing here is interesting on its
 * own — a track is a name and a colour — but the CFP form, the review queue and the agenda all
 * join against these rows, so the two hard parts are deletion and ordering.
 *
 * Every write needs `event:manage`. Reads are open to anyone in the event, because a reviewer's
 * queue filters by track and a speaker's portal shows a format name.
 */

// ---------------------------------------------------------------------------
// Deletion policy — see tasks/W10-notes.md
// ---------------------------------------------------------------------------

/**
 * Every foreign key into this taxonomy is `on delete set null`, so a bare `DELETE` succeeds and
 * silently blanks the track on forty scheduled sessions. That is unrecoverable: nothing records
 * what the value was, and the organizer finds out when the printed agenda has a hole in it.
 *
 * So a delete with dependents is refused, and the refusal names the count. Refusing costs one
 * extra click when the row really is disposable; nulling costs an afternoon of re-tagging when it
 * was not. Two escapes exist because refusing outright would otherwise strand a typo'd row:
 * `reassignTo` moves the dependents to a sibling first (the lossless path, and the one the UI
 * offers by default), and `force` accepts the blanking after the count has been shown.
 */
export type RemoveOptions = {
  /** Move dependents onto this sibling row before deleting. Lossless. */
  reassignTo?: string | null;
  /** Delete anyway, blanking the reference on every dependent row. */
  force?: boolean;
};

export type Dependent = { noun: string; count: number };

/** "3 sessions and 1 submission" — the count is the whole point of the message. */
export function describeDependents(dependents: Dependent[]): string | null {
  const live = dependents.filter((entry) => entry.count > 0);
  if (live.length === 0) return null;
  const parts = live.map((entry) => `${entry.count} ${entry.noun}${entry.count === 1 ? '' : 's'}`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function totalDependents(dependents: Dependent[]): number {
  return dependents.reduce((sum, entry) => sum + entry.count, 0);
}

export function assertRemovable(
  what: string,
  dependents: Dependent[],
  options: RemoveOptions = {},
): void {
  if (options.force) return;
  const summary = describeDependents(dependents);
  if (!summary) return;
  throw conflict(`That ${what} is still used by ${summary}`, {
    dependents: String(totalDependents(dependents)),
  });
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export type Positioned = { id: string; position: number };

/**
 * A reorder renumbers the whole list rather than patching the moved row, because `position`
 * arrives with duplicates and gaps from every import path and a relative move on top of that is
 * not deterministic. Ids the caller left out keep their relative order and settle after the ones
 * it named, so a stale tab that posts a short list cannot drop rows off the end.
 */
export function positionsForReorder(existing: Positioned[], requestedIds: string[]): Positioned[] {
  const known = new Map(existing.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of requestedIds) {
    if (!known.has(id)) throw invalid('That list contains a row from another event');
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  const rest = [...existing]
    .sort((a, b) => a.position - b.position)
    .filter((row) => !seen.has(row.id))
    .map((row) => row.id);

  return [...ordered, ...rest].map((id, index) => ({ id, position: index }));
}

/** Rows whose stored position differs from the one they should hold. */
export function positionDrift(existing: Positioned[], next: Positioned[]): Positioned[] {
  const before = new Map(existing.map((row) => [row.id, row.position]));
  return next.filter((row) => before.get(row.id) !== row.position);
}

type PositionedTable = typeof track | typeof room | typeof sessionFormat | typeof persona;

async function readPositions(table: PositionedTable, eventId: string): Promise<Positioned[]> {
  const rows = await getDb()
    .select({ id: table.id, position: table.position })
    .from(table)
    .where(eq(table.eventId, eventId))
    .orderBy(asc(table.position), asc(table.createdAt));
  return rows.map((row) => ({ id: row.id, position: row.position }));
}

async function writePositions(table: PositionedTable, rows: Positioned[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await Promise.all(
    rows.map((row) => db.update(table).set({ position: row.position }).where(eq(table.id, row.id))),
  );
}

async function nextPosition(table: PositionedTable, eventId: string): Promise<number> {
  const rows = await readPositions(table, eventId);
  return rows.length;
}

/** Called after every delete so the list stays 0..n-1 and a later insert cannot collide. */
async function compactPositions(table: PositionedTable, eventId: string): Promise<void> {
  const rows = await readPositions(table, eventId);
  const next = positionsForReorder(rows, []);
  await writePositions(table, positionDrift(rows, next));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type CountableTable =
  | typeof submission
  | typeof scheduledSession
  | typeof submissionTag
  | typeof formField;

async function countRows(
  table: CountableTable,
  where: ReturnType<typeof eq>,
): Promise<number> {
  const rows = await getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(table)
    .where(where);
  return Number(rows[0]?.value ?? 0);
}

const COLOR_TOKEN = /^--[a-z][a-z0-9-]*$/;

/**
 * Colours are stored as design-token names (`--lapis-500`), never as hex. A literal would render
 * the same in light mode and become unreadable the moment the organizer flips to dark.
 */
const colorToken = z
  .string()
  .trim()
  .refine((value) => value === '' || COLOR_TOKEN.test(value), {
    message: 'Pick a colour from the palette',
  })
  .transform((value) => value || null)
  .nullable()
  .optional();

const name = z.string().trim().min(1, 'Name is required').max(120);
const description = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => value || null)
  .nullable()
  .optional();

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
// Tracks — E-1
// ---------------------------------------------------------------------------

export type TrackRecord = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  position: number;
};

export const trackInput = z.object({ name, color: colorToken, description });
export type TrackInput = z.input<typeof trackInput>;

export async function listTracks(ctx: EventContext): Promise<TrackRecord[]> {
  const rows = await getDb()
    .select()
    .from(track)
    .where(eq(track.eventId, ctx.eventId))
    .orderBy(asc(track.position), asc(track.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    position: row.position,
  }));
}

async function requireTrack(ctx: EventContext, trackId: string) {
  const row = await getDb().query.track.findFirst({
    where: and(eq(track.id, trackId), eq(track.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That track');
  return row;
}

export async function createTrack(ctx: EventContext, input: TrackInput): Promise<TrackRecord> {
  requireCapability(ctx, 'event:manage');
  const values = parse(trackInput, input);
  await assertTrackNameFree(ctx, values.name);
  const [created] = await getDb()
    .insert(track)
    .values({
      eventId: ctx.eventId,
      name: values.name,
      color: values.color ?? null,
      description: values.description ?? null,
      position: await nextPosition(track, ctx.eventId),
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    color: created.color,
    description: created.description,
    position: created.position,
  };
}

export async function updateTrack(
  ctx: EventContext,
  trackId: string,
  patch: Partial<TrackInput>,
): Promise<TrackRecord> {
  requireCapability(ctx, 'event:manage');
  await requireTrack(ctx, trackId);
  const values = parse(trackInput.partial(), patch);
  if (values.name !== undefined) await assertTrackNameFree(ctx, values.name, trackId);
  const [updated] = await getDb()
    .update(track)
    .set(values)
    .where(eq(track.id, trackId))
    .returning();
  return {
    id: updated.id,
    name: updated.name,
    color: updated.color,
    description: updated.description,
    position: updated.position,
  };
}

export async function trackDependents(trackId: string): Promise<Dependent[]> {
  const [submissions, sessions] = await Promise.all([
    countRows(submission, eq(submission.trackId, trackId)),
    countRows(scheduledSession, eq(scheduledSession.trackId, trackId)),
  ]);
  return [
    { noun: 'submission', count: submissions },
    { noun: 'scheduled session', count: sessions },
  ];
}

export async function removeTrack(
  ctx: EventContext,
  trackId: string,
  options: RemoveOptions = {},
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  await requireTrack(ctx, trackId);

  if (options.reassignTo) {
    if (options.reassignTo === trackId) throw invalid('Choose a different track to move them to');
    await requireTrack(ctx, options.reassignTo);
    const db = getDb();
    await db
      .update(submission)
      .set({ trackId: options.reassignTo })
      .where(eq(submission.trackId, trackId));
    await db
      .update(scheduledSession)
      .set({ trackId: options.reassignTo })
      .where(eq(scheduledSession.trackId, trackId));
  } else {
    assertRemovable('track', await trackDependents(trackId), options);
  }

  await getDb().delete(track).where(eq(track.id, trackId));
  await compactPositions(track, ctx.eventId);
}

export async function reorderTracks(ctx: EventContext, orderedIds: string[]): Promise<void> {
  requireCapability(ctx, 'event:manage');
  const existing = await readPositions(track, ctx.eventId);
  const next = positionsForReorder(existing, orderedIds);
  await writePositions(track, positionDrift(existing, next));
}

// ---------------------------------------------------------------------------
// Rooms — E-2
// ---------------------------------------------------------------------------

export type RoomRecord = {
  id: string;
  name: string;
  capacity: number | null;
  floor: string | null;
  position: number;
};

export const roomInput = z.object({
  name,
  capacity: z
    .number()
    .int('Capacity is a whole number')
    .min(0, 'Capacity cannot be negative')
    .max(1_000_000)
    .nullable()
    .optional(),
  floor: z
    .string()
    .trim()
    .max(60)
    .transform((value) => value || null)
    .nullable()
    .optional(),
});
export type RoomInput = z.input<typeof roomInput>;

export async function listRooms(ctx: EventContext): Promise<RoomRecord[]> {
  const rows = await getDb()
    .select()
    .from(room)
    .where(eq(room.eventId, ctx.eventId))
    .orderBy(asc(room.position), asc(room.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    floor: row.floor,
    position: row.position,
  }));
}

async function requireRoom(ctx: EventContext, roomId: string) {
  const row = await getDb().query.room.findFirst({
    where: and(eq(room.id, roomId), eq(room.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That room');
  return row;
}

export async function createRoom(ctx: EventContext, input: RoomInput): Promise<RoomRecord> {
  requireCapability(ctx, 'event:manage');
  const values = parse(roomInput, input);
  await assertRoomNameFree(ctx, values.name);
  const [created] = await getDb()
    .insert(room)
    .values({
      eventId: ctx.eventId,
      name: values.name,
      capacity: values.capacity ?? null,
      floor: values.floor ?? null,
      position: await nextPosition(room, ctx.eventId),
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    capacity: created.capacity,
    floor: created.floor,
    position: created.position,
  };
}

export async function updateRoom(
  ctx: EventContext,
  roomId: string,
  patch: Partial<RoomInput>,
): Promise<RoomRecord> {
  requireCapability(ctx, 'event:manage');
  await requireRoom(ctx, roomId);
  const values = parse(roomInput.partial(), patch);
  if (values.name !== undefined) await assertRoomNameFree(ctx, values.name, roomId);
  const [updated] = await getDb().update(room).set(values).where(eq(room.id, roomId)).returning();
  return {
    id: updated.id,
    name: updated.name,
    capacity: updated.capacity,
    floor: updated.floor,
    position: updated.position,
  };
}

export async function roomDependents(roomId: string): Promise<Dependent[]> {
  const sessions = await countRows(scheduledSession, eq(scheduledSession.roomId, roomId));
  return [{ noun: 'scheduled session', count: sessions }];
}

export async function removeRoom(
  ctx: EventContext,
  roomId: string,
  options: RemoveOptions = {},
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  await requireRoom(ctx, roomId);

  if (options.reassignTo) {
    if (options.reassignTo === roomId) throw invalid('Choose a different room to move them to');
    await requireRoom(ctx, options.reassignTo);
    await getDb()
      .update(scheduledSession)
      .set({ roomId: options.reassignTo })
      .where(eq(scheduledSession.roomId, roomId));
  } else {
    assertRemovable('room', await roomDependents(roomId), options);
  }

  await getDb().delete(room).where(eq(room.id, roomId));
  await compactPositions(room, ctx.eventId);
}

export async function reorderRooms(ctx: EventContext, orderedIds: string[]): Promise<void> {
  requireCapability(ctx, 'event:manage');
  const existing = await readPositions(room, ctx.eventId);
  const next = positionsForReorder(existing, orderedIds);
  await writePositions(room, positionDrift(existing, next));
}

// ---------------------------------------------------------------------------
// Session formats — E-3
// ---------------------------------------------------------------------------

export type FormatRecord = {
  id: string;
  name: string;
  durationMinutes: number;
  description: string | null;
  position: number;
};

export const formatInput = z.object({
  name,
  durationMinutes: z
    .number()
    .int('Duration is a whole number of minutes')
    .min(1, 'A format lasts at least a minute')
    .max(24 * 60, 'A format runs no longer than a day')
    .optional(),
  description,
});
export type FormatInput = z.input<typeof formatInput>;

export async function listFormats(ctx: EventContext): Promise<FormatRecord[]> {
  const rows = await getDb()
    .select()
    .from(sessionFormat)
    .where(eq(sessionFormat.eventId, ctx.eventId))
    .orderBy(asc(sessionFormat.position), asc(sessionFormat.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    durationMinutes: row.durationMinutes,
    description: row.description,
    position: row.position,
  }));
}

async function requireFormat(ctx: EventContext, formatId: string) {
  const row = await getDb().query.sessionFormat.findFirst({
    where: and(eq(sessionFormat.id, formatId), eq(sessionFormat.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That session format');
  return row;
}

export async function createFormat(ctx: EventContext, input: FormatInput): Promise<FormatRecord> {
  requireCapability(ctx, 'event:manage');
  const values = parse(formatInput, input);
  const [created] = await getDb()
    .insert(sessionFormat)
    .values({
      eventId: ctx.eventId,
      name: values.name,
      durationMinutes: values.durationMinutes ?? 30,
      description: values.description ?? null,
      position: await nextPosition(sessionFormat, ctx.eventId),
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    durationMinutes: created.durationMinutes,
    description: created.description,
    position: created.position,
  };
}

export async function updateFormat(
  ctx: EventContext,
  formatId: string,
  patch: Partial<FormatInput>,
): Promise<FormatRecord> {
  requireCapability(ctx, 'event:manage');
  await requireFormat(ctx, formatId);
  const values = parse(formatInput.partial(), patch);
  const [updated] = await getDb()
    .update(sessionFormat)
    .set(values)
    .where(eq(sessionFormat.id, formatId))
    .returning();
  return {
    id: updated.id,
    name: updated.name,
    durationMinutes: updated.durationMinutes,
    description: updated.description,
    position: updated.position,
  };
}

export async function formatDependents(formatId: string): Promise<Dependent[]> {
  const [submissions, sessions] = await Promise.all([
    countRows(submission, eq(submission.formatId, formatId)),
    countRows(scheduledSession, eq(scheduledSession.formatId, formatId)),
  ]);
  return [
    { noun: 'submission', count: submissions },
    { noun: 'scheduled session', count: sessions },
  ];
}

export async function removeFormat(
  ctx: EventContext,
  formatId: string,
  options: RemoveOptions = {},
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  await requireFormat(ctx, formatId);

  if (options.reassignTo) {
    if (options.reassignTo === formatId) throw invalid('Choose a different format to move them to');
    await requireFormat(ctx, options.reassignTo);
    const db = getDb();
    await db
      .update(submission)
      .set({ formatId: options.reassignTo })
      .where(eq(submission.formatId, formatId));
    await db
      .update(scheduledSession)
      .set({ formatId: options.reassignTo })
      .where(eq(scheduledSession.formatId, formatId));
  } else {
    assertRemovable('session format', await formatDependents(formatId), options);
  }

  await getDb().delete(sessionFormat).where(eq(sessionFormat.id, formatId));
  await compactPositions(sessionFormat, ctx.eventId);
}

export async function reorderFormats(ctx: EventContext, orderedIds: string[]): Promise<void> {
  requireCapability(ctx, 'event:manage');
  const existing = await readPositions(sessionFormat, ctx.eventId);
  const next = positionsForReorder(existing, orderedIds);
  await writePositions(sessionFormat, positionDrift(existing, next));
}

// ---------------------------------------------------------------------------
// Tags — E-4
// ---------------------------------------------------------------------------

export type TagRecord = { id: string; name: string; color: string | null };

export const tagInput = z.object({ name, color: colorToken });
export type TagInput = z.input<typeof tagInput>;

export async function listTags(ctx: EventContext): Promise<TagRecord[]> {
  const rows = await getDb()
    .select()
    .from(tag)
    .where(eq(tag.eventId, ctx.eventId))
    .orderBy(asc(tag.name));
  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
}

async function requireTag(ctx: EventContext, tagId: string) {
  const row = await getDb().query.tag.findFirst({
    where: and(eq(tag.id, tagId), eq(tag.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That tag');
  return row;
}

/** `track_event_name` is unique, so the collision is caught here and reported against the field. */
async function assertTrackNameFree(ctx: EventContext, value: string, exceptId?: string) {
  const clash = await getDb().query.track.findFirst({
    where: and(eq(track.eventId, ctx.eventId), eq(track.name, value)),
  });
  if (clash && clash.id !== exceptId) {
    throw conflict(`A track called ${value} already exists`, { name: 'Already in use' });
  }
}

/** `room_event_name` is unique, so the collision is caught here and reported against the field. */
async function assertRoomNameFree(ctx: EventContext, value: string, exceptId?: string) {
  const clash = await getDb().query.room.findFirst({
    where: and(eq(room.eventId, ctx.eventId), eq(room.name, value)),
  });
  if (clash && clash.id !== exceptId) {
    throw conflict(`A room called ${value} already exists`, { name: 'Already in use' });
  }
}

/** `tag_event_name` is unique, so the collision is caught here and reported against the field. */
async function assertTagNameFree(ctx: EventContext, value: string, exceptId?: string) {
  const clash = await getDb().query.tag.findFirst({
    where: and(eq(tag.eventId, ctx.eventId), eq(tag.name, value)),
  });
  if (clash && clash.id !== exceptId) {
    throw conflict(`A tag called ${value} already exists`, { name: 'Already in use' });
  }
}

export async function createTag(ctx: EventContext, input: TagInput): Promise<TagRecord> {
  requireCapability(ctx, 'event:manage');
  const values = parse(tagInput, input);
  await assertTagNameFree(ctx, values.name);
  const [created] = await getDb()
    .insert(tag)
    .values({ eventId: ctx.eventId, name: values.name, color: values.color ?? null })
    .returning();
  return { id: created.id, name: created.name, color: created.color };
}

export async function updateTag(
  ctx: EventContext,
  tagId: string,
  patch: Partial<TagInput>,
): Promise<TagRecord> {
  requireCapability(ctx, 'event:manage');
  await requireTag(ctx, tagId);
  const values = parse(tagInput.partial(), patch);
  if (values.name) await assertTagNameFree(ctx, values.name, tagId);
  const [updated] = await getDb().update(tag).set(values).where(eq(tag.id, tagId)).returning();
  return { id: updated.id, name: updated.name, color: updated.color };
}

export async function tagDependents(tagId: string): Promise<Dependent[]> {
  const tagged = await countRows(submissionTag, eq(submissionTag.tagId, tagId));
  return [{ noun: 'tagged submission', count: tagged }];
}

/**
 * `submission_tag` cascades, so this one loses the labels rather than blanking a column — same
 * shape of loss, same policy. `reassignTo` re-labels instead, skipping submissions that already
 * carry the target tag so the unique pair holds.
 */
export async function removeTag(
  ctx: EventContext,
  tagId: string,
  options: RemoveOptions = {},
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  await requireTag(ctx, tagId);

  if (options.reassignTo) {
    if (options.reassignTo === tagId) throw invalid('Choose a different tag to move them to');
    await requireTag(ctx, options.reassignTo);
    const db = getDb();
    const [from, to] = await Promise.all([
      db
        .select({ submissionId: submissionTag.submissionId })
        .from(submissionTag)
        .where(eq(submissionTag.tagId, tagId)),
      db
        .select({ submissionId: submissionTag.submissionId })
        .from(submissionTag)
        .where(eq(submissionTag.tagId, options.reassignTo)),
    ]);
    const already = new Set(to.map((row) => row.submissionId));
    const moving = from.map((row) => row.submissionId).filter((id) => !already.has(id));
    if (moving.length > 0) {
      await db
        .update(submissionTag)
        .set({ tagId: options.reassignTo })
        .where(
          and(eq(submissionTag.tagId, tagId), inArray(submissionTag.submissionId, moving)),
        );
    }
  } else {
    assertRemovable('tag', await tagDependents(tagId), options);
  }

  await getDb().delete(tag).where(eq(tag.id, tagId));
}

// ---------------------------------------------------------------------------
// Personas — E-5
// ---------------------------------------------------------------------------

export type PersonaRecord = {
  id: string;
  name: string;
  description: string | null;
  position: number;
};

export const personaInput = z.object({ name, description });
export type PersonaInput = z.input<typeof personaInput>;

export async function listPersonas(ctx: EventContext): Promise<PersonaRecord[]> {
  const rows = await getDb()
    .select()
    .from(persona)
    .where(eq(persona.eventId, ctx.eventId))
    .orderBy(asc(persona.position), asc(persona.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    position: row.position,
  }));
}

async function requirePersona(ctx: EventContext, personaId: string) {
  const row = await getDb().query.persona.findFirst({
    where: and(eq(persona.id, personaId), eq(persona.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That persona');
  return row;
}

export async function createPersona(
  ctx: EventContext,
  input: PersonaInput,
): Promise<PersonaRecord> {
  requireCapability(ctx, 'event:manage');
  const values = parse(personaInput, input);
  const [created] = await getDb()
    .insert(persona)
    .values({
      eventId: ctx.eventId,
      name: values.name,
      description: values.description ?? null,
      position: await nextPosition(persona, ctx.eventId),
    })
    .returning();
  return {
    id: created.id,
    name: created.name,
    description: created.description,
    position: created.position,
  };
}

export async function updatePersona(
  ctx: EventContext,
  personaId: string,
  patch: Partial<PersonaInput>,
): Promise<PersonaRecord> {
  requireCapability(ctx, 'event:manage');
  await requirePersona(ctx, personaId);
  const values = parse(personaInput.partial(), patch);
  const [updated] = await getDb()
    .update(persona)
    .set(values)
    .where(eq(persona.id, personaId))
    .returning();
  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    position: updated.position,
  };
}

export async function personaDependents(personaId: string): Promise<Dependent[]> {
  const submissions = await countRows(submission, eq(submission.personaId, personaId));
  return [{ noun: 'submission', count: submissions }];
}

export async function removePersona(
  ctx: EventContext,
  personaId: string,
  options: RemoveOptions = {},
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  await requirePersona(ctx, personaId);

  if (options.reassignTo) {
    if (options.reassignTo === personaId) {
      throw invalid('Choose a different persona to move them to');
    }
    await requirePersona(ctx, options.reassignTo);
    await getDb()
      .update(submission)
      .set({ personaId: options.reassignTo })
      .where(eq(submission.personaId, personaId));
  } else {
    assertRemovable('persona', await personaDependents(personaId), options);
  }

  await getDb().delete(persona).where(eq(persona.id, personaId));
  await compactPositions(persona, ctx.eventId);
}

export async function reorderPersonas(ctx: EventContext, orderedIds: string[]): Promise<void> {
  requireCapability(ctx, 'event:manage');
  const existing = await readPositions(persona, ctx.eventId);
  const next = positionsForReorder(existing, orderedIds);
  await writePositions(persona, positionDrift(existing, next));
}

// ---------------------------------------------------------------------------
// Field library — E-5
// ---------------------------------------------------------------------------

export const FIELD_TYPE_VALUES = fieldType.enumValues;
export type FieldTypeValue = (typeof FIELD_TYPE_VALUES)[number];

export type FieldLibraryRecord = {
  id: string;
  key: string;
  label: string;
  type: FieldTypeValue;
  helpText: string | null;
  options: string[] | null;
};

/** The key is what a form field inherits and what an export column is named, so it stays terse. */
const fieldKey = z
  .string()
  .trim()
  .min(1, 'Key is required')
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, 'Lower case letters, digits and underscores, starting with a letter');

export const fieldEntryInput = z.object({
  key: fieldKey,
  label: z.string().trim().min(1, 'Label is required').max(160),
  type: z.enum(FIELD_TYPE_VALUES),
  helpText: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || null)
    .nullable()
    .optional(),
  options: z
    .array(z.string().trim().min(1))
    .max(100)
    .transform((values) => (values.length > 0 ? values : null))
    .nullable()
    .optional(),
});
export type FieldEntryInput = z.input<typeof fieldEntryInput>;

/** Only these render a list of choices; anything else stores `null` however the caller asked. */
const CHOICE_TYPES = new Set<FieldTypeValue>(['select', 'multi_select', 'radio']);

export function typeTakesOptions(type: FieldTypeValue): boolean {
  return CHOICE_TYPES.has(type);
}

export async function listFieldEntries(ctx: EventContext): Promise<FieldLibraryRecord[]> {
  const rows = await getDb()
    .select()
    .from(fieldLibraryEntry)
    .where(eq(fieldLibraryEntry.eventId, ctx.eventId))
    .orderBy(asc(fieldLibraryEntry.key));
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    helpText: row.helpText,
    options: row.options,
  }));
}

async function requireFieldEntry(ctx: EventContext, entryId: string) {
  const row = await getDb().query.fieldLibraryEntry.findFirst({
    where: and(eq(fieldLibraryEntry.id, entryId), eq(fieldLibraryEntry.eventId, ctx.eventId)),
  });
  if (!row) throw notFound('That library field');
  return row;
}

async function assertFieldKeyFree(ctx: EventContext, value: string, exceptId?: string) {
  const clash = await getDb().query.fieldLibraryEntry.findFirst({
    where: and(eq(fieldLibraryEntry.eventId, ctx.eventId), eq(fieldLibraryEntry.key, value)),
  });
  if (clash && clash.id !== exceptId) {
    throw conflict(`A library field with the key ${value} already exists`, {
      key: 'Already in use',
    });
  }
}

export async function createFieldEntry(
  ctx: EventContext,
  input: FieldEntryInput,
): Promise<FieldLibraryRecord> {
  requireCapability(ctx, 'event:manage');
  const values = parse(fieldEntryInput, input);
  await assertFieldKeyFree(ctx, values.key);
  const [created] = await getDb()
    .insert(fieldLibraryEntry)
    .values({
      eventId: ctx.eventId,
      key: values.key,
      label: values.label,
      type: values.type,
      helpText: values.helpText ?? null,
      options: typeTakesOptions(values.type) ? (values.options ?? null) : null,
    })
    .returning();
  return {
    id: created.id,
    key: created.key,
    label: created.label,
    type: created.type,
    helpText: created.helpText,
    options: created.options,
  };
}

export async function updateFieldEntry(
  ctx: EventContext,
  entryId: string,
  patch: Partial<FieldEntryInput>,
): Promise<FieldLibraryRecord> {
  requireCapability(ctx, 'event:manage');
  const current = await requireFieldEntry(ctx, entryId);
  const values = parse(fieldEntryInput.partial(), patch);
  if (values.key) await assertFieldKeyFree(ctx, values.key, entryId);

  const nextType = values.type ?? current.type;
  const set: Record<string, unknown> = { ...values };
  if (values.type !== undefined || values.options !== undefined) {
    set.options = typeTakesOptions(nextType) ? (values.options ?? current.options ?? null) : null;
  }

  const [updated] = await getDb()
    .update(fieldLibraryEntry)
    .set(set)
    .where(eq(fieldLibraryEntry.id, entryId))
    .returning();
  return {
    id: updated.id,
    key: updated.key,
    label: updated.label,
    type: updated.type,
    helpText: updated.helpText,
    options: updated.options,
  };
}

export async function fieldEntryDependents(entryId: string): Promise<Dependent[]> {
  const fields = await countRows(formField, eq(formField.libraryEntryId, entryId));
  return [{ noun: 'form field', count: fields }];
}

/**
 * The gentlest of the six: `form_field.library_entry_id` is `set null`, so the question survives
 * on every form that uses it and only the link back to the library is lost. It is still refused by
 * default, because the organizer's intent when deleting is almost never "unlink twelve forms".
 */
export async function removeFieldEntry(
  ctx: EventContext,
  entryId: string,
  options: RemoveOptions = {},
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  await requireFieldEntry(ctx, entryId);
  assertRemovable('library field', await fieldEntryDependents(entryId), options);
  await getDb().delete(fieldLibraryEntry).where(eq(fieldLibraryEntry.id, entryId));
}

// ---------------------------------------------------------------------------
// Portal appearance — S-11
// ---------------------------------------------------------------------------

/**
 * `S-11`. How the speaker portal is dressed: the masthead logo, the accent, the welcome copy on the
 * portal's home screen, and the address a stuck speaker is told to write to.
 *
 * `portal_theme` had been readable and unwritable since it was created — the portal layout and the
 * branded email wrapper both read it, the seeds inserted one row per demo event, and no organizer
 * surface, action or route ever wrote one. On an event nobody seeded, the settings simply did not
 * exist. The write path is here rather than beside the read in `lib/services/portal.ts` because
 * this is organizer configuration and `portal.ts` is the speaker's own surface — the same boundary
 * that keeps task status transitions in `tasks.ts` and out of two places.
 *
 * A row is created on first save. Nothing else in the app creates one, so every read treats its
 * absence as "not configured" rather than as an error.
 */

export type PortalAppearance = {
  logoFileId: string | null;
  accentColor: string | null;
  welcomeMarkdown: string | null;
  supportEmail: string | null;
};

/**
 * Blank clears. Each key is optional and an absent one means "leave it alone", so the logo — which
 * the upload route writes on its own, without a save button — is not blanked by a form that never
 * knew about it.
 */
export const portalAppearanceInput = z.object({
  accentColor: z
    .string()
    .trim()
    .transform((value, issues) => {
      if (value === '') return null;
      const normalized = normalizeAccent(value);
      if (!normalized) {
        issues.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a hex colour like #B7391F' });
        return z.NEVER;
      }
      return normalized;
    })
    .nullable()
    .optional(),
  welcomeMarkdown: z
    .string()
    .trim()
    .max(5000, 'The welcome message is limited to 5,000 characters')
    .transform((value) => value || null)
    .nullable()
    .optional(),
  supportEmail: z
    .string()
    .trim()
    .transform((value, issues) => {
      if (value === '') return null;
      if (!z.string().email().safeParse(value).success) {
        issues.addIssue({ code: z.ZodIssueCode.custom, message: 'That is not an email address' });
        return z.NEVER;
      }
      return value.toLowerCase();
    })
    .nullable()
    .optional(),
});

export type PortalAppearanceInput = z.input<typeof portalAppearanceInput>;

const EMPTY_APPEARANCE: PortalAppearance = {
  logoFileId: null,
  accentColor: null,
  welcomeMarkdown: null,
  supportEmail: null,
};

/** Absent is a valid state, not a 404: an event nobody has dressed yet has nothing to read. */
export async function getPortalAppearance(eventId: string): Promise<PortalAppearance> {
  const row = await getDb().query.portalTheme.findFirst({
    where: eq(portalTheme.eventId, eventId),
    columns: { logoFileId: true, accentColor: true, welcomeMarkdown: true, supportEmail: true },
  });
  if (!row) return { ...EMPTY_APPEARANCE };
  // Normalised on the way out as well as on the way in: a row a seed or a hand-run `UPDATE` wrote
  // is not guaranteed to hold something an inline `style` may safely carry.
  return { ...row, accentColor: normalizeAccent(row.accentColor) };
}

/**
 * Create-or-update in one statement. `portal_theme.event_id` is unique, so the conflict clause is
 * the create path and the update path at once — two organizers saving the panel in the same second
 * cannot race a read-then-insert into a unique violation.
 */
export async function savePortalAppearance(
  ctx: EventContext,
  input: PortalAppearanceInput,
): Promise<PortalAppearance> {
  requireCapability(ctx, 'event:manage');
  const values = parse(portalAppearanceInput, input);

  const patch: Partial<PortalAppearance> = {};
  if (values.accentColor !== undefined) patch.accentColor = values.accentColor;
  if (values.welcomeMarkdown !== undefined) patch.welcomeMarkdown = values.welcomeMarkdown;
  if (values.supportEmail !== undefined) patch.supportEmail = values.supportEmail;

  return upsertAppearance(ctx.eventId, patch);
}

/**
 * The logo is written on its own rather than through the form, because it commits on selection — a
 * file input whose effect waits for a Save button is a way to lose an image. Returns the file id it
 * displaced, so the caller can delete bytes no screen can reach any more.
 */
export async function setPortalLogo(
  ctx: EventContext,
  logoFileId: string | null,
): Promise<{ previousFileId: string | null }> {
  requireCapability(ctx, 'event:manage');
  const before = await getPortalAppearance(ctx.eventId);
  await upsertAppearance(ctx.eventId, { logoFileId });
  return { previousFileId: before.logoFileId };
}

async function upsertAppearance(
  eventId: string,
  patch: Partial<PortalAppearance>,
): Promise<PortalAppearance> {
  const [row] = await getDb()
    .insert(portalTheme)
    .values({ ...EMPTY_APPEARANCE, ...patch, eventId })
    .onConflictDoUpdate({
      target: portalTheme.eventId,
      // Only the keys the caller sent. The insert fills the rest with nulls because there was
      // nothing there to keep; the update must not, or saving the copy would drop the logo.
      set: { ...patch, updatedAt: new Date() },
    })
    .returning({
      logoFileId: portalTheme.logoFileId,
      accentColor: portalTheme.accentColor,
      welcomeMarkdown: portalTheme.welcomeMarkdown,
      supportEmail: portalTheme.supportEmail,
    });
  if (!row) throw notFound('That event');
  return { ...row, accentColor: normalizeAccent(row.accentColor) };
}

// ---------------------------------------------------------------------------
// Notification preferences — an organizer's own row, same shape as the speaker
// portal's profile fields (`lib/services/portal.ts`), read/written independently
// because an organizer has no `participant` row to piggyback on.
// ---------------------------------------------------------------------------

export type NotificationPrefs = {
  phone: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
};

export const notificationPrefsInput = z
  .object({
    phone: e164PhoneInput.optional(),
    notifyEmail: z.boolean().optional(),
    notifySms: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.notifySms && !data.phone?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Add a phone number to receive SMS alerts',
      });
    }
  });
export type NotificationPrefsInput = z.input<typeof notificationPrefsInput>;

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const row = await getDb().query.user.findFirst({
    where: eq(user.id, userId),
    columns: { phone: true, notifyEmail: true, notifySms: true },
  });
  if (!row) throw notFound('Your account');
  return row;
}

export async function saveNotificationPrefs(
  userId: string,
  input: NotificationPrefsInput,
): Promise<NotificationPrefs> {
  const values = parse(notificationPrefsInput, input);
  const current = await getNotificationPrefs(userId);
  const nextPhone = values.phone !== undefined ? values.phone || null : current.phone;
  const nextSmsEnabled = Boolean(nextPhone) && (values.notifySms ?? current.notifySms);
  await blockSmsBeforePreferenceChange({
    previousPhone: current.phone,
    nextPhone,
    nextEnabled: nextSmsEnabled,
    source: 'organizer_settings',
  });
  const [updated] = await getDb()
    .update(user)
    .set({
      phone: nextPhone,
      ...(values.notifyEmail !== undefined ? { notifyEmail: values.notifyEmail } : {}),
      notifySms: nextSmsEnabled,
    })
    .where(eq(user.id, userId))
    .returning({ phone: user.phone, notifyEmail: user.notifyEmail, notifySms: user.notifySms });
  if (!updated) throw notFound('Your account');
  await grantSmsAfterPreferenceChange(nextPhone, nextSmsEnabled, 'organizer_settings');
  return updated;
}

// ---------------------------------------------------------------------------
// The whole screen in one read
// ---------------------------------------------------------------------------

export type UsageCounts = Record<string, number>;

export type SettingsSnapshot = {
  tracks: TrackRecord[];
  rooms: RoomRecord[];
  formats: FormatRecord[];
  tags: TagRecord[];
  personas: PersonaRecord[];
  fieldEntries: FieldLibraryRecord[];
  /** Dependent row counts per id, so the table can warn before a delete rather than after. */
  usage: {
    tracks: UsageCounts;
    rooms: UsageCounts;
    formats: UsageCounts;
    tags: UsageCounts;
    personas: UsageCounts;
    fieldEntries: UsageCounts;
  };
};

function tally(rows: Array<{ id: string | null; value: number }>): UsageCounts {
  const counts: UsageCounts = {};
  for (const row of rows) {
    if (!row.id) continue;
    counts[row.id] = (counts[row.id] ?? 0) + Number(row.value);
  }
  return counts;
}

/**
 * Six grouped counts rather than a count per row: a list of forty tracks would otherwise cost
 * eighty round trips to render a column of numbers.
 */
async function usageFor(eventId: string): Promise<SettingsSnapshot['usage']> {
  const db = getDb();
  const value = sql<number>`count(*)::int`;

  const [
    submissionTracks,
    sessionTracks,
    sessionRooms,
    submissionFormats,
    sessionFormats,
    taggedSubmissions,
    submissionPersonas,
    libraryFields,
  ] = await Promise.all([
    db
      .select({ id: submission.trackId, value })
      .from(submission)
      .where(eq(submission.eventId, eventId))
      .groupBy(submission.trackId),
    db
      .select({ id: scheduledSession.trackId, value })
      .from(scheduledSession)
      .where(eq(scheduledSession.eventId, eventId))
      .groupBy(scheduledSession.trackId),
    db
      .select({ id: scheduledSession.roomId, value })
      .from(scheduledSession)
      .where(eq(scheduledSession.eventId, eventId))
      .groupBy(scheduledSession.roomId),
    db
      .select({ id: submission.formatId, value })
      .from(submission)
      .where(eq(submission.eventId, eventId))
      .groupBy(submission.formatId),
    db
      .select({ id: scheduledSession.formatId, value })
      .from(scheduledSession)
      .where(eq(scheduledSession.eventId, eventId))
      .groupBy(scheduledSession.formatId),
    db
      .select({ id: submissionTag.tagId, value })
      .from(submissionTag)
      .innerJoin(tag, eq(tag.id, submissionTag.tagId))
      .where(eq(tag.eventId, eventId))
      .groupBy(submissionTag.tagId),
    db
      .select({ id: submission.personaId, value })
      .from(submission)
      .where(eq(submission.eventId, eventId))
      .groupBy(submission.personaId),
    db
      .select({ id: formField.libraryEntryId, value })
      .from(formField)
      .innerJoin(fieldLibraryEntry, eq(fieldLibraryEntry.id, formField.libraryEntryId))
      .where(eq(fieldLibraryEntry.eventId, eventId))
      .groupBy(formField.libraryEntryId),
  ]);

  return {
    tracks: tally([...submissionTracks, ...sessionTracks]),
    rooms: tally(sessionRooms),
    formats: tally([...submissionFormats, ...sessionFormats]),
    tags: tally(taggedSubmissions),
    personas: tally(submissionPersonas),
    fieldEntries: tally(libraryFields),
  };
}

export async function loadSettings(ctx: EventContext): Promise<SettingsSnapshot> {
  const [tracks, rooms, formats, tags, personas, fieldEntries, usage] = await Promise.all([
    listTracks(ctx),
    listRooms(ctx),
    listFormats(ctx),
    listTags(ctx),
    listPersonas(ctx),
    listFieldEntries(ctx),
    usageFor(ctx.eventId),
  ]);
  return { tracks, rooms, formats, tags, personas, fieldEntries, usage };
}
