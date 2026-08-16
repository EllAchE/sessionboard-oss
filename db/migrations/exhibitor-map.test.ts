import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  fileURLToPath(new URL('./0021_nappy_the_twelve.sql', import.meta.url)),
  'utf8',
);

describe('0021 exhibitor map migration', () => {
  it('adds a one-file-per-event slot without rewriting populated tables', () => {
    expect(sql).toContain('CREATE TABLE "event_exhibitor_map"');
    expect(sql).toContain('"event_id" uuid PRIMARY KEY NOT NULL');
    expect(sql).toContain('CONSTRAINT "event_exhibitor_map_file_unique" UNIQUE("file_id")');
    expect(sql).toMatch(/FOREIGN KEY \("event_id"\).*"event"\("id"\) ON DELETE cascade/);
    expect(sql).toMatch(/FOREIGN KEY \("file_id"\).*"file"\("id"\) ON DELETE restrict/);
    expect(sql).not.toMatch(/ALTER TABLE "event" ADD COLUMN/);
    expect(sql).not.toMatch(/ALTER TABLE "file" ADD COLUMN/);
  });
});
