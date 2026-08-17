import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import journal from './meta/_journal.json' with { type: 'json' };

/**
 * CI has no Postgres, so these are file-text assertions over the emitted SQL rather than a run
 * against a live database. That is a genuinely weaker test — it cannot tell you the statement
 * executes — but it catches the failure modes that actually happen to a generated migration:
 * the journal and the `.sql` files drifting apart, and a later migration quietly rewriting the
 * baseline instead of appending to it.
 */

function migration(tag: string): string[] {
  const text = readFileSync(fileURLToPath(new URL(`./${tag}.sql`, import.meta.url)), 'utf8');
  return text
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

describe('migration journal', () => {
  it('numbers every entry contiguously from zero and names a file that exists', () => {
    journal.entries.forEach((entry, position) => {
      expect(entry.idx).toBe(position);
      expect(entry.tag.startsWith(String(position).padStart(4, '0'))).toBe(true);
      expect(migration(entry.tag).length).toBeGreaterThan(0);
    });
  });

  /**
   * `db/migrations/README.md` declares `0000_init` immutable. Nothing after it may drop or recreate
   * a table the baseline already owns — a regenerated baseline is how a deployed database and the
   * schema silently diverge.
   */
  it('keeps every migration after the baseline purely additive', () => {
    for (const entry of journal.entries.slice(1)) {
      for (const statement of migration(entry.tag)) {
        expect(statement).not.toMatch(/^DROP\s+TABLE/i);
        expect(statement).not.toMatch(/\bDROP\s+COLUMN\b/i);
      }
    }
  });
});

describe('0001_speaker_unavailability', () => {
  const statements = migration('0001_speaker_unavailability');
  const createTable = statements.find((statement) =>
    /^CREATE TABLE "speaker_unavailability"/.test(statement),
  );

  it('creates the table', () => {
    expect(createTable).toBeDefined();
  });

  /**
   * The rule at the top of `db/schema.ts`: every event-owned table carries `eventId` from day one.
   * `participant_id` alone would technically reach the event through a join, but the column is what
   * makes an event-scoped read and an `ON DELETE cascade` from `event` possible without one.
   */
  it('carries event_id and cascades from both of its owners', () => {
    expect(createTable).toMatch(/"event_id" uuid NOT NULL/);
    expect(createTable).toMatch(/"participant_id" uuid NOT NULL/);

    const foreignKeys = statements.filter((statement) => /ADD CONSTRAINT .* FOREIGN KEY/.test(statement));
    expect(foreignKeys).toHaveLength(2);
    for (const key of foreignKeys) {
      expect(key).toMatch(/ON DELETE cascade/);
    }
    expect(foreignKeys.join('\n')).toMatch(/REFERENCES "public"\."event"\("id"\)/);
    expect(foreignKeys.join('\n')).toMatch(/REFERENCES "public"\."participant"\("id"\)/);
  });

  /**
   * The whole timezone decision is visible right here: both bounds are `timestamp with time zone`,
   * so a window is an absolute instant comparable against `scheduled_session.starts_at` without any
   * conversion. A bare `timestamp` would make the stored value mean whatever zone the reader assumed
   * — which is exactly the bug this feature would be worse than useless for having.
   */
  it('stores both bounds as absolute instants', () => {
    expect(createTable).toMatch(/"starts_at" timestamp with time zone NOT NULL/);
    expect(createTable).toMatch(/"ends_at" timestamp with time zone NOT NULL/);
    expect(createTable).not.toMatch(/"(starts|ends)_at" timestamp(?! with time zone)/);
  });

  /** The authoring zone is required, because a window rendered in the wrong zone is a wrong window. */
  it('requires the authoring timezone and leaves the note optional', () => {
    expect(createTable).toMatch(/"authored_timezone" text NOT NULL/);
    expect(createTable).toMatch(/"note" text,/);
  });

  it('refuses a zero-length or inverted window in the database, not only in Zod', () => {
    expect(createTable).toMatch(
      /CONSTRAINT "speaker_unavailability_window_check" CHECK \([^)]*"ends_at" > [^)]*"starts_at"\)/,
    );
  });

  /** Detection reads every window for one participant, and the board reads every window for one event. */
  it('indexes both of the paths that read it', () => {
    const indexes = statements.filter((statement) => statement.startsWith('CREATE INDEX'));
    expect(indexes.join('\n')).toMatch(/speaker_unavailability_participant_idx.*"participant_id","starts_at"/);
    expect(indexes.join('\n')).toMatch(/speaker_unavailability_event_idx.*"event_id","starts_at"/);
  });
});
