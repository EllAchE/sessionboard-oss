import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `AD-4`. The migration that numbers content revisions, asserted as text.
 *
 * CI's fast suite has no Postgres — the database job runs `db:migrate` against a *clean* server,
 * which proves the file parses and applies but says nothing about what it does to a table that
 * already has rows in it. Every production database will. The invariants below are the ones a
 * clean-server run cannot catch: a `NOT NULL` column added without a backfill applies perfectly to
 * an empty table and fails on a populated one, which is exactly the shape of failure that only
 * ever appears in production.
 *
 * Read as text rather than executed on purpose. Nothing here needs a live database, so nothing
 * here should be able to break the suite that has to run on any machine.
 */

const MIGRATION = './migrations/0001_fancy_aqueduct.sql';

function statements(path: string): string[] {
  const text = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  return text
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

const sql = statements(MIGRATION);
const index = (pattern: RegExp) => sql.findIndex((statement) => pattern.test(statement));

describe('0001, the revision-numbering migration', () => {
  it('adds both new entity kinds to the enum', () => {
    for (const value of ['scheduled_session', 'sponsor']) {
      expect(
        sql.some((statement) =>
          new RegExp(
            `ALTER TYPE "public"\\."content_revision_kind" ADD VALUE '${value}'`,
            'i',
          ).test(statement),
        ),
      ).toBe(true);
    }
  });

  /**
   * The whole point of the file. Drizzle generated a single
   * `ADD COLUMN "revision_number" integer NOT NULL`, which cannot apply to a table that already
   * holds revisions — and every deployed database holds revisions.
   */
  it('adds the column nullable rather than NOT NULL in one step', () => {
    const added = sql.find((statement) => /ADD COLUMN "revision_number"/i.test(statement));
    expect(added).toBeDefined();
    expect(added).not.toMatch(/NOT NULL/i);
  });

  it('backfills every existing row before demanding NOT NULL', () => {
    const backfill = index(/UPDATE "content_revision"[\s\S]*row_number\(\)/i);
    const notNull = index(/ALTER COLUMN "revision_number" SET NOT NULL/i);

    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(notNull).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeLessThan(notNull);
  });

  /**
   * Per entity, not per event and not globally. A partition that forgot `entity_id` would number
   * every session in an event into one sequence and quietly make "revision 4" ambiguous.
   */
  it('partitions the backfill by event, kind and entity', () => {
    const backfill = sql[index(/row_number\(\)/i)];
    expect(backfill).toMatch(
      /PARTITION BY "event_id", "entity_kind", "entity_id"/i,
    );
  });

  /**
   * `created_at` alone is not a total order — two edits inside one millisecond would be numbered
   * arbitrarily, and re-running the backfill could number them the other way round.
   */
  it('orders the backfill deterministically, with a tiebreak after created_at', () => {
    const backfill = sql[index(/row_number\(\)/i)];
    expect(backfill).toMatch(/ORDER BY "created_at" ASC, "id" ASC/i);
  });

  it('makes the number unique per entity, which is what settles a concurrent insert', () => {
    const constraint = sql.find((statement) =>
      /ADD CONSTRAINT "content_revision_entity_number" UNIQUE/i.test(statement),
    );
    expect(constraint).toBeDefined();
    expect(constraint).toMatch(/"event_id","entity_kind","entity_id","revision_number"/);
  });

  /** The constraint has to come after the backfill, or it would be checked against NULLs. */
  it('adds the constraint last', () => {
    expect(index(/ADD CONSTRAINT "content_revision_entity_number"/i)).toBe(sql.length - 1);
  });

  /**
   * `db/migrations/README.md` calls the rebased baseline immutable. A change to it would not show
   * up in any other test — drizzle would happily regenerate it and CI's clean-server migrate would
   * still pass, while every already-migrated database silently diverged.
   */
  it('leaves the 0000 baseline alone', () => {
    const baseline = statements('./migrations/0000_init.sql');
    const enumLine = baseline.find((statement) =>
      /CREATE TYPE "public"\."content_revision_kind"/i.test(statement),
    );
    expect(enumLine).toBe(
      `CREATE TYPE "public"."content_revision_kind" AS ENUM('session', 'participant');`,
    );
    expect(baseline.some((statement) => /revision_number/i.test(statement))).toBe(false);
  });
});
