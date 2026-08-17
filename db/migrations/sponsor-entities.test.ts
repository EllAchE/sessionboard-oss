import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `E-7`. `0011` is checked as a *file*, for the same reason `0008` and `0010` are: CI has no
 * Postgres. What a file can be held to is its shape, and the shape is where migrations in this repo
 * have gone wrong before — `0007` had to be hand-rewritten because drizzle-kit emits
 * `ADD COLUMN … NOT NULL` as a single statement, which aborts on a populated table.
 *
 * This migration is the easy kind: one new type, one new table, nothing touched that already holds
 * rows. The assertions exist to keep it that way. The next person to add a sponsor column will run
 * `db:generate` over this same file, and a regenerated migration silently loses hand-editing.
 */

const sql = readFileSync(fileURLToPath(new URL('./0011_furry_microbe.sql', import.meta.url)), 'utf8');

/** The trailing `/* … *\/` block is this file's rationale; the assertions are about the SQL. */
const body = sql.split('/*')[0];

const statements = body
  .split('--> statement-breakpoint')
  .map((statement) =>
    statement
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter(Boolean);

describe('0011 upgrade safety', () => {
  it('never adds a NOT NULL column without a default', () => {
    const offenders = statements
      .filter((statement) => /ADD COLUMN/i.test(statement))
      .filter((statement) => /NOT NULL/i.test(statement) && !/DEFAULT/i.test(statement));
    expect(offenders).toEqual([]);
  });

  /**
   * The strongest form of the above: this migration adds no column to any existing table at all, so
   * it cannot rewrite one. If a later edit adds an `ALTER TABLE … ADD COLUMN` here, the assertion
   * above becomes the one that matters and this one should be deleted deliberately.
   */
  it('adds no column to an existing table', () => {
    expect(statements.filter((statement) => /ADD COLUMN/i.test(statement))).toEqual([]);
  });

  /** No sponsor existed on `main` at any layer, so every existing database is correct when empty. */
  it('changes no data', () => {
    const writes = statements.filter((statement) => /^(UPDATE|DELETE|INSERT)\s/i.test(statement));
    expect(writes).toEqual([]);
  });

  it('drops nothing', () => {
    expect(body).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE)/i);
  });
});

describe('0011 sponsor table', () => {
  const create = statements.find((statement) => /CREATE TABLE "sponsor"/.test(statement));

  it('creates the sponsor_kind enum before the table that uses it', () => {
    const enumAt = body.indexOf('CREATE TYPE "public"."sponsor_kind"');
    const tableAt = body.indexOf('CREATE TABLE "sponsor"');
    expect(enumAt).toBeGreaterThanOrEqual(0);
    expect(body).toMatch(/AS ENUM\('sponsor', 'exhibitor'\)/);
    expect(enumAt).toBeLessThan(tableAt);
  });

  /** Event-scoped like every other collection, and cascading so deleting an event leaves nothing. */
  it('scopes rows to an event and cascades the delete', () => {
    expect(create).toMatch(/"event_id" uuid NOT NULL/);
    const fk = statements.find((statement) => /sponsor_event_id_event_id_fk/.test(statement));
    expect(fk).toMatch(/REFERENCES "public"\."event"\("id"\) ON DELETE cascade/);
    expect(statements.some((statement) => /CREATE INDEX "sponsor_event_idx"/.test(statement))).toBe(
      true,
    );
  });

  /**
   * All three key columns are `NOT NULL`, which is what makes a plain `UNIQUE` correct here.
   * Postgres treats NULLs as distinct, so a nullable member would let duplicates through, and
   * `UNIQUE NULLS NOT DISTINCT` needs PG 15. `kind` is in the key because a company that both
   * sponsors and exhibits is two rows sharing a name.
   */
  it('keys uniqueness on three non-nullable columns', () => {
    expect(create).toMatch(/CONSTRAINT "sponsor_event_kind_name" UNIQUE\("event_id","kind","name"\)/);
    expect(create).toMatch(/"kind" "sponsor_kind" DEFAULT 'sponsor' NOT NULL/);
    expect(create).toMatch(/"name" text NOT NULL/);
    expect(create).not.toMatch(/NULLS NOT DISTINCT/i);
  });

  /**
   * The image is decoration. A foreign key with a cascade would let deleting a file delete the
   * sponsor, so `logo_file_id` is a bare uuid — the same shape as `event.logo_file_id`.
   */
  it('holds the logo as a bare uuid with no foreign key into file', () => {
    expect(create).toMatch(/"logo_file_id" uuid,?\n/);
    expect(body).not.toMatch(/REFERENCES "public"\."file"/);
  });

  /** Everything an organizer types is optional except the name. */
  it('makes every descriptive field nullable', () => {
    for (const column of ['tier', 'website_url', 'description', 'booth_location']) {
      expect(create, column).toMatch(new RegExp(`"${column}" text,?\\n`));
    }
  });
});
