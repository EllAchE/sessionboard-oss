import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(fileURLToPath(new URL('./0021_hot_xorn.sql', import.meta.url)), 'utf8');

describe('0021 agenda optimizer inputs', () => {
  it('backfills event weights with the tuned defaults', () => {
    expect(sql).toContain('ADD COLUMN "agenda_optimization_weights" jsonb DEFAULT');
    for (const pair of [
      '"audienceOverlap":85',
      '"expectedAttendance":100',
      '"speakerPopularity":55',
      '"roomFit":90',
      '"venueFlow":30',
      '"scheduleCompactness":35',
    ]) {
      expect(sql).toContain(pair);
    }
  });

  it('adds nullable organizer forecasts without inventing data for existing records', () => {
    expect(sql).toContain('ALTER TABLE "participant" ADD COLUMN "popularity_score" integer');
    expect(sql).toContain('ALTER TABLE "submission" ADD COLUMN "expected_attendance" integer');
    expect(sql).not.toMatch(/(popularity_score|expected_attendance).*NOT NULL/);
  });

  it('bounds both forecasts and contains no destructive statement', () => {
    expect(sql).toContain('participant_popularity_score_check');
    expect(sql).toContain('between 0 and 100');
    expect(sql).toContain('submission_expected_attendance_check');
    expect(sql).toContain('between 0 and 1000000');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT)|RENAME/i);
  });
});
