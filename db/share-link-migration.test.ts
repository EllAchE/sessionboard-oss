import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `AD-9`. A file-text test over the generated migration, in the same shape as the seed-invariant
 * tests: the fast suite has no Postgres, so the assertions read the SQL rather than apply it.
 * CI's integration job does apply it — `bun run db:migrate` runs before `bun run test:integration` —
 * so this file's job is not "does it execute" but "does it still say what the feature depends on".
 *
 * It resolves the migration by content rather than by filename. The migration is regenerated and
 * renumbered whenever another migration lands first, and a test pinned to `0001_dazzling_argent`
 * would have to be edited on every rebase — which is exactly when nobody wants to be editing tests.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/**
 * The statements of the one migration that introduces `share_link`, and nothing else. Scoped to a
 * single file rather than the whole directory for two reasons: `0000_init.sql` is the immutable
 * baseline and would answer every assertion below with some other table's DDL, and a concurrently
 * landed migration from another workstream must not be able to fail this file's assertions.
 */
function statements(): string[] {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql') && name !== '0000_init.sql')
    .map((name) => readFileSync(`${MIGRATIONS_DIR}${name}`, 'utf8'))
    .find((sql) => sql.includes('CREATE TABLE "share_link"'));

  expect(file, 'a migration after the baseline should create share_link').toBeDefined();
  return file!
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function createTable(): string {
  const match = statements().find((statement) => /^CREATE TABLE "share_link"/.test(statement));
  expect(match, 'a migration should create the share_link table').toBeDefined();
  return match!;
}

describe('share_link migration', () => {
  it('creates the table with the columns the feature reads', () => {
    const sql = createTable();
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
      expect(sql, `share_link should carry ${column}`).toMatch(new RegExp(`"${column}"`));
    }
  });

  /**
   * The two columns the security story rests on. A nullable `expires_at` would let a link outlive
   * the draft it was minted for, and a `token_hash` column that ever held plaintext would undo the
   * reason every token table in this schema stores a digest.
   */
  it('requires an expiry on every link', () => {
    expect(createTable()).toMatch(/"expires_at" timestamp with time zone NOT NULL/);
  });

  it('stores a hash rather than the token, and refuses duplicates of it', () => {
    const sql = createTable();
    expect(sql).toMatch(/"token_hash" text NOT NULL/);
    expect(sql).toMatch(/UNIQUE\("token_hash"\)/);
    // A plaintext column would have to be named something; assert the obvious spellings are absent.
    expect(sql).not.toMatch(/"token"\s/);
    expect(sql).not.toMatch(/"plaintext"/);
  });

  /** Soft revoke, following `api_key`: nullable, so a live row is `revoked_at is null`. */
  it('keeps revocation nullable so revoking is an update rather than a delete', () => {
    expect(createTable()).toMatch(/"revoked_at" timestamp with time zone(?! NOT NULL)/);
  });

  it('scopes every link to one event, and drops links when the event goes', () => {
    const sql = createTable();
    expect(sql).toMatch(/"event_id" uuid NOT NULL/);

    const fk = statements().find(
      (statement) =>
        statement.includes('ALTER TABLE "share_link"') && statement.includes('"event_id"'),
    );
    expect(fk, 'share_link.event_id should be a foreign key').toBeDefined();
    expect(fk!).toMatch(/REFERENCES "public"\."event"\("id"\) ON DELETE cascade/);
  });

  /**
   * Attribution outlives the account that minted the link, so this one nulls rather than cascading.
   * If it ever became `cascade`, deleting a departed organizer would silently delete the audit trail
   * of every link they issued.
   */
  it('keeps the minting user nullable and non-cascading', () => {
    const fk = statements().find(
      (statement) =>
        statement.includes('ALTER TABLE "share_link"') &&
        statement.includes('"created_by_user_id"'),
    );
    expect(fk).toBeDefined();
    expect(fk!).toMatch(/ON DELETE set null/);
  });

  /** Resolution is a prefix lookup on every anonymous request; unindexed it is a table scan. */
  it('indexes the prefix that resolution looks up', () => {
    const index = statements().find((statement) =>
      /CREATE INDEX "share_link_prefix_idx"/.test(statement),
    );
    expect(index).toBeDefined();
    expect(index!).toMatch(/ON "share_link" USING btree \("prefix"\)/);
  });

  /**
   * The enum is the scope boundary: a link can only ever name a view in this list, so a value
   * arriving here later is a widening that should be argued for rather than typed. `exhibitor-map`
   * is absent deliberately — it reads a floorplan file through its own loader, not the bundle.
   */
  it('limits a link to the bundle-driven views', () => {
    const type = statements().find((statement) =>
      /CREATE TYPE "public"\."share_link_view"/.test(statement),
    );
    expect(type).toBeDefined();
    expect(type!).toMatch(
      /ENUM\('agenda', 'itinerary', 'sessions', 'speakers', 'gallery', 'sponsors'\)/,
    );
    expect(type!).not.toMatch(/exhibitor-map/);
  });

  /**
   * The delta is one new table. Migrations are generated from a cumulative snapshot, so an
   * `ALTER TABLE` against anything else *in this file* would mean the generation picked up another
   * workstream's pending schema change and is about to land it under this PR's name.
   */
  it('touches no existing table', () => {
    const foreign = statements().filter(
      (statement) =>
        /^(ALTER|DROP) TABLE/.test(statement) && !statement.includes('ALTER TABLE "share_link"'),
    );
    expect(foreign).toEqual([]);
  });
});
