import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  fileURLToPath(new URL('./0019_boring_adam_warlock.sql', import.meta.url)),
  'utf8',
);

describe('0019 sponsor publication state', () => {
  it('creates a closed two-state enum and makes new rows drafts', () => {
    expect(sql).toContain(
      `CREATE TYPE "public"."sponsor_status" AS ENUM('draft', 'published')`,
    );
    expect(sql).toMatch(
      /ADD COLUMN "status" "sponsor_status" DEFAULT 'draft' NOT NULL/,
    );
  });

  it('preserves the visibility of legacy rows after adding the fail-closed default', () => {
    const add = sql.indexOf('ADD COLUMN "status"');
    const backfill = sql.indexOf(`UPDATE "sponsor" SET "status" = 'published'`);
    expect(add).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(add);
  });

  it('does not drop or rename existing sponsor data', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)|RENAME/i);
  });
});
