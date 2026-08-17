import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { contentRevision, room, scheduledSession, sponsor } from '@/db/schema';
import { dropContentFixture, seedContentFixture, type ContentFixture } from '@/db/testing';
import { setSponsorStatus, updateSponsor } from './sponsors';
import {
  listContentRevisions,
  listRevisionsForEntity,
  recordRevision,
  restoreContentRevision,
} from './content';

/**
 * `AD-4`, against a real Postgres.
 *
 * Revision numbering is a claim about what two concurrent writers do to one table, and the ordering
 * it fixes only ever went wrong when two rows shared a `created_at` — neither is observable through
 * a mocked database, which is why the unit suite could not have caught either. The diffs and the
 * restores are here for the same reason: they turn on jsonb round-tripping, on foreign keys to rows
 * that may have been deleted since, and on real unique constraints.
 *
 * Requires DATABASE_URL and a migrated database: `bun run test:integration`.
 */

const fixtures: ContentFixture[] = [];

async function seed(): Promise<ContentFixture> {
  const fixture = await seedContentFixture();
  fixtures.push(fixture);
  return fixture;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Start Postgres and run `bun run db:migrate` first — see README.',
    );
  }
});

afterEach(async () => {
  while (fixtures.length > 0) await dropContentFixture(fixtures.pop()!);
});

const changesOf = (entry: { changed: Array<{ label: string; before: string; after: string }> }) =>
  Object.fromEntries(entry.changed.map((change) => [change.label, `${change.before} → ${change.after}`]));

async function rowsFor(fixture: ContentFixture, entityId: string) {
  return getDb()
    .select({ id: contentRevision.id, number: contentRevision.revisionNumber })
    .from(contentRevision)
    .where(
      and(
        eq(contentRevision.eventId, fixture.eventId),
        eq(contentRevision.entityId, entityId),
      ),
    )
    .orderBy(contentRevision.revisionNumber);
}

describe('revision numbers', () => {
  it('numbers each entity from 1 independently of the others', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();

    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'First');
    await db.update(sponsor).set({ tier: 'Silver' }).where(eq(sponsor.id, fixture.sponsorId));
    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'Second');
    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'First');

    expect((await rowsFor(fixture, fixture.sponsorId)).map((row) => row.number)).toEqual([1, 2]);
    expect((await rowsFor(fixture, fixture.sessionId)).map((row) => row.number)).toEqual([1]);
  });

  /**
   * The bug the number exists to fix. `decorate` reads "what this revision changed" off the *next*
   * entry in the list, so under a `created_at` tie the two rows used to swap places at random and
   * each was handed the other's diff. Forcing the tie is the only way to assert the fix.
   */
  it('orders revisions that share a created_at to the microsecond', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();

    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'Oldest');
    await db.update(sponsor).set({ tier: 'Silver' }).where(eq(sponsor.id, fixture.sponsorId));
    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'Middle');
    await db.update(sponsor).set({ tier: 'Bronze' }).where(eq(sponsor.id, fixture.sponsorId));
    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'Newest');

    await db
      .update(contentRevision)
      .set({ createdAt: new Date('2026-09-01T00:00:00.000Z') })
      .where(eq(contentRevision.entityId, fixture.sponsorId));

    const entries = await listRevisionsForEntity(fixture.eventId, 'sponsor', fixture.sponsorId);

    expect(entries.map((entry) => entry.summary)).toEqual(['Newest', 'Middle', 'Oldest']);
    expect(entries.map((entry) => entry.revisionNumber)).toEqual([3, 2, 1]);
    /** Each entry's diff is against the state that replaced it, so the tiers must chain cleanly. */
    expect(changesOf(entries[1]).Tier).toBe('Silver → Bronze');
    expect(changesOf(entries[2]).Tier).toBe('Gold → Silver');
  });

  /**
   * A naive `select max() + 1` loses this: both writers read the same number and one insert wins
   * arbitrarily. Dense `1..n` is the stronger claim — merely-unique numbering would leave holes.
   */
  it('gives concurrent writers distinct, gapless numbers', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();
    const tiers = ['I', 'II', 'III', 'IV', 'V', 'VI'];

    await Promise.all(
      tiers.map(async (tier) => {
        await db.update(sponsor).set({ tier }).where(eq(sponsor.id, fixture.sponsorId));
        await recordRevision(ctx, 'sponsor', fixture.sponsorId, `Set tier ${tier}`);
      }),
    );

    const numbers = (await rowsFor(fixture, fixture.sponsorId)).map((row) => row.number);
    expect(numbers.length).toBeGreaterThan(1);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  /** The list is ordered by number rather than by insertion, so a renumber must be visible. */
  it('agrees with the canonical numbering recomputed from scratch', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();

    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'First');
    await db.update(sponsor).set({ tier: 'Silver' }).where(eq(sponsor.id, fixture.sponsorId));
    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'Second');
    await db.update(sponsor).set({ tier: 'Bronze' }).where(eq(sponsor.id, fixture.sponsorId));
    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'Third');

    const before = await rowsFor(fixture, fixture.sponsorId);

    /**
     * The numbering below is the definition `revision_number` is supposed to satisfy: dense per
     * `(event, kind, entity)`, ordered by `created_at` with `id` as the tiebreak because two edits
     * inside one millisecond would otherwise be ordered arbitrarily. `recordRevision` assigns its
     * numbers at insert time instead, so recomputing here is an independent derivation of the same
     * answer — if the two disagree, one of them is numbering by insertion order rather than by
     * time, and "revision 4" means different things to the writer and to the reader.
     */
    await db.execute(sql`
      UPDATE "content_revision" AS "target" SET "revision_number" = "numbered"."rank"
      FROM (
        SELECT "id", row_number() OVER (
          PARTITION BY "event_id", "entity_kind", "entity_id"
          ORDER BY "created_at" ASC, "id" ASC
        ) AS "rank"
        FROM "content_revision"
      ) AS "numbered"
      WHERE "target"."id" = "numbered"."id"
    `);

    expect(await rowsFor(fixture, fixture.sponsorId)).toEqual(before);
  });
});

