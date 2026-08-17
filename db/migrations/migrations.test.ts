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

/**
 * `AD-9`. A share link is a bearer credential that reads unpublished programme material, so the
 * columns below are not schema taste — each one is load-bearing for a security claim the feature
 * makes, and each is asserted here so a later regeneration cannot quietly drop it.
 */
describe('0002_share_link', () => {
  const statements = migration('0002_share_link');
  const createTable = statements.find((statement) => /^CREATE TABLE "share_link"/.test(statement));

  it('creates the table with the columns the feature reads', () => {
    expect(createTable).toBeDefined();
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
      expect(createTable, `share_link should carry ${column}`).toMatch(new RegExp(`"${column}"`));
    }
  });

  /**
   * Unlike `api_key`, which this table is otherwise shaped after, the expiry is mandatory. A
   * nullable one would let a link outlive the draft it was minted for, and the whole reason an
   * organizer will paste this into an email to a stranger is that it stops working on its own.
   */
  it('requires an expiry on every link', () => {
    expect(createTable).toMatch(/"expires_at" timestamp with time zone NOT NULL/);
  });

  /**
   * Every token table in this schema stores a digest, and `lib/ids.ts` exists so none of them has to
   * store anything else. A plaintext column here would make the database a list of live URLs.
   */
  it('stores a hash rather than the token, and refuses duplicates of it', () => {
    expect(createTable).toMatch(/"token_hash" text NOT NULL/);
    expect(createTable).toMatch(/UNIQUE\("token_hash"\)/);
    expect(createTable).not.toMatch(/"token"\s/);
    expect(createTable).not.toMatch(/"plaintext"/);
  });

  /** Soft revoke, following `api_key`: nullable, so a live row is `revoked_at is null`. */
  it('keeps revocation nullable so revoking is an update rather than a delete', () => {
    expect(createTable).toMatch(/"revoked_at" timestamp with time zone(?! NOT NULL)/);
  });

  /**
   * The two foreign keys deliberately differ. Deleting the event must take its links with it, but
   * attribution outlives the account that minted one — a `cascade` there would delete the audit
   * trail of every link a departing organizer ever issued.
   */
  it('cascades from the event and nulls the minting user', () => {
    expect(createTable).toMatch(/"event_id" uuid NOT NULL/);

    const byEvent = statements.find(
      (statement) => statement.includes('ADD CONSTRAINT') && statement.includes('"event_id"'),
    );
    const byUser = statements.find(
      (statement) =>
        statement.includes('ADD CONSTRAINT') && statement.includes('"created_by_user_id"'),
    );

    expect(byEvent).toMatch(/REFERENCES "public"\."event"\("id"\) ON DELETE cascade/);
    expect(byUser).toMatch(/REFERENCES "public"\."user"\("id"\) ON DELETE set null/);
  });

  /** Resolution is a prefix lookup on every anonymous request; unindexed it is a table scan. */
  it('indexes the prefix that resolution looks up', () => {
    const indexes = statements.filter((statement) => statement.startsWith('CREATE INDEX'));
    expect(indexes.join('\n')).toMatch(/share_link_prefix_idx.*USING btree \("prefix"\)/);
  });

  /**
   * The enum is the scope boundary: a link can only ever name a view in this list, so a value
   * arriving here later is a widening that should be argued for rather than typed. `exhibitor-map`
   * is absent deliberately — it reads a floorplan file through its own loader, not the bundle.
   */
  it('limits a link to the bundle-driven views', () => {
    const type = statements.find((statement) =>
      /CREATE TYPE "public"\."share_link_view"/.test(statement),
    );
    expect(type).toMatch(
      /ENUM\('agenda', 'itinerary', 'sessions', 'speakers', 'gallery', 'sponsors'\)/,
    );
    expect(type).not.toMatch(/exhibitor-map/);
  });

  /**
   * The delta is one new table. Migrations are generated from a cumulative snapshot, so an
   * `ALTER TABLE` against anything else in this file would mean the generation picked up another
   * workstream's pending schema change and is about to land it under this migration's name.
   */
  it('touches no existing table', () => {
    const foreign = statements.filter(
      (statement) =>
        /^(ALTER|DROP) TABLE/.test(statement) && !statement.includes('ALTER TABLE "share_link"'),
    );
    expect(foreign).toEqual([]);
  });
});
