import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { event, membership } from '@/db/schema';
import type { EventContext } from '@/lib/context';
import { requireCapability } from '@/lib/context';
import { conflict, invalid, notFound } from '@/lib/errors';
import { resolveEventWindow, type EventWindow } from '@/lib/event-dates';
import { slugify } from '@/lib/ids';
import {
  EVENT_COLUMN_PLAN,
  copyEntry,
  copyOrder,
  tableMeta,
  type ColumnRule,
} from './event-clone-plan';

/**
 * `AD-1`. Duplicating an event.
 *
 * Cloning an existing event rather than introducing a separate "template" entity. A template is a
 * second thing to keep in sync with the first, and it drifts: the organizer edits the event they
 * are actually running, the template silently rots, and next year they clone something a year out
 * of date. An event is already the description of an event. The one an organizer just finished
 * running is the most accurate template that will ever exist, which is exactly why every team in
 * the field survey that shipped this shipped it as "duplicate", not "save as template".
 *
 * No schema change comes with this. A `clonedFromEventId` column was considered and rejected: no
 * screen, service, export or API response would read it, and an unread column is a maintenance
 * cost plus a migration collision with the other `event` work in flight. If provenance ever earns
 * a reader, it can be added then, by someone who knows what it is for.
 *
 * What is and is not carried lives in `event-clone-plan.ts`, and this file executes that
 * declaration rather than restating it.
 */

export type CloneEventInput = {
  name: string;
  slug?: string | null;
  /** Defaults to the source event's zone. */
  timezone?: string | null;
  /** Wall clock in `timezone`, `YYYY-MM-DDTHH:mm`. Required — see `EVENT_COLUMN_PLAN`. */
  startsAt: string;
  endsAt: string;
};

export type CloneEventResult = {
  eventId: string;
  slug: string;
  /** Rows written, by table, in copy order. Tables that had nothing to copy are omitted. */
  copied: Record<string, number>;
  /**
   * Things the organizer has to redo by hand, phrased for a person. Surfaced rather than left for
   * them to discover: a clone that quietly dropped the logo is a clone they will not trust.
   */
  notes: string[];
};

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

const cloneEventSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Keep the name under 200 characters'),
  slug: z.string().trim().max(200).nullable().optional(),
  timezone: z.string().trim().nullable().optional(),
  startsAt: z.string().trim().regex(WALL_CLOCK, 'Give a start date and time'),
  endsAt: z.string().trim().regex(WALL_CLOCK, 'Give an end date and time'),
});

export const cloneEventSchemas = { clone: cloneEventSchema };

function parse(input: unknown): z.output<typeof cloneEventSchema> {
  const result = cloneEventSchema.safeParse(input);
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !details[key]) details[key] = issue.message;
  }
  throw invalid(result.error.issues[0]?.message ?? 'That is not valid', details);
}

/** `Map<tableName, Map<sourceRowId, newRowId>>`, filled in copy order and read by `remap`. */
type IdMaps = Map<string, Map<string, string>>;

function applyRule(
  rule: ColumnRule,
  key: string,
  row: Record<string, unknown>,
  newEventId: string,
  idMaps: IdMaps,
  table: string,
): { skip: true } | { skip: false; value: unknown } {
  switch (rule.kind) {
    case 'generated':
      // Omitted entirely so the column default fires: `defaultRandom()`, `defaultNow()`.
      return { skip: true };
    case 'event':
      return { skip: false, value: newEventId };
    case 'copy':
      return { skip: false, value: row[key] };
    case 'clear':
      return { skip: false, value: null };
    case 'reset':
      return { skip: false, value: rule.value };
    case 'remap': {
      const source = row[key];
      if (source === null || source === undefined) return { skip: false, value: null };
      const mapped = idMaps.get(rule.table)?.get(String(source));
      if (!mapped) {
        // Unreachable through the plan — `copyOrder` guarantees the parent landed first, and
        // `scope` guarantees the parent row was in range. Reaching it would mean a copied row
        // pointing at a row that belongs to the source event, so it fails loudly inside the
        // transaction rather than writing a dangling reference.
        throw new Error(`clone: ${table}.${key} references ${rule.table} row ${String(source)}, which was not copied`);
      }
      return { skip: false, value: mapped };
    }
    case 'input':
      // Only `event` has these, and `cloneEvent` supplies them directly.
      throw new Error(`clone: ${table}.${key} is caller-supplied and has no row rule`);
  }
}

function windowOrThrow(timezone: string, startsAt: string, endsAt: string): EventWindow {
  const resolved = resolveEventWindow(timezone, startsAt, endsAt);
  if (!resolved.ok) {
    throw invalid(resolved.problem.message, { [resolved.problem.field]: resolved.problem.message });
  }
  return resolved.window;
}

/**
 * Whole thing or nothing. Every insert runs inside one transaction, so a failure anywhere — a slug
 * that was taken between the check and the insert, a constraint nobody anticipated, a dropped
 * connection — rolls the new `event` row back with it. A half-cloned event is the worst outcome
 * available here: it would appear in the switcher, look real, and be missing whichever tables came
 * after the failure, with no way for the organizer to tell which.
 *
 * There are no non-transactional side effects to compensate for. Nothing here writes to object
 * storage, sends mail or calls a webhook, which is another reason `file` is not copied: copying
 * bytes would put an unrollbackable operation inside a transaction that can still abort.
 */
