import { describe, expect, it } from 'vitest';
import { chordSignature, parseChord } from './match';
import { SCOPES, activePrefixes, allScopes, findBinding, getScope, resolveBindings } from './registry';
import type { ScopeDef } from './types';

function signaturesOf(scope: ScopeDef): string[] {
  return scope.bindings.flatMap((binding) =>
    binding.chords.map((chord) => {
      const base = chordSignature(parseChord(chord));
      return binding.prefix ? `${binding.prefix}>${base}` : base;
    }),
  );
}

describe('registry integrity', () => {
  it('gives every binding something for the overlay to draw', () => {
    for (const scope of allScopes()) {
      expect(scope.title, `${scope.id} has no title`).toBeTruthy();
      for (const binding of scope.bindings) {
        expect(binding.label, `${scope.id}/${binding.id} has no label`).toBeTruthy();
        expect(binding.group, `${scope.id}/${binding.id} has no group`).toBeTruthy();
      }
    }
  });

  it('never binds one keystroke twice inside a single scope', () => {
    for (const scope of allScopes()) {
      const signatures = signaturesOf(scope);
      expect(new Set(signatures).size, `${scope.id} binds a key twice`).toBe(signatures.length);
    }
  });

  it('keeps binding ids unique inside a scope, since handlers are keyed by id', () => {
    for (const scope of allScopes()) {
      const ids = scope.bindings.map((binding) => binding.id);
      expect(new Set(ids).size, `${scope.id} reuses a binding id`).toBe(ids.length);
    }
  });
});

/**
 * The migration fence. These are the exact chords the two hand-rolled `window` listeners shipped
 * before this engine existed; anyone who had them in their fingers should not be able to tell that
 * anything changed. A deliberate change to the set has to come here and say so.
 */
describe('migrated chords', () => {
  it('reproduces the submissions queue', () => {
    const scope = getScope(SCOPES.submissionsQueue);
    expect(scope).toBeDefined();
    expect(new Set(signaturesOf(scope as ScopeDef))).toEqual(
      new Set([
        'j',
        'k',
        'x',
        'o',
        'enter',
        'escape',
        'a',
        'd',
        'w',
        'shift+a',
        'shift+d',
        'shift+h',
        'shift+c',
      ]),
    );
  });

  it('reproduces the review detail screen', () => {
    const scope = getScope(SCOPES.submissionDetail);
    expect(scope).toBeDefined();
    expect(new Set(signaturesOf(scope as ScopeDef))).toEqual(
      new Set([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        'arrowup',
        'arrowdown',
        's',
        'c',
        'j',
        'k',
        'u',
        'a',
        'w',
        'd',
      ]),
    );
  });
});

describe('resolveBindings', () => {
  it('puts the screen you are on above the keys that are always there', () => {
    const resolved = resolveBindings([SCOPES.organizerGlobal, SCOPES.submissionsQueue]);
    expect(resolved[0].scope.id).toBe(SCOPES.submissionsQueue);
    expect(resolved.some((entry) => entry.scope.id === SCOPES.organizerGlobal)).toBe(true);
  });

  it('lets an inner scope take a key an outer scope also wants', () => {
    const resolved = resolveBindings([SCOPES.organizerGlobal, SCOPES.agenda]);
    // The agenda's `1`–`6` view switch and the shell's `g`-prefixed keys coexist, but were the
    // shell ever to claim a bare `1`, only the agenda's would survive resolution.
    const bare = resolved.filter(
      (entry) => !entry.binding.prefix && entry.binding.chords.includes('1'),
    );
    expect(bare).toHaveLength(1);
    expect(bare[0].scope.id).toBe(SCOPES.agenda);
  });

  it('silences everything under a modal scope', () => {
    const resolved = resolveBindings([
      SCOPES.organizerGlobal,
      SCOPES.submissionsQueue,
      SCOPES.dialog,
    ]);
    expect(resolved).toHaveLength(0);
  });

  it('ignores a scope id nothing declares', () => {
    expect(resolveBindings(['organizer.nonexistent'])).toHaveLength(0);
  });

  it('keeps a chordless documentation row visible', () => {
    const resolved = resolveBindings([SCOPES.agenda]);
    expect(resolved.some((entry) => entry.binding.id === 'lift')).toBe(true);
  });
});

describe('findBinding', () => {
  const stack = [SCOPES.organizerGlobal, SCOPES.submissionsQueue];

  it('fires the innermost binding for a plain keystroke', () => {
    const match = findBinding(stack, { key: 'a' }, null);
    expect(match?.binding.id).toBe('accept');
    expect(match?.scope.id).toBe(SCOPES.submissionsQueue);
  });

  it('holds a prefixed binding back until its prefix is armed', () => {
    expect(findBinding(stack, { key: 'a' }, null)?.binding.id).toBe('accept');
    expect(findBinding(stack, { key: 'a' }, 'g')?.binding.id).toBe('goto-agenda');
  });

  it('will not fire an unprefixed binding while a prefix is armed', () => {
    // `g` then `j` means nothing; it must not fall through to "next submission".
    expect(findBinding(stack, { key: 'j' }, 'g')).toBeNull();
  });

  it('reports which key of a range fired, so the score binding knows the digit', () => {
    const match = findBinding([SCOPES.submissionDetail], { key: '7' }, null);
    expect(match?.binding.id).toBe('score');
    expect(match?.chord).toBe('7');
  });

  it('keeps looking when the caller vetoes a candidate', () => {
    // What the provider does while the user is typing: only `allowInInput` bindings survive.
    const typing = findBinding(stack, { key: 'k', metaKey: true }, null, (candidate) =>
      Boolean(candidate.binding.allowInInput),
    );
    expect(typing?.binding.id).toBe('command-palette');
    expect(findBinding(stack, { key: 'a' }, null, () => false)).toBeNull();
  });

  it('never lets a modified keystroke reach a bare letter', () => {
    expect(findBinding(stack, { key: 'a', metaKey: true }, null)).toBeNull();
  });
});

describe('activePrefixes', () => {
  it('arms g wherever the shell is mounted', () => {
    expect(activePrefixes([SCOPES.organizerGlobal])).toEqual(new Set(['g']));
  });

  it('arms nothing under a modal scope', () => {
    expect(activePrefixes([SCOPES.organizerGlobal, SCOPES.dialog]).size).toBe(0);
  });
});
