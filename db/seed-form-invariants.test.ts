import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FIELDS,
  PARTICIPANT_BUILTIN_FIELDS,
} from '../lib/forms/contract';
import { seedBuiltinFields, seedRoles } from '../lib/services/forms';

/**
 * A seed that writes a `cfp` form by hand is a second implementation of `createForm`, and it drifted:
 * both files wrote five of the six built-ins and set `status: 'open'` directly, bypassing the publish
 * gate. The demo worked right up until an organizer opened the form in the builder and pressed
 * Publish, which failed with "missing built-in field: tags" — a message they could do nothing about,
 * because built-ins are deliberately not in the palette.
 *
 * Three things now stand between that and a repeat: `ensureFormBuiltins` repairs the invariant at
 * publish time, migration `0008` repairs the databases that already exist, and this holds the seeds
 * themselves to the contract so the drift does not simply happen again.
 */

const SEEDS = ['./seed.ts', './seeds/first-settlement.ts'] as const;

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

describe.each(SEEDS)('%s', (path) => {
  const text = source(path);

  it('declares every one of the six abstract built-ins', () => {
    const missing = BUILTIN_FIELDS.filter((key) => !text.includes(`builtinKey: '${key}'`));
    expect(missing).toEqual([]);
  });

  /**
   * The participant set is written from the constant rather than spelled out, so the assertion is
   * that the seed reaches for the constant at all — spelling five more keys out by hand would be the
   * same mistake in a new place.
   */
  it('takes the participant field set from the shared constant', () => {
    expect(text).toContain('PARTICIPANT_BUILTIN_FIELDS');
    expect(text).toContain('PARTICIPANT_BUILTIN_META');
  });

  it('configures participant roles rather than leaving the form without any', () => {
    expect(text).toContain('formParticipantRole');
  });
});

describe('seedBuiltinFields', () => {
  it('covers both built-in namespaces in full', () => {
    const rows = seedBuiltinFields('form-1');
    expect(rows.filter((row) => row.entity === 'abstract').map((row) => row.builtinKey)).toEqual([
      ...BUILTIN_FIELDS,
    ]);
    expect(rows.filter((row) => row.entity === 'participant').map((row) => row.builtinKey)).toEqual([
      ...PARTICIPANT_BUILTIN_FIELDS,
    ]);
  });

  it('writes the `F-5` caps onto the row rather than leaving them unlimited', () => {
    const rows = seedBuiltinFields('form-1');
    expect(rows.find((row) => row.builtinKey === 'title')?.maxLength).toBe(255);
    expect(rows.find((row) => row.builtinKey === 'description')?.maxLength).toBe(5000);
  });
});

describe('seedRoles', () => {
  /**
   * Permissive on purpose. A default that blocked a submission would be a limit the organizer never
   * chose and could not explain to the speaker who hit it.
   */
  it('requires one speaker and caps nothing else', () => {
    const roles = seedRoles('form-1');
    expect(roles.map((role) => role.kind)).toEqual(['speaker', 'co_speaker']);
    expect(roles.find((role) => role.kind === 'speaker')?.minCount).toBe(1);
    expect(roles.find((role) => role.kind === 'co_speaker')?.maxCount).toBeNull();
  });
});