describe('scheduled sessions', () => {
  it('records what changed, with rooms and tracks named rather than uuids', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();

    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'Moved On duties');
    await db
      .update(scheduledSession)
      .set({
        title: 'On duties, revised',
        roomId: fixture.rooms[1].id,
        trackId: fixture.tracks[1].id,
        startsAt: new Date('2026-09-10T14:00:00.000Z'),
      })
      .where(eq(scheduledSession.id, fixture.sessionId));

    const [entry] = await listRevisionsForEntity(
      fixture.eventId,
      'scheduled_session',
      fixture.sessionId,
    );
    const changed = changesOf(entry);

    expect(entry.summary).toBe('Moved On duties');
    expect(changed.Title).toBe('On duties → On duties, revised');
    expect(changed.Room).toBe('Basilica Julia → Rostra');
    expect(changed.Track).toBe('Rhetoric → Law');
    expect(changed.Starts).toContain('2026-09-10T14:00');
    /** Untouched fields must stay out of the diff, or every move would read as a rewrite. */
    expect(changed.Format).toBeUndefined();
    expect(changed.Ends).toBeUndefined();
  });

  /**
   * `starts_at` is a `Date` from the column and a string out of jsonb. Comparing the two raw would
   * make every save look like a change and quietly defeat the no-op skip this test guards.
   */
  it('does not record a revision when nothing changed', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();

    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'First');
    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'Second');
    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'Third');

    expect(await rowsFor(fixture, fixture.sessionId)).toHaveLength(1);
  });

  it('restores an earlier version, and the restore is itself undoable', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();

    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'Before the move');
    await db
      .update(scheduledSession)
      .set({
        title: 'Moved by mistake',
        roomId: fixture.rooms[1].id,
        startsAt: new Date('2026-09-11T09:00:00.000Z'),
        status: 'published',
      })
      .where(eq(scheduledSession.id, fixture.sessionId));

    const [entry] = await listRevisionsForEntity(
      fixture.eventId,
      'scheduled_session',
      fixture.sessionId,
    );
    await restoreContentRevision(ctx, entry.id);

    const restored = await db.query.scheduledSession.findFirst({
      where: eq(scheduledSession.id, fixture.sessionId),
    });
    expect(restored?.title).toBe('On duties');
    expect(restored?.roomId).toBe(fixture.rooms[0].id);
    expect(restored?.status).toBe('draft');
    expect(restored?.startsAt?.toISOString()).toBe('2026-09-10T10:00:00.000Z');

    const after = await listRevisionsForEntity(
      fixture.eventId,
      'scheduled_session',
      fixture.sessionId,
    );
    expect(after[0].summary).toBe('Restored SESS-1 Moved by mistake to revision 1');
    expect(after[0].snapshot.title).toBe('Moved by mistake');
  });

  /**
   * A room can be deleted between the snapshot and the restore. Writing its uuid back would fail
   * the foreign key and take the whole restore with it, so the stale pointer is dropped instead.
   */
  it('restores everything that still exists when a room has since been deleted', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();

    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'Before');
    await db
      .update(scheduledSession)
      .set({ title: 'Retitled', roomId: fixture.rooms[1].id })
      .where(eq(scheduledSession.id, fixture.sessionId));

    // `on delete set null` clears the live pointer; the snapshot still holds the dead uuid.
    await db.delete(room).where(eq(room.id, fixture.rooms[0].id));

    const [entry] = await listRevisionsForEntity(
      fixture.eventId,
      'scheduled_session',
      fixture.sessionId,
    );
    await restoreContentRevision(ctx, entry.id);

    const restored = await db.query.scheduledSession.findFirst({
      where: eq(scheduledSession.id, fixture.sessionId),
    });
    expect(restored?.title).toBe('On duties');
    expect(restored?.roomId).toBeNull();
  });
});

