import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `0018` is data-only, so schema snapshots cannot describe the guarantees that matter: a tighter
 * organizer limit must survive, a repeated run must become a no-op, and a configured role set must
 * not be replaced by defaults. Pin those properties at the SQL seam where a regenerated custom
 * migration could otherwise silently lose them.
 */
const sql = readFileSync(
  fileURLToPath(new URL('./0018_form_invariant_repairs.sql', import.meta.url)),
  'utf8',
);

const statements = sql
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())
  .filter(Boolean);

describe('0018 F-5 cap repair', () => {
  const repair = statements.find((statement) => /^\/\*[\s\S]*UPDATE "form_field" AS ff/.test(statement));

  it('fills or clamps only the two capped abstract built-ins on CFP forms', () => {
    expect(repair).toBeDefined();
    expect(repair).toContain("('title', 255)");
    expect(repair).toContain("('description', 5000)");
    expect(repair).toMatch(/f\."kind" = 'cfp'/);
    expect(repair).toMatch(/ff\."entity" = 'abstract'/);
    expect(repair).toMatch(/ff\."builtin_key" = limits\."builtin_key"/);
  });

  it('preserves tighter limits and becomes a no-op after the first run', () => {
    const expression = 'LEAST(COALESCE(ff."max_length", limits."cap"), limits."cap")';
    expect(repair).toContain(`SET "max_length" = ${expression}`);
    expect(repair).toContain(`ff."max_length" IS DISTINCT FROM\n    ${expression}`);
  });
});

describe('0018 participant-role repair', () => {
  const repair = statements.find((statement) => /INSERT INTO "form_participant_role"/.test(statement));

  it('seeds the permissive defaults only for enabled CFP participant stages with no roles', () => {
    expect(repair).toBeDefined();
    expect(repair).toContain("('speaker', 'Speaker', 0, 1, 1)");
    expect(repair).toContain("('co_speaker', 'Co-speaker', 1, 0, NULL::integer)");
    expect(repair).toMatch(/f\."kind" = 'cfp'/);
    expect(repair).toMatch(/f\."collects_participants" = true/);
    expect(repair).toMatch(/NOT EXISTS \([\s\S]*existing\."form_id" = f\."id"/);
  });

  it('is race-safe and idempotent at the role unique key', () => {
    expect(repair).toContain(
      'ON CONFLICT ON CONSTRAINT "form_participant_role_form_kind" DO NOTHING',
    );
  });
});
