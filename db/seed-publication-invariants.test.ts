import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

function participantInsert(path: string): string {
  const match = source(path).match(
    /const participants = await db\s+\.insert\(participant\)[\s\S]*?\.returning\(\);/,
  );
  expect(match, `${path} should contain its participant fixture insert`).not.toBeNull();
  return match![0];
}

describe('public speaker seed invariants', () => {
  it.each(['./seed.ts', './seeds/first-settlement.ts'])(
    'marks the public profiles in %s as confirmed',
    (path) => {
      expect(participantInsert(path)).toContain("workflowStatus: 'confirmed' as const");
    },
  );

  /**
   * The demo event published its entire roster without headshots because the generator was wired
   * into one seed and not the other, and nothing failed on the way: `headshot_file_id` is nullable,
   * `speakerHeadshotPath` answers null for it, and the roster quietly renders initials. Assert the
   * wiring, since no type is going to.
   */
  it.each(['./seed.ts', './seeds/first-settlement.ts'])(
    'gives the public profiles in %s a generated headshot',
    (path) => {
      expect(participantInsert(path)).toMatch(/headshotFileId: profileArt\.get\(/);
    },
  );

  it('keeps the public bundle gated to confirmed participants', () => {
    const publicQueries = source('../app/embed/queries.ts');
    expect(publicQueries).toContain("eq(participant.workflowStatus, 'confirmed')");
  });
});
