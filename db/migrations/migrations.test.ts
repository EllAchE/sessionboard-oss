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
 *
 * The assertions below are deliberately not a transcription of `db/schema.ts`. Each one names a
 * column or constraint that some feature's correctness or security argument rests on, so that
 * regenerating the baseline cannot silently drop it — regeneration is a supported operation here
 * (see `README.md`) and these are what make it safe.
 */

function migration(tag: string): string[] {
  const text = readFileSync(fileURLToPath(new URL(`./${tag}.sql`, import.meta.url)), 'utf8');
  return text
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const baseline = migration('0000_init');

/** Drizzle emits one `CREATE TABLE` per table, then every foreign key, then every index. */
function createTable(table: string): string {
  const statement = baseline.find((candidate) =>
    new RegExp(`^CREATE TABLE "${table}" \\(`).test(candidate),
  );
  expect(statement, `0000_init should create ${table}`).toBeDefined();
  return statement!;
}

function foreignKeysOf(table: string): string[] {
  return baseline.filter((statement) =>
    new RegExp(`^ALTER TABLE "${table}" ADD CONSTRAINT .* FOREIGN KEY`).test(statement),
  );
}

function indexesOf(table: string): string {
  return baseline
    .filter((statement) => new RegExp(`^CREATE INDEX .* ON "${table}" `).test(statement))
    .join('\n');
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
   * `0000_init` is the whole schema, so it is the only migration that may create tables. Anything
   * appended after it is a delta against a database that already exists — a `DROP TABLE` or
   * `DROP COLUMN` there is data loss rather than a schema edit, and wanting one is the signal to
   * regenerate the baseline instead.
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

describe('speaker_unavailability', () => {
  const table = createTable('speaker_unavailability');

  /**
   * The rule at the top of `db/schema.ts`: every event-owned table carries `eventId` from day one.
   * `participant_id` alone would technically reach the event through a join, but the column is what
   * makes an event-scoped read and an `ON DELETE cascade` from `event` possible without one.
   */
  it('carries event_id and cascades from both of its owners', () => {
    expect(table).toMatch(/"event_id" uuid NOT NULL/);
    expect(table).toMatch(/"participant_id" uuid NOT NULL/);

    const foreignKeys = foreignKeysOf('speaker_unavailability');
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
    expect(table).toMatch(/"starts_at" timestamp with time zone NOT NULL/);
    expect(table).toMatch(/"ends_at" timestamp with time zone NOT NULL/);
    expect(table).not.toMatch(/"(starts|ends)_at" timestamp(?! with time zone)/);
  });

  /** The authoring zone is required, because a window rendered in the wrong zone is a wrong window. */
  it('requires the authoring timezone and leaves the note optional', () => {
    expect(table).toMatch(/"authored_timezone" text NOT NULL/);
    expect(table).toMatch(/"note" text,/);
  });

  it('refuses a zero-length or inverted window in the database, not only in Zod', () => {
    expect(table).toMatch(
      /CONSTRAINT "speaker_unavailability_window_check" CHECK \([^)]*"ends_at" > [^)]*"starts_at"\)/,
    );
  });

  /** Detection reads every window for one participant, and the board reads every window for one event. */
  it('indexes both of the paths that read it', () => {
    expect(indexesOf('speaker_unavailability')).toMatch(
      /speaker_unavailability_participant_idx.*"participant_id","starts_at"/,
    );
    expect(indexesOf('speaker_unavailability')).toMatch(
      /speaker_unavailability_event_idx.*"event_id","starts_at"/,
    );
  });
});

/**
 * `AD-9`. A share link is a bearer credential that reads unpublished programme material, so the
 * columns below are not schema taste — each one is load-bearing for a security claim the feature
 * makes, and each is asserted here so a later regeneration cannot quietly drop it.
 */
