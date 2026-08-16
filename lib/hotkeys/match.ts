import type { Chord, KeyDescriptor, Platform, TargetDescriptor } from './types';

/**
 * Chord parsing, matching and rendering. Pure — no DOM, no React, no platform sniffing except
 * through the `Platform` argument callers pass in.
 */

/**
 * Spellings accepted in a chord string, folded to the `KeyboardEvent.key` the browser actually
 * reports. Writing `'esc'` in the registry and receiving `'Escape'` at runtime is the single most
 * likely way to add a shortcut that silently never fires, so the aliases exist to make the
 * comfortable spelling correct rather than to punish it.
 */
const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  del: 'delete',
  return: 'enter',
  space: ' ',
  spacebar: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
};

const MODIFIER_TOKENS = new Set(['mod', 'shift', 'alt', 'opt', 'option']);

/**
 * Whether Shift is part of a chord's identity.
 *
 * For letters it is: the submissions queue deliberately gives `a` and `Shift-A` different meanings
 * ("accept it" versus "propose accepting it"). For everything else the shifted character already
 * encodes the shift — `?` *is* Shift-`/` on a US layout, and on layouts where it is not, demanding
 * Shift would break the key. So Shift is compared for `a`–`z` and ignored elsewhere.
 */
function shiftIsMeaningful(key: string): boolean {
  return /^[a-z]$/.test(key);
}

function normalizeKey(raw: string): string {
  if (raw.length === 1) return raw.toLowerCase();
  const lower = raw.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/**
 * `'mod+k'`, `'shift+a'`, `'j'`, `'['`, `'?'` → a normalised chord.
 *
 * Splitting on `+` would eat a chord that *is* `'+'`, so a lone token is taken literally before
 * any splitting happens.
 */
export function parseChord(input: string): Chord {
  const trimmed = input.trim();
  const chord: Chord = { key: '', mod: false, shift: false, alt: false };

  if (trimmed.length <= 1) {
    chord.key = normalizeKey(trimmed);
    return chord;
  }

  const tokens = trimmed.split('+').filter((token) => token.length > 0);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!MODIFIER_TOKENS.has(lower)) {
      chord.key = normalizeKey(token);
      continue;
    }
    if (lower === 'mod') chord.mod = true;
    else if (lower === 'shift') chord.shift = true;
    else chord.alt = true;
  }

  if (chord.key === '' && trimmed.endsWith('+')) chord.key = '+';
  return chord;
}

/**
 * Does this keystroke fire this chord?
 *
 * `mod` matches ⌘ *or* Ctrl on every platform. That is what the ⌘K palette in
 * `components/ui/CommandMenu` already does and what the organizer info panel already advertises
 * ("⌘ / Ctrl"), so narrowing it per-platform here would be a silent regression for anyone on a
 * Mac with an external PC keyboard.
 *
 * An unmodified chord requires the modifiers to be *absent*, which preserves the
 * `if (event.metaKey || event.ctrlKey || event.altKey) return` guard the queue and review screens
 * carried by hand: ⌘A stays "select all" and never reaches the `a` binding.
 */
export function matchesChord(chord: Chord, event: KeyDescriptor): boolean {
  const key = normalizeKey(event.key);
  if (key !== chord.key) return false;

  const modDown = Boolean(event.metaKey) || Boolean(event.ctrlKey);
  if (modDown !== chord.mod) return false;
  if (Boolean(event.altKey) !== chord.alt) return false;
  if (shiftIsMeaningful(chord.key) && Boolean(event.shiftKey) !== chord.shift) return false;

  return true;
}

/**
 * Is the user typing into something? Shortcuts stand down when they are.
 *
 * This is the one home for a check that was duplicated verbatim in
 * `app/organizer/submissions/SubmissionQueue.tsx` and
 * `app/organizer/submissions/[submissionId]/ReviewDetail.tsx`; the two copies could drift, and a
 * drift here means typing a speaker's name into a search box starts declining submissions.
 */
export function isTypingTarget(target: TargetDescriptor | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

const KEY_CAPS: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  ' ': 'Space',
  tab: 'Tab',
};

/** Key caps for the shortcuts overlay, e.g. `['⌘', 'K']` on Apple and `['Ctrl', 'K']` elsewhere. */
export function formatChord(chord: Chord, platform: Platform): string[] {
  const caps: string[] = [];
  if (chord.mod) caps.push(platform === 'apple' ? '⌘' : 'Ctrl');
  if (chord.alt) caps.push(platform === 'apple' ? '⌥' : 'Alt');
  if (chord.shift) caps.push('Shift');

  const cap = KEY_CAPS[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  caps.push(cap);
  return caps;
}

/** `'mod+k'` → `['⌘', 'K']`, for callers holding the unparsed string. */
export function formatChordString(chord: string, platform: Platform): string[] {
  return formatChord(parseChord(chord), platform);
}

/**
 * Canonical spelling of a chord, used to detect two bindings claiming the same keystroke. Shift is
 * only part of the identity where it is part of the match, so `?` and `shift+?` collapse together
 * rather than being reported as two distinct chords that in fact collide.
 */
export function chordSignature(chord: Chord): string {
  const parts: string[] = [];
  if (chord.mod) parts.push('mod');
  if (chord.alt) parts.push('alt');
  if (chord.shift && shiftIsMeaningful(chord.key)) parts.push('shift');
  parts.push(chord.key);
  return parts.join('+');
}
