import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FIELDS,
  BUILTIN_META,
  PAGE_HEADING_MAX_LENGTH,
  PARTICIPANT_BUILTIN_FIELDS,
  isBuiltinKey,
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

  /**
   * A built-in's control is `BUILTIN_META`'s to decide — the builder will not let an organizer
   * retype one — so a seed that writes a different `type` is writing a value nothing will honour.
   * `db/seed.ts` wrote `radio` for `level` while the contract called it a dropdown, which is how the
   * demo's "Audience level" came to be radio buttons in the builder and a `<select>` on the public
   * form. `resolveFieldType` makes the surfaces agree; this keeps the stored row honest too.
   */
  it('gives every abstract built-in the type the contract fixes for it', () => {
    const pattern = /type: '(\w+)' as const,\s*\n\s*key: '\w+',\s*\n\s*builtinKey: '(\w+)',/g;
    const seen: string[] = [];
    for (const [, type, key] of text.matchAll(pattern)) {
      if (!isBuiltinKey(key)) continue;
      seen.push(key);
      expect({ key, type }).toEqual({ key, type: BUILTIN_META[key].type });
    }
    expect(seen.sort()).toEqual([...BUILTIN_FIELDS].sort());
  });

  it('configures participant roles rather than leaving the form without any', () => {
    expect(text).toContain('formParticipantRole');
  });

  /**
   * `F-9`'s starred welcome fields are now a publish-gate requirement on a `cfp` form, and each seed
   * writes its call for speakers by hand with `status: 'open'` already set — the exact shape of the
   * built-in-field bug above. Both seeds happen to fill them in; this is what keeps that true, so a
   * seeded demo cannot go back to hard-failing the first time an organizer presses Publish.
   */
  it('fills in the welcome screen its `cfp` form now has to have', () => {
    expect(text).toMatch(/externalTitle: '[^']+'/);
    const [, heading] = text.match(/pageHeading: '([^']+)'/) ?? [];
    expect(heading).toBeDefined();
    expect(heading!.length).toBeLessThanOrEqual(PAGE_HEADING_MAX_LENGTH);
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
