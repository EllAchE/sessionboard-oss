import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(fileURLToPath(new URL('./0020_foamy_reaper.sql', import.meta.url)), 'utf8');

describe('0020 agenda conflict policy', () => {
  it('gives every existing event the warning default rather than the strict behaviour', () => {
    expect(sql).toMatch(
      /ALTER TABLE "event" ADD COLUMN "agenda_conflict_policy" text DEFAULT 'warn' NOT NULL/,
    );
  });

  it('closes the column to the two policies the service layer understands', () => {
    expect(sql).toContain(`in ('warn', 'block')`);
    expect(sql).toContain('event_agenda_conflict_policy_check');
  });

  it('touches nothing else', () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT)|RENAME/i);
    expect(sql.split('-->').filter((part) => part.trim().length > 0)).toHaveLength(2);
  });
});