export async function cloneEvent(
  ctx: EventContext,
  input: CloneEventInput,
): Promise<CloneEventResult> {
  requireCapability(ctx, 'event:manage');
  const values = parse(input);

  const db = getDb();
  const source = await db.query.event.findFirst({ where: eq(event.id, ctx.eventId) });
  if (!source) throw notFound('Event');

  const slug = slugify(values.slug?.trim() || values.name);
  if (!slug) {
    throw invalid('That name does not make a usable URL', { slug: 'Choose a different name' });
  }
  if (slug === source.slug) {
    throw conflict(`The URL /${slug} is already taken`, { slug: 'Already in use' });
  }

  const timezone = values.timezone?.trim() || source.timezone;
  const window = windowOrThrow(timezone, values.startsAt, values.endsAt);

  return db.transaction(async (tx) => {
    const taken = await tx.query.event.findFirst({ where: eq(event.slug, slug) });
    if (taken) throw conflict(`The URL /${slug} is already taken`, { slug: 'Already in use' });

    // Built from `EVENT_COLUMN_PLAN` key by key rather than spread from `source`, so a column
    // added to `event` cannot ride across unnoticed — the plan test fails first.
    const eventValues: Record<string, unknown> = {};
    const supplied: Record<string, unknown> = {
      name: values.name,
      slug,
      timezone: window.timezone,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      startsOn: window.startsOn,
      endsOn: window.endsOn,
      ownerUserId: ctx.actor.userId,
    };

    for (const [key, rule] of Object.entries(EVENT_COLUMN_PLAN)) {
      if (rule.kind === 'input') {
        if (!(key in supplied)) throw new Error(`clone: event.${key} is declared input but unsupplied`);
        eventValues[key] = supplied[key];
        continue;
      }
      const applied = applyRule(rule, key, source as Record<string, unknown>, '', new Map(), 'event');
      if (!applied.skip) eventValues[key] = applied.value;
    }

    const [created] = await tx.insert(event).values(eventValues as never).returning();

    await tx
      .insert(membership)
      .values({ userId: ctx.actor.userId, eventId: created.id, role: 'organizer' })
      .onConflictDoNothing();

    const idMaps: IdMaps = new Map();
    const copied: Record<string, number> = {};

    for (const name of copyOrder()) {
      const entry = copyEntry(name);
      const meta = tableMeta(name);
      const table = meta.table as unknown as Record<string, never>;

      const scope = entry.scope;
      let rows: Record<string, unknown>[];
      if ('parent' in scope) {
        const parentIds = [...(idMaps.get(scope.parent)?.keys() ?? [])];
        rows = parentIds.length
          ? await tx.select().from(meta.table).where(inArray(table[scope.column], parentIds))
          : [];
      } else {
        rows = await tx.select().from(meta.table).where(eq(table.eventId, ctx.eventId));
      }

      const keep = entry.skipRow
        ? rows.filter((row) => row[entry.skipRow!.column] === null || row[entry.skipRow!.column] === undefined)
        : rows;
      if (keep.length === 0) continue;

      const payload = keep.map((row) => {
        const next: Record<string, unknown> = {};
        for (const [key, rule] of Object.entries(entry.columns)) {
          const applied = applyRule(rule, key, row, created.id, idMaps, name);
          if (!applied.skip) next[key] = applied.value;
        }
        return next;
      });

      const inserted = await tx.insert(meta.table).values(payload as never).returning();

      // Positional: `insert ... returning` preserves the order of the `values` list, which is the
      // order of `keep`. That is what lets a child table find its parent's new id.
      const map = new Map<string, string>();
      keep.forEach((row, index) => {
        const sourceId = row.id;
        const newId = (inserted[index] as { id?: string })?.id;
        if (typeof sourceId === 'string' && typeof newId === 'string') map.set(sourceId, newId);
      });
      idMaps.set(name, map);
      copied[name] = inserted.length;
    }

    return {
      eventId: created.id,
      slug: created.slug,
      copied,
      notes: cloneNotes(copied),
    };
  });
}

/**
 * What the organizer has to do next, derived from the plan's skips rather than written out twice.
 * Only mentions work they actually have: no point telling somebody to re-upload a logo they never
 * had.
 */
function cloneNotes(copied: Record<string, number>): string[] {
  const notes = [
    'Nobody was carried over. Participants, submissions, reviews and decisions all stay with the ' +
      'original event.',
  ];
  if (copied.form) {
    notes.push('Forms came across as drafts with their open and close dates cleared. Set the new dates, then open them.');
  }
  if (copied.review_round) {
    notes.push('Review rounds came across as drafts with their dates cleared.');
  }
  if (copied.task) {
    notes.push('Task due dates were cleared, and tasks pinned to one talk were left behind.');
  }
  notes.push('Logos, banners and any other uploaded file need re-uploading — file storage is scoped to one event.');
  notes.push('API keys, webhook endpoints and sponsors were not copied.');
  return notes;
}

/** The events this actor could clone from: the ones they organize. */
export async function listClonableEvents(userId: string): Promise<
  Array<{ id: string; name: string; slug: string; startsOn: string }>
> {
  const rows = await getDb()
    .select({
      id: event.id,
      name: event.name,
      slug: event.slug,
      startsOn: event.startsOn,
    })
    .from(event)
    .innerJoin(membership, eq(membership.eventId, event.id))
    .where(sql`${membership.userId} = ${userId} and ${membership.role} = 'organizer'`)
    .orderBy(event.startsOn);

  return rows;
}
