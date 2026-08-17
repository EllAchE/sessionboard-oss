import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import journal from './meta/_journal.json' with { type: 'json' };

/**
 * CI has no Postgres, so these are file-text assertions over the emitted SQL rather than a run
 * against a live database. That is a genuinely weaker test — it cannot tell you the statement
 * executes — but it catches the failure modes that actually happen to a generated migration:
 * the journal and the `.sql` files drifting apart, and the historical timestamps that populated
 * databases use as their upgrade cursor being rebased.
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

  it('preserves the shipped migration history before appending new changes', () => {
    expect(journal.entries.slice(0, 23).map(({ idx, when, tag }) => ({ idx, when, tag }))).toEqual([
      { idx: 0, when: 1786494184318, tag: '0000_init' },
      { idx: 1, when: 1786514437439, tag: '0001_file_blob' },
      { idx: 2, when: 1786516730864, tag: '0002_file_versions_and_revisions' },
      { idx: 3, when: 1786517387905, tag: '0003_crm_speaker_database' },
      { idx: 4, when: 1786517972798, tag: '0004_approval_gate_and_speaker_status' },
      { idx: 5, when: 1786588565129, tag: '0005_burly_the_watchers' },
      { idx: 6, when: 1786594323438, tag: '0006_simple_switch' },
      { idx: 7, when: 1786604771140, tag: '0007_charming_wrecker' },
      { idx: 8, when: 1786609052455, tag: '0008_tiny_maximus' },
      { idx: 9, when: 1786610788696, tag: '0009_robust_misty_knight' },
      { idx: 10, when: 1786612872318, tag: '0010_dark_the_hand' },
      { idx: 11, when: 1786614949413, tag: '0011_furry_microbe' },
      { idx: 12, when: 1786629670262, tag: '0012_tan_rictor' },
      { idx: 13, when: 1786647510357, tag: '0013_dazzling_scarlet_spider' },
      { idx: 14, when: 1786648298357, tag: '0014_classy_paper_doll' },
      { idx: 15, when: 1786649614413, tag: '0015_charming_sebastian_shaw' },
      { idx: 16, when: 1786649746298, tag: '0016_pretty_daredevil' },
      { idx: 17, when: 1786650161677, tag: '0017_smart_thanos' },
      { idx: 18, when: 1786650500000, tag: '0018_form_invariant_repairs' },
      { idx: 19, when: 1786650650229, tag: '0019_boring_adam_warlock' },
      { idx: 20, when: 1786852524963, tag: '0020_foamy_reaper' },
      { idx: 21, when: 1786898707065, tag: '0021_nappy_the_twelve' },
      { idx: 22, when: 1786920093620, tag: '0022_boring_zarda' },
    ]);
  });

  /** New migrations must not destructively rewrite the schema that the historical chain owns. */
  it('keeps newly appended migrations purely additive', () => {
    for (const entry of journal.entries.slice(23)) {
      for (const statement of migration(entry.tag)) {
        expect(statement).not.toMatch(/^DROP\s+TABLE/i);
        expect(statement).not.toMatch(/\bDROP\s+COLUMN\b/i);
      }
    }
  });
});

describe('0023_speaker_unavailability', () => {
  const statements = migration('0023_speaker_unavailability');
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
describe('0024_share_link', () => {
  const statements = migration('0024_share_link');
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

/**
 * `AD-4`. The failure this file exists to catch is exactly the one drizzle generated here: it
 * emitted `ADD COLUMN "revision_number" integer NOT NULL` as a single statement, which applies
 * perfectly to an empty database and cannot apply to one that already holds a revision. CI migrates
 * a clean server, so nothing but these assertions stands between that and every deployed database.
 *
 * Renumbered to follow the restored historical migration chain. The hand correction below does not
 * survive `db:generate`, so it has to be re-applied by whoever regenerates this migration — which
 * is what these tests are here to force.
 */
describe('0025_bumpy_post', () => {
  const statements = migration('0025_bumpy_post');
  const at = (pattern: RegExp) => statements.findIndex((statement) => pattern.test(statement));

  it('adds both new entity kinds to the enum', () => {
    for (const value of ['scheduled_session', 'sponsor']) {
      expect(statements.join('\n')).toMatch(
        new RegExp(`ALTER TYPE "public"\\."content_revision_kind" ADD VALUE '${value}'`),
      );
    }
  });

  it('adds the column nullable rather than NOT NULL in one step', () => {
    const added = statements.find((statement) => /ADD COLUMN "revision_number"/.test(statement));
    expect(added).toBeDefined();
    expect(added).not.toMatch(/NOT NULL/i);
  });

  it('backfills every existing row before demanding NOT NULL', () => {
    const backfill = at(/UPDATE "content_revision"[\s\S]*row_number\(\)/i);
    expect(backfill).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeLessThan(at(/ALTER COLUMN "revision_number" SET NOT NULL/i));
  });

  /**
   * Per entity, not per event. A partition missing `entity_id` would number every session in an
   * event into one sequence and leave "revision 4" naming four different things.
   */
  it('partitions the backfill by event, kind and entity', () => {
    expect(statements[at(/row_number\(\)/i)]).toMatch(
      /PARTITION BY "event_id", "entity_kind", "entity_id"/i,
    );
  });

  /**
   * `created_at` is not a total order — two edits inside one millisecond would be numbered
   * arbitrarily, and a re-run after a failed deploy could number them the other way round.
   */
  it('orders the backfill deterministically, with a tiebreak after created_at', () => {
    expect(statements[at(/row_number\(\)/i)]).toMatch(/ORDER BY "created_at" ASC, "id" ASC/i);
  });

  /** The unique constraint is what settles a race between two concurrent inserts. */
  it('makes the number unique per entity, and adds that constraint last', () => {
    const constraint = at(/ADD CONSTRAINT "content_revision_entity_number" UNIQUE/);
    expect(statements[constraint]).toMatch(/"event_id","entity_kind","entity_id","revision_number"/);
    expect(constraint).toBe(statements.length - 1);
  });
});
