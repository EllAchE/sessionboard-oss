import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splitPersonName } from '../../lib/person-name';

/**
 * `0008` is checked as a *file* rather than by running it, because CI has no Postgres. What the file
 * can be held to is the shape, and the shape is where the last migration went wrong.
 *
 * `0007` had to be hand-rewritten because drizzle-kit emits `ADD COLUMN … NOT NULL` as one statement,
 * which aborts on a populated table. The lesson generalises: a NOT NULL column is only safe to add in
 * one statement if it carries a DEFAULT, which Postgres applies as a metadata-only fast default.
 * That is the invariant asserted here, and it is worth asserting because a regenerated migration
 * silently loses any hand-editing.
 */

const sql = readFileSync(
  fileURLToPath(new URL('./0008_tiny_maximus.sql', import.meta.url)),
  'utf8',
);

const statements = sql
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())
  .filter(Boolean);

describe('0008 column adds', () => {
  it('never adds a NOT NULL column without a default', () => {
    const offenders = statements
      .filter((statement) => /ADD COLUMN/i.test(statement))
      .filter((statement) => /NOT NULL/i.test(statement) && !/DEFAULT/i.test(statement));
    expect(offenders).toEqual([]);
  });

  /**
   * The two name halves stay nullable. A name that arrived as one word has no surname, and a
   * migration that invented one — or refused the row — would be worse than an empty column.
   */
  it('leaves first and last name nullable', () => {
    const nameColumns = statements.filter((statement) =>
      /ADD COLUMN "(first|last)_name"/.test(statement),
    );
    expect(nameColumns).toHaveLength(2);
    for (const statement of nameColumns) expect(statement).not.toMatch(/NOT NULL/i);
  });
});

describe('0008 backfill', () => {
  /**
   * `F-6`. The split rule has to be the same one `lib/person-name.ts` applies at runtime, or a row
   * written by the migration and a row written by the app disagree. Both sides are stated once here:
   * the SQL is checked for the two expressions that implement it, and the TypeScript is checked for
   * the behaviour they produce.
   */
  it('splits on the last whitespace-separated token, matching splitPersonName', () => {
    const backfill = statements.find((statement) => /UPDATE "user" SET/.test(statement));
    expect(backfill).toBeDefined();
    // Given name: everything before the final token.
    expect(backfill).toContain(`regexp_replace(btrim(regexp_replace("name", '\\s+', ' ', 'g')), '\\s\\S+$', '')`);
    // Family name: the final token, or nothing when there is only one.
    expect(backfill).toContain(`regexp_match(btrim(regexp_replace("name", '\\s+', ' ', 'g')), '\\s(\\S+)$')`);
    // And it leaves rows with no name alone rather than writing empty strings into them.
    expect(backfill).toMatch(/WHERE "name" IS NOT NULL AND btrim\("name"\) <> ''/);

    expect(splitPersonName('Marcus Tullius Cicero')).toEqual({
      firstName: 'Marcus Tullius',
      lastName: 'Cicero',
    });
    expect(splitPersonName('Sulpicia')).toEqual({ firstName: 'Sulpicia', lastName: null });
  });

  it('does not rewrite the display name the rest of the app reads', () => {
    const backfill = statements.find((statement) => /UPDATE "user" SET/.test(statement));
    expect(backfill).not.toMatch(/SET[\s\S]*"name" =/);
  });
});

describe('0008 repairs the seeded call for speakers', () => {
  /**
   * The bug this fixes: `publishForm` requires all six built-ins, and both seeds wrote five and set
   * `status: 'open'` directly — so a seeded demo call worked until an organizer opened it in the
   * builder and pressed Publish, which failed with "missing built-in field: tags" and offered them no
   * way to act on it. The seeds are corrected at source; this repairs databases that already exist.
   */
  it('adds the missing tags built-in to every cfp form', () => {
    const repair = statements.find(
      (statement) => /INSERT INTO "form_field"/.test(statement) && /'tags'/.test(statement),
    );
    expect(repair).toBeDefined();
    expect(repair).toMatch(/WHERE f\."kind" = 'cfp'/);
  });

  it('gives every existing cfp form the participant field set and a default role set', () => {
    const fields = statements.find(
      (statement) => /INSERT INTO "form_field"/.test(statement) && /'participant'/.test(statement),
    );
    expect(fields).toBeDefined();
    for (const key of ['firstName', 'lastName', 'email', 'phone', 'biography']) {
      expect(fields).toContain(`'${key}'`);
    }

    const roles = statements.find((statement) =>
      /INSERT INTO "form_participant_role"/.test(statement),
    );
    expect(roles).toBeDefined();
    expect(roles).toContain("'speaker'");
    expect(roles).toContain("'co_speaker'");
  });

  /**
   * Re-running the data steps must insert nothing twice. Verified against a real Postgres during
   * development; pinned here so the guards cannot be dropped in a later edit.
   */
  it('guards every data insert against already having run', () => {
    const inserts = statements.filter((statement) => /^INSERT INTO/.test(statement));
    expect(inserts.length).toBeGreaterThanOrEqual(3);
    for (const statement of inserts) expect(statement).toMatch(/NOT EXISTS \(/);
  });
});