describe('sponsors', () => {
  it('snapshots the version before an edit made through the sponsor board', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();

    await updateSponsor(ctx, fixture.sponsorId, {
      kind: 'sponsor',
      name: 'Atticus & Co',
      tier: 'Platinum',
      websiteUrl: 'https://atticus.test',
      description: 'Bookseller to the Republic',
      boothLocation: '',
      logoFileId: '',
    });
    await setSponsorStatus(ctx, fixture.sponsorId, 'published');

    const entries = await listRevisionsForEntity(fixture.eventId, 'sponsor', fixture.sponsorId);

    expect(entries.map((entry) => entry.summary)).toEqual([
      'Published Atticus & Co',
      'Edited Atticus & Co',
    ]);
    expect(changesOf(entries[0]).Status).toBe('draft → published');
    expect(changesOf(entries[1]).Tier).toBe('Gold → Platinum');
    expect(changesOf(entries[1]).Description).toBe('— → Bookseller to the Republic');
  });

  it('restores an earlier version of a sponsor', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();

    await updateSponsor(ctx, fixture.sponsorId, {
      kind: 'exhibitor',
      name: 'Atticus of Athens',
      tier: 'Bronze',
      websiteUrl: '',
      description: '',
      boothLocation: 'Stall 4',
      logoFileId: '',
    });

    const [entry] = await listRevisionsForEntity(fixture.eventId, 'sponsor', fixture.sponsorId);
    await restoreContentRevision(ctx, entry.id);

    const restored = await getDb().query.sponsor.findFirst({
      where: eq(sponsor.id, fixture.sponsorId),
    });
    expect(restored?.name).toBe('Atticus & Co');
    expect(restored?.kind).toBe('sponsor');
    expect(restored?.tier).toBe('Gold');
    expect(restored?.websiteUrl).toBe('https://atticus.test');
    expect(restored?.boothLocation).toBeNull();
  });

  it('does not record a revision for a status that was already set', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();

    await setSponsorStatus(ctx, fixture.sponsorId, 'draft');

    expect(await rowsFor(fixture, fixture.sponsorId)).toHaveLength(0);
  });
});

describe('the organizer feed', () => {
  it('carries both new kinds, newest first, each with its number', async () => {
    const fixture = await seed();
    const ctx = fixture.ctx();
    const db = getDb();

    await recordRevision(ctx, 'scheduled_session', fixture.sessionId, 'Session edit');
    await db.update(scheduledSession).set({ title: 'Retitled' }).where(eq(scheduledSession.id, fixture.sessionId));
    await recordRevision(ctx, 'sponsor', fixture.sponsorId, 'Sponsor edit');

    const feed = await listContentRevisions(ctx);

    expect(feed.map((entry) => [entry.entityKind, entry.revisionNumber])).toEqual([
      ['sponsor', 1],
      ['scheduled_session', 1],
    ]);
    expect(feed.map((entry) => entry.entityLabel)).toEqual(['Atticus & Co', 'SESS-1 Retitled']);
  });

  it('refuses a caller without the read-all capability', async () => {
    const fixture = await seed();

    await expect(listContentRevisions(fixture.ctx(fixture.organizer, 'speaker'))).rejects.toBeDefined();
  });
});
