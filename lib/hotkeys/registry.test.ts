import { describe, expect, it } from 'vitest';
import { chordSignature, parseChord } from './match';
import {
  SCOPES,
  allScopes,
  findBinding,
  getScope,
  globalSignatures,
  resolveBindings,
} from './registry';
import type { ScopeDef } from './types';

function signaturesOf(scope: ScopeDef): string[] {
  return scope.bindings.flatMap((binding) =>
    binding.chords.map((chord) => chordSignature(parseChord(chord))),
  );
}

/** ⌘⌃ or Ctrl+Alt, held. What a keystroke on the workspace modifier looks like to the matcher. */
function hyper(key: string, extra: { shiftKey?: boolean } = {}) {
  return { key, metaKey: true, ctrlKey: true, ...extra };
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
 * The three rules that make this scheme what it is. Each one exists because breaking it is easy,
 * looks harmless in a diff, and is felt by whoever is using the workspace rather than by whoever
 * made the change.
 */
describe('the single-chord scheme', () => {
  it('puts every shortcut on a modifier, bar Escape and Enter', () => {
    const bare = ['escape', 'enter'];
    for (const scope of allScopes()) {
      for (const binding of scope.bindings) {
        for (const chord of binding.chords) {
          const parsed = parseChord(chord);
          if (bare.includes(parsed.key) && !parsed.mod && !parsed.hyper) continue;
          expect(
            parsed.hyper || parsed.mod,
            `${scope.id}/${binding.id} binds "${chord}" with no modifier`,
          ).toBe(true);
        }
      }
    }
  });

  it('chains nothing: one binding is one keystroke', () => {
    for (const scope of allScopes()) {
      for (const binding of scope.bindings) {
        for (const chord of binding.chords) {
          expect(parseChord(chord).key, `${scope.id}/${binding.id} has an empty key`).not.toBe('');
          expect(chord.includes(' '), `${scope.id}/${binding.id} spells a sequence`).toBe(false);
        }
      }
    }
  });

  /**
   * The rule that matters most on a screen full of decisions. Resolution lets an inner scope shadow
   * an outer one, so a queue binding on ⌘⌃A would quietly turn "go to the agenda" — pressed from
   * habit, without looking — into "accept this submission".
   */
  it('lets no screen claim a chord the shell uses everywhere', () => {
    const global = globalSignatures();
    for (const scope of allScopes()) {
      if (scope.id === SCOPES.organizerGlobal) continue;
      for (const binding of scope.bindings) {
        for (const chord of binding.chords) {
          const signature = chordSignature(parseChord(chord));
          // Escape and Enter are activation, not navigation; the shell does not bind either.
          expect(
            global.has(signature),
            `${scope.id}/${binding.id} shadows the global "${chord}"`,
          ).toBe(false);
        }
      }
    }
  });
});

/**
 * The map itself. A rebind is a decision about somebody's hands, so changing one of these has to be
 * a deliberate edit here that says which key moved and why.
 */
describe('the chord map', () => {
  it('navigates the whole workspace from the shell', () => {
    const scope = getScope(SCOPES.organizerGlobal);
    expect(scope).toBeDefined();
    expect(new Set(signaturesOf(scope as ScopeDef))).toEqual(
      new Set([
        'mod+k',
        'hyper+.',
        'hyper+/',
        'hyper+o',
        'hyper+u',
        'hyper+s',
        'hyper+a',
        'hyper+t',
        'hyper+shift+f',
        'hyper+c',
        'hyper+p',
        'hyper+n',
        'hyper+v',
        'hyper+e',
      ]),
    );
  });

  it('decides submissions from the queue', () => {
    const scope = getScope(SCOPES.submissionsQueue);
    expect(scope).toBeDefined();
    expect(new Set(signaturesOf(scope as ScopeDef))).toEqual(
      new Set([
        'hyper+arrowdown',
        'hyper+arrowup',
        'hyper+x',
        'enter',
        'escape',
        'hyper+y',
        'hyper+r',
        'hyper+w',
        'hyper+shift+y',
        'hyper+shift+r',
        'hyper+shift+h',
        'hyper+shift+c',
      ]),
    );
  });

  it('scores and decides from the review screen', () => {
    const scope = getScope(SCOPES.submissionDetail);
    expect(scope).toBeDefined();
    expect(new Set(signaturesOf(scope as ScopeDef))).toEqual(
      new Set([
        'hyper+1',
        'hyper+2',
        'hyper+3',
        'hyper+4',
        'hyper+5',
        'hyper+6',
        'hyper+7',
        'hyper+8',
        'hyper+9',
        'hyper+arrowup',
        'hyper+arrowdown',
        'hyper+shift+s',
        'mod+enter',
        'hyper+]',
        'hyper+[',
        'hyper+backspace',
        'hyper+y',
        'hyper+w',
        'hyper+r',
      ]),
    );
  });

  it('keeps the queue and the review screen deciding on the same three keys', () => {
    const queue = getScope(SCOPES.submissionsQueue) as ScopeDef;
    const detail = getScope(SCOPES.submissionDetail) as ScopeDef;
    for (const id of ['accept', 'waitlist', 'decline']) {
      const inQueue = queue.bindings.find((binding) => binding.id === id);
      const inDetail = detail.bindings.find((binding) => binding.id === id);
      expect(inDetail?.chords, `${id} differs between the two screens`).toEqual(inQueue?.chords);
    }
  });
});

describe('resolveBindings', () => {
  it('puts the screen you are on above the keys that are always there', () => {
    const resolved = resolveBindings([SCOPES.organizerGlobal, SCOPES.submissionsQueue]);
    expect(resolved[0].scope.id).toBe(SCOPES.submissionsQueue);
    expect(resolved.some((entry) => entry.scope.id === SCOPES.organizerGlobal)).toBe(true);
  });

  it('lets an inner scope take a key an outer scope also wants', () => {
    /**
     * The agenda and the tasks screen both use ⌘⌃1 for their first view, and only one of them is
     * ever mounted — but stacking them is how the resolver is asked which of two claimants wins,
     * without inventing scopes that do not ship.
     */
    const stacked = [SCOPES.agenda, SCOPES.tasks];
    expect(findBinding(stacked, hyper('1'))?.scope.id).toBe(SCOPES.tasks);

    /**
     * The agenda's `view` survives resolution even so, because shadowing is per keystroke and only
     * one of its six was taken. ⌘⌃3 still reaches it — a range does not lose its other keys because
     * something above claimed one of them.
     */
    expect(findBinding(stacked, hyper('3'))?.scope.id).toBe(SCOPES.agenda);
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

  it('fires the innermost binding for a keystroke both scopes could want', () => {
    const match = findBinding(stack, hyper('y'));
    expect(match?.binding.id).toBe('accept');
    expect(match?.scope.id).toBe(SCOPES.submissionsQueue);
  });

  it('still reaches the shell for a key the screen does not claim', () => {
    expect(findBinding(stack, hyper('a'))?.binding.id).toBe('goto-agenda');
  });

  it('tells "accept" from "propose accepting" by the shift', () => {
    expect(findBinding(stack, hyper('y'))?.binding.id).toBe('accept');
    expect(findBinding(stack, hyper('y', { shiftKey: true }))?.binding.id).toBe('stage-accept');
  });

  it('reports which key of a range fired, so the score binding knows the digit', () => {
    const match = findBinding([SCOPES.submissionDetail], hyper('7'));
    expect(match?.binding.id).toBe('score');
    expect(match?.chord).toBe('hyper+7');
  });

  it('keeps looking when the caller vetoes a candidate', () => {
    // What the provider does while the user is typing: only `allowInInput` bindings survive.
    const typing = findBinding(stack, { key: 'k', metaKey: true }, (candidate) =>
      Boolean(candidate.binding.allowInInput),
    );
    expect(typing?.binding.id).toBe('command-palette');
    expect(findBinding(stack, hyper('y'), () => false)).toBeNull();
  });

  it('leaves a bare letter alone, which is the whole point of the rebind', () => {
    expect(findBinding(stack, { key: 'y' })).toBeNull();
    expect(findBinding(stack, { key: 'a' })).toBeNull();
    expect(findBinding(stack, { key: 'g' })).toBeNull();
  });

  it('does not fire a workspace chord for ⌘ alone, or ⌘⌥', () => {
    expect(findBinding(stack, { key: 'a', metaKey: true })).toBeNull();
    expect(findBinding(stack, { key: 'a', metaKey: true, altKey: true })).toBeNull();
  });
});
