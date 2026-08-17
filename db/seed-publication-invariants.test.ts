import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

/**
 * `sized-roster.ts` writes a second roster onto the same events — the generated crowd that brings
 * each sample event up to its size profile. It is held to the same two invariants, because a
 * gallery of forty invited speakers is exactly as empty as a gallery of seven.
 */
const SEEDS = [
  './seed.ts',
  './seeds/first-settlement.ts',
  './seeds/sized-roster.ts',
] as const;

function participantInsert(path: string): string {
  const match = source(path).match(
    /const \w+ = await db\s+\.insert\(participant\)[\s\S]*?\.returning\(\);/,
  );
  expect(match, `${path} should contain its participant fixture insert`).not.toBeNull();
  return match![0];
}

describe('public speaker seed invariants', () => {
  it.each(SEEDS)(
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
  it.each(SEEDS)(
    'gives the public profiles in %s a generated headshot',
    (path) => {
      expect(participantInsert(path)).toMatch(/headshotFileId: profileArt\.get\(/);
    },
  );

  /**
   * The sized siblings build their call for speakers from the shared helpers rather than a third
   * hand-written copy of the built-in field list — the drift `seed-form-invariants.test.ts` exists
   * to catch. Assert they keep reaching for the helpers instead of spelling the fields out.
   */
  it('builds the sized sibling CFP from the shared form helpers', () => {
    const sizedDemo = source('./seeds/sized-demo.ts');
    expect(sizedDemo).toContain('seedBuiltinFields(cfp.id)');
    expect(sizedDemo).toContain('seedRoles(cfp.id)');
    expect(sizedDemo).not.toMatch(/builtinKey: '/);
  });

  it('keeps the public bundle gated to confirmed participants', () => {
    const publicQueries = source('../app/embed/queries.ts');
    expect(publicQueries).toContain("eq(participant.workflowStatus, 'confirmed')");
  });
});
