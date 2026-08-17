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
  /**
   * The workspace tier: ⌘⌃ on Apple keyboards, Ctrl+Alt elsewhere. Every organizer shortcut but the
   * ⌘K palette carries it, which is what stops a stray letter from deciding a submission.
   *
   * Not ⌘⌥. That combination is spoken for above the page — ⌘⌥I/J/C open devtools, ⌘⌥U views
   * source, ⌘⌥B/L/W belong to Safari, ⌘⌥D/H to macOS, ⌘⌥←/→ to tab switching — and none of it can
   * be taken back with `preventDefault`. ⌘⌃ is nearly empty by comparison, so the letters get to
   * mean what they say.
   */
  hyper: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * The subset of `KeyboardEvent` the matcher reads. Declared structurally rather than as
 * `KeyboardEvent` so tests can pass object literals without a DOM.
 */
export interface KeyDescriptor {
  key: string;
  /**
   * `KeyboardEvent.code` — the physical key, whatever the layout prints on it. Read as a second
   * spelling when `key` misses, because a modified keystroke does not always report the letter that
   * was struck: AltGr rewrites `key` on Windows layouts, and Option does the same on macOS.
   * Optional, so tests and non-keyboard callers can leave it out.
   */
  code?: string;
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
   * Key caps to draw instead of the parsed chords. For a key this table documents but does not own
   * — the agenda's Space-to-lift, which belongs to dnd-kit's keyboard sensor.
   */
  display?: string[];
  /**
   * Draw the chords as a span rather than a list: the first chord in full, then `–`, then the last
   * chord's key. Nine caps for a 1–9 score range is noise, and writing the span out by hand in
   * `display` would hard-code one platform's modifier into a table that renders on both.
   */
  range?: boolean;
  /**
   * Fires even while focus is in a text field. Reserved for chords that cannot collide with typing
   * — the ⌘K palette and Escape. Everything else stands down so that typing `a` in a search box
   * never accepts a submission.
   */
  allowInInput?: boolean;
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
