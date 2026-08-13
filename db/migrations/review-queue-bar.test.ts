import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  fileURLToPath(new URL('./0017_smart_thanos.sql', import.meta.url)),
  'utf8',
);

describe('0017 configurable review queue bar', () => {
  it('preserves the historical midpoint and constrains the shared 1–5 scale', () => {
    expect(sql).toContain('"decision_queue_bar_tenths" integer DEFAULT 30 NOT NULL');
    expect(sql).toContain('between 10 and 50');
  });
});