describe('share_link', () => {
  const table = createTable('share_link');

  it('creates the table with the columns the feature reads', () => {
    for (const column of [
      'event_id',
      'label',
      'view',
      'prefix',
      'token_hash',
      'expires_at',
      'revoked_at',
      'last_viewed_at',
      'view_count',
    ]) {
      expect(table, `share_link should carry ${column}`).toMatch(new RegExp(`"${column}"`));
    }
  });

  /**
   * Unlike `api_key`, which this table is otherwise shaped after, the expiry is mandatory. A
   * nullable one would let a link outlive the draft it was minted for, and the whole reason an
   * organizer will paste this into an email to a stranger is that it stops working on its own.
   */
  it('requires an expiry on every link', () => {
    expect(table).toMatch(/"expires_at" timestamp with time zone NOT NULL/);
  });

  /**
   * Every token table in this schema stores a digest, and `lib/ids.ts` exists so none of them has to
   * store anything else. A plaintext column here would make the database a list of live URLs.
   */
  it('stores a hash rather than the token, and refuses duplicates of it', () => {
    expect(table).toMatch(/"token_hash" text NOT NULL/);
    expect(table).toMatch(/UNIQUE\("token_hash"\)/);
    expect(table).not.toMatch(/"token"\s/);
    expect(table).not.toMatch(/"plaintext"/);
  });

  /** Soft revoke, following `api_key`: nullable, so a live row is `revoked_at is null`. */
  it('keeps revocation nullable so revoking is an update rather than a delete', () => {
    expect(table).toMatch(/"revoked_at" timestamp with time zone(?! NOT NULL)/);
  });

  /**
   * The two foreign keys deliberately differ. Deleting the event must take its links with it, but
   * attribution outlives the account that minted one — a `cascade` there would delete the audit
   * trail of every link a departing organizer ever issued.
   */
  it('cascades from the event and nulls the minting user', () => {
    expect(table).toMatch(/"event_id" uuid NOT NULL/);

    const keys = foreignKeysOf('share_link');
    const byEvent = keys.find((statement) => statement.includes('"event_id"'));
    const byUser = keys.find((statement) => statement.includes('"created_by_user_id"'));

    expect(byEvent).toMatch(/REFERENCES "public"\."event"\("id"\) ON DELETE cascade/);
    expect(byUser).toMatch(/REFERENCES "public"\."user"\("id"\) ON DELETE set null/);
  });

  /** Resolution is a prefix lookup on every anonymous request; unindexed it is a table scan. */
  it('indexes the prefix that resolution looks up', () => {
    expect(indexesOf('share_link')).toMatch(/share_link_prefix_idx.*USING btree \("prefix"\)/);
  });

  /**
   * The enum is the scope boundary: a link can only ever name a view in this list, so a value
   * arriving here later is a widening that should be argued for rather than typed. `exhibitor-map`
   * is absent deliberately — it reads a floorplan file through its own loader, not the bundle.
   */
  it('limits a link to the bundle-driven views', () => {
    const type = baseline.find((statement) =>
      /CREATE TYPE "public"\."share_link_view"/.test(statement),
    );
    expect(type).toMatch(
      /ENUM\('agenda', 'itinerary', 'sessions', 'speakers', 'gallery', 'sponsors'\)/,
    );
    expect(type).not.toMatch(/exhibitor-map/);
  });
});

/**
 * `AD-4`. Revision numbering is what lets two people say "revision 4" and mean the same edit, so
 * the uniqueness below is the whole feature rather than a constraint over it. A fresh database
 * creates the column already `NOT NULL`; the ordering it is expected to satisfy is asserted against
 * a real Postgres in `lib/services/content.integration.test.ts`, which is the only place it can be.
 */
describe('content_revision', () => {
  const table = createTable('content_revision');

  it('covers every entity kind that records revisions', () => {
    const type = baseline.find((statement) =>
      /CREATE TYPE "public"\."content_revision_kind"/.test(statement),
    );
    for (const value of ['session', 'participant', 'scheduled_session', 'sponsor']) {
      expect(type, `content_revision_kind should include ${value}`).toMatch(
        new RegExp(`'${value}'`),
      );
    }
  });

  /** A nullable number would let a row exist that no reader can cite. */
  it('requires a revision number on every row', () => {
    expect(table).toMatch(/"revision_number" integer NOT NULL/);
  });

  /**
   * Per entity, not per event. Scoped any wider, "revision 4" would name four different things
   * inside one event; the unique constraint is also what settles a race between two concurrent
   * inserts, which no application-side `max() + 1` can.
   */
  it('makes the number unique per entity', () => {
    expect(table).toMatch(
      /CONSTRAINT "content_revision_entity_number" UNIQUE\("event_id","entity_kind","entity_id","revision_number"\)/,
    );
  });

  /** Attribution outlives the account that made the edit, so the editor is nulled rather than cascaded. */
  it('cascades from the event and nulls the editor', () => {
    const keys = foreignKeysOf('content_revision');
    expect(keys.find((statement) => statement.includes('"event_id"'))).toMatch(
      /REFERENCES "public"\."event"\("id"\) ON DELETE cascade/,
    );
    expect(keys.find((statement) => statement.includes('"editor_user_id"'))).toMatch(
      /REFERENCES "public"\."user"\("id"\) ON DELETE set null/,
    );
  });
});
