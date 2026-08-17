import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `0010` is checked as a *file*, for the same reason `0008` is: CI has no Postgres. What a file can
 * be held to is its shape, and the shape is where migrations in this repo have gone wrong before —
 * `0007` had to be hand-rewritten because drizzle-kit emits `ADD COLUMN … NOT NULL` as a single
 * statement, which aborts on a populated table.
 *
 * This one also changes a uniqueness rule on a table that already holds rows, which is the other
 * way to lose data on an upgrade. The assertions below pin the two properties that make it safe.
 */

const sql = readFileSync(
  fileURLToPath(new URL('./0010_dark_the_hand.sql', import.meta.url)),
  'utf8',
);

/** Leading `--` lines are this file's rationale; the assertions below are about the SQL itself. */
const statements = sql
  .split('--> statement-breakpoint')
  .map((statement) =>
    statement
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter(Boolean);

describe('0010 column adds', () => {
  it('never adds a NOT NULL column without a default', () => {
    const offenders = statements
      .filter((statement) => /ADD COLUMN/i.test(statement))
      .filter((statement) => /NOT NULL/i.test(statement) && !/DEFAULT/i.test(statement));
    expect(offenders).toEqual([]);
  });

  /**
   * `S-2`. Nullable, because a speaker who has never opened the portal has no salutation and
   * inventing one would be worse than an empty column.
   */
  it('adds the three profile fields the brief asked for, all nullable', () => {
    for (const column of ['salutation', 'honorific', 'gender']) {
      const statement = statements.find((entry) =>
        new RegExp(`ALTER TABLE "participant" ADD COLUMN "${column}"`).test(entry),
      );
      expect(statement, column).toBeDefined();
      expect(statement).not.toMatch(/NOT NULL/i);
    }
  });

  /**
   * `contact` on both tables is what makes this migration a no-op for behaviour: every task and
   * every assignment that already exists keeps meaning exactly what it meant.
   */
  it('defaults both new scope columns to the old behaviour', () => {
    for (const table of ['task', 'task_assignment']) {
      const statement = statements.find((entry) =>
        new RegExp(`ALTER TABLE "${table}" ADD COLUMN "scope"`).test(entry),
      );
      expect(statement, table).toBeDefined();
      expect(statement).toMatch(/DEFAULT 'contact'/);
      expect(statement).toMatch(/NOT NULL/);
    }
  });
});

describe('0010 uniqueness widening', () => {
  /**
   * The old constraint was `(task_id, participant_id)`. The replacement has to stay NULL-safe: a
   * plain `UNIQUE(task_id, participant_id, submission_id)` would constrain nothing at all on the
   * contact scope, because Postgres treats NULLs as distinct and would take two
   * `(task, person, NULL)` rows quite happily.
   */
  it('replaces the old pair constraint with partial indexes that are NULL-safe', () => {
    expect(sql).toMatch(/DROP CONSTRAINT "task_assignment_pair"/);

    const contact = statements.find((entry) => /task_assignment_contact_key/.test(entry));
    expect(contact).toMatch(/UNIQUE INDEX/);
    expect(contact).toMatch(/\("task_id","participant_id"\)/);
    expect(contact).toMatch(/WHERE .*"submission_id" is null/);

    const session = statements.find((entry) => /task_assignment_session_key/.test(entry));
    expect(session).toMatch(/UNIQUE INDEX/);
    expect(session).toMatch(/\("task_id","participant_id","submission_id"\)/);
    expect(session).toMatch(/WHERE .*"submission_id" is not null/);
  });

  /** One shared row per session's speaking team, whichever member happens to hold it. */
  it('constrains a group-scoped task to one row per session', () => {
    const group = statements.find((entry) => /task_assignment_group_key/.test(entry));
    expect(group).toMatch(/UNIQUE INDEX/);
    expect(group).toMatch(/\("task_id","submission_id"\)/);
    expect(group).toMatch(/WHERE .*"scope" = 'group'/);
  });

  /**
   * No dedupe pass is needed, and its absence is deliberate rather than forgotten: the constraint
   * being dropped was strictly narrower than the indexes replacing it, so every row that satisfied
   * it already satisfies them. A `DELETE` here would mean the reasoning was wrong.
   */
  it('deletes nothing', () => {
    expect(statements.some((entry) => /^DELETE/i.test(entry))).toBe(false);
  });
});

describe('0010 backfill', () => {
  /**
   * Before this migration every non-manual assignment was stamped with the participant's first
   * accepted submission — an arbitrary one. `reconcileAssignments` now treats the session as part
   * of a row's identity, so a legacy row left pointing at a session it was never about would be
   * deleted and recreated the next time an organizer touched the task, taking the speaker's
   * completed status, uploaded files and answers with it.
   */
  it('clears the arbitrary session pointer from contact-scoped assignments', () => {
    const backfill = statements.find((entry) => /^UPDATE "task_assignment"/.test(entry));
    expect(backfill).toBeDefined();
    expect(backfill).toMatch(/SET "submission_id" = NULL/);
    expect(backfill).toMatch(/WHERE "submission_id" IS NOT NULL/);
    // Scoped to contact tasks, so a session-scoped task written after the upgrade is left alone.
    expect(backfill).toMatch(/FROM "task" WHERE "scope" = 'contact'/);
  });

  it('touches no other table', () => {
    const updates = statements.filter((entry) => /^UPDATE /i.test(entry));
    expect(updates).toHaveLength(1);
  });
});
