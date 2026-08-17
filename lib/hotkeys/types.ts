/**
 * Shared vocabulary for the keyboard layer.
 *
 * Nothing here imports React or touches `window`. The matching rules in `match.ts` and the binding
 * tables in `registry.ts` are pure data plus pure functions, which is what lets them be tested
 * under this repo's node test environment — there is no jsdom in `vitest.config.ts`, so an engine
 * that needed a real DOM to be exercised would ship untested.
 */

/** Which physical key, plus which modifiers must be down for a binding to fire. */
export interface Chord {
  /**
   * Lower-cased `KeyboardEvent.key`. Letters are `a`–`z`; named keys keep their DOM spelling
   * folded to lower case (`enter`, `escape`, `arrowup`); space is a single `' '`.
   */
  key: string;
  /** ⌘ on Apple keyboards, Ctrl elsewhere. Matched against either, as the ⌘K palette already does. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * The subset of `KeyboardEvent` the matcher reads. Declared structurally rather than as
 * `KeyboardEvent` so tests can pass object literals without a DOM.
 */
export interface KeyDescriptor {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** The subset of an event target the typing guard reads. */
export interface TargetDescriptor {
  tagName?: string;
  isContentEditable?: boolean;
}

/** Only affects how key caps are drawn; matching is platform-independent. */
export type Platform = 'apple' | 'other';

/**
 * One shortcut. `id` is the handle a screen supplies a handler for — a binding with no handler
 * registered is inert but still documented, which is how a shortcut can be declared next to its
 * peers before the screen that runs it exists.
 */
export interface Binding {
  /** Unique within its scope. */
  id: string;
  /**
   * One or more chord strings; any of them fires this binding. Two chords for one id is for
   * genuine synonyms (`o` and `Enter` both open the active row), not for related-but-different
   * actions.
   */
  chords: string[];
  /** Imperative, sentence case. Rendered verbatim in the shortcuts overlay. */
  label: string;
  /** Heading the overlay groups this under. */
  group: string;
  /**
   * Key caps to draw instead of the parsed chords, for ranges that would otherwise render as nine
   * near-identical rows (`['1', '–', '9']`).
   */
  display?: string[];
  /**
   * Fires even while focus is in a text field. Reserved for chords that cannot collide with typing
   * — the ⌘K palette and Escape. Everything else stands down so that typing `a` in a search box
   * never accepts a submission.
   */
  allowInInput?: boolean;
  /**
   * Leading key of a two-key sequence: `{ prefix: 'g', chords: ['s'] }` is "g then s". The prefix
   * is armed by its own keypress and expires on the next key or after a timeout.
   */
  prefix?: string;
  /** Kept out of the overlay. For aliases that would read as duplicates. */
  hidden?: boolean;
}

/**
 * A window's worth of shortcuts. Scopes are pushed and popped as screens and dialogs mount, and
 * resolution walks the resulting stack from the innermost outward.
 */
export interface ScopeDef {
  id: string;
  /** Section heading in the shortcuts overlay. */
  title: string;
  /**
   * Stops resolution at this scope, so nothing underneath can fire. This is the generic form of
   * the `if (saveOpen || columnsOpen || commitOpen) return` check the submissions queue used to
   * carry by hand: while a dialog owns the keyboard, the list beneath it must not act on `a`.
   */
  modal?: boolean;
  bindings: Binding[];
}

/** A binding together with the scope it came from, so the overlay can group by window. */
export interface ResolvedBinding {
  scope: ScopeDef;
  binding: Binding;
}

/** What a handler receives, so range bindings can tell which key fired them. */
export interface HotkeyEvent {
  /** Lower-cased key that matched. For the `1`–`9` score range, the digit that was pressed. */
  key: string;
  /** The chord string from the binding that matched. */
  chord: string;
}

/** Handlers a screen supplies, keyed by binding id. */
export type HotkeyHandlers = Record<string, ((event: HotkeyEvent) => void) | undefined>;
