import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `0012` is checked as a *file* rather than by running it, because CI has no Postgres — the same
 * bargain `0008` and `0011` struck. What a file can be held to is its shape, and the shape is where
 * migrations in this folder have gone wrong before: `0007` had to be hand-rewritten because
 * drizzle-kit emits `ADD COLUMN … NOT NULL` as one statement, which aborts on a populated table.
 *
 * The upgrade path itself was verified against a real database during development — `0000`–`0011`
 * applied to an empty Postgres, seeded, then `0012` on top — but that verification cannot run here,
 * so everything it established that a regenerated file could silently lose is pinned below.
 */

const sql = readFileSync(
  fileURLToPath(new URL('./0012_tan_rictor.sql', import.meta.url)),
  'utf8',
);

const statements = sql
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())
  .filter(Boolean);

describe('0012 column adds', () => {
  it('never adds a NOT NULL column without a default', () => {
    const offenders = statements
      .filter((statement) => /ADD COLUMN/i.test(statement))
      .filter((statement) => /NOT NULL/i.test(statement) && !/DEFAULT/i.test(statement));
    expect(offenders).toEqual([]);
  });

  /**
   * `V-1`. Nullable is the meaning, not a shortcut: `staged_decision IS NULL` is "no organizer has
   * touched this one", which is what keeps the accept and decline queues reading off the panel's
   * average for every submission nobody has staged. A default would have made an untouched
   * submission indistinguishable from a deliberately-staged one.
   */
  it('leaves the staging columns nullable, so an untouched submission stays derived', () => {
    const staging = statements.filter((statement) =>
      /ADD COLUMN "staged_(decision|at|by_user_id)"/.test(statement),
    );
    expect(staging).toHaveLength(3);
    for (const statement of staging) {
      expect(statement).not.toMatch(/NOT NULL/i);
      expect(statement).not.toMatch(/DEFAULT/i);
    }
  });

  it('gives staging its own enum rather than borrowing the submission status', () => {
    const type = statements.find((statement) => /CREATE TYPE .*submission_stage/.test(statement));
    expect(type).toBeDefined();
    // `hold` is the third value, and the only way to take a proposal out of a queue its score put
    // it in without deciding it.
    expect(type).toContain("'accept'");
    expect(type).toContain("'decline'");
    expect(type).toContain("'hold'");
  });
});

describe('0012 recusal table', () => {
  const create = statements.find((statement) => /CREATE TABLE "review_recusal"/.test(statement));

  it('keys a recusal to a submission and a reviewer, not to a round', () => {
    expect(create).toBeDefined();
    // A recusal is a standing fact about a person and a talk. Keyed per round it would forget
    // itself the moment round two opened, which is the whole failure being fixed.
    expect(create).toContain('CONSTRAINT "review_recusal_pair" UNIQUE("submission_id","reviewer_user_id")');
    expect(create).toMatch(/"review_round_id" uuid(?!\s+NOT NULL)/);
  });

  it('records released as a state rather than deleting the row', () => {
    const type = statements.find((statement) =>
      /CREATE TYPE .*review_recusal_status/.test(statement),
    );
    expect(type).toContain("'active'");
    expect(type).toContain("'released'");
    expect(create).toContain('"released_at"');
    expect(create).toContain('"released_by_user_id"');
  });

  it('keeps both NOT NULL columns inside the CREATE TABLE, where a default is free', () => {
    const notNull = (create ?? '')
      .split('\n')
      .filter((line) => /NOT NULL/i.test(line) && !/PRIMARY KEY/i.test(line));
    for (const line of notNull) {
      expect(line).toMatch(/DEFAULT|"submission_id"|"reviewer_user_id"/);
    }
  });
});

describe('0012 backfill', () => {
  const backfill = statements.find((statement) =>
    /INSERT INTO "review_recusal"/.test(statement),
  );

  /**
   * `ABS-12`. Every `declined` review assignment that still exists is a real recusal. Without this
   * step an upgraded database starts with an empty memory, and the very next auto-assign re-offers
   * exactly the talks the new table exists to stop it re-offering.
   */
  it('turns every surviving declined assignment into an active recusal', () => {
    expect(backfill).toBeDefined();
    expect(backfill).toMatch(/FROM "review_assignment" ra/);
    expect(backfill).toMatch(/WHERE ra\."status" = 'declined'/);
    expect(backfill).toContain("'active'");
    // The reason the reviewer gave, and when they gave it, both carry across.
    expect(backfill).toContain('ra."comment"');
    // `assigned_at` on the Drizzle model is the `created_at` column; the SQL has to say the
    // column name, and getting that wrong is what the real-database run caught during development.
    expect(backfill).toContain('COALESCE(ra."completed_at", ra."created_at")');
  });

  it('inserts nothing on a second run', () => {
    expect(backfill).toMatch(/NOT EXISTS \(/);
    expect(backfill).toMatch(/ON CONFLICT ON CONSTRAINT "review_recusal_pair" DO NOTHING/);
  });

  it('does not touch the assignment rows it reads', () => {
    expect(backfill).not.toMatch(/UPDATE "review_assignment"/);
    expect(backfill).not.toMatch(/DELETE FROM "review_assignment"/);
  });
});
