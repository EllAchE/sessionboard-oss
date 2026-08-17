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

const MODIFIER_TOKENS = new Set(['mod', 'hyper', 'shift', 'alt', 'opt', 'option']);

/**
 * `KeyboardEvent.code` → the key a chord would name, for the codes a shortcut can plausibly carry.
 *
 * This is a keystroke's second spelling. A modified key does not always report the character it
 * prints: AltGr rewrites `key` on European layouts, as Option does on macOS. Reading `code` too
 * means `hyper+s` fires from the S key whatever the modifiers made of the character.
 */
const CODE_KEYS: Record<string, string> = {
  Space: ' ',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

function keyFromCode(code: string | undefined): string | null {
  if (!code) return null;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  return CODE_KEYS[code] ?? code.toLowerCase();
}

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
  const chord: Chord = { key: '', mod: false, hyper: false, shift: false, alt: false };

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
    else if (lower === 'hyper') chord.hyper = true;
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
 * `hyper` is the same idea one tier up: ⌘⌃ *or* Ctrl+Alt, whatever the platform, so the shortcut a
 * Mac user learns as ⌘⌃S is the one a Windows user learns as Ctrl+Alt+S and neither has to know
 * which keyboard the other is on. ⌘⌥ is deliberately not a third spelling — see `Chord.hyper`.
 *
 * An unmodified chord requires the modifiers to be *absent*, which preserves the
 * `if (event.metaKey || event.ctrlKey || event.altKey) return` guard the queue and review screens
 * carried by hand: ⌘A stays "select all", and Escape stays Escape while ⌘⌃ is held down.
 */
export function matchesChord(chord: Chord, event: KeyDescriptor): boolean {
  if (!matchesKey(chord, event)) return false;

  const meta = Boolean(event.metaKey);
  const ctrl = Boolean(event.ctrlKey);
  const alt = Boolean(event.altKey);

  if (chord.hyper) {
    if (!isHyperDown({ metaKey: meta, ctrlKey: ctrl, altKey: alt })) return false;
  } else {
    if (isHyperDown({ metaKey: meta, ctrlKey: ctrl, altKey: alt })) return false;
    const modDown = meta || ctrl;
    if (modDown !== chord.mod) return false;
    if (alt !== chord.alt) return false;
  }

  if (shiftIsMeaningful(chord.key) && Boolean(event.shiftKey) !== chord.shift) return false;

  return true;
}

/**
 * Is the workspace modifier down? ⌘⌃ with no Option, or Ctrl+Alt with no Command — one form per
 * keyboard, and nothing in between. Exported because the hint overlay asks the same question of a
 * keystroke that has no key yet: holding the modifier is what reveals the caps.
 */
export function isHyperDown(event: Pick<KeyDescriptor, 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  const meta = Boolean(event.metaKey);
  const ctrl = Boolean(event.ctrlKey);
  const alt = Boolean(event.altKey);
  return (meta && ctrl && !alt) || (ctrl && alt && !meta);
}

/**
 * A modified keystroke gets two chances: the character it reported, and the key it was physically
 * struck on. Bare chords get only the first — a code fallback there would fire `a` for the key
 * printed `q` on an AZERTY keyboard, which is the opposite of what a layout-aware match should do.
 */
function matchesKey(chord: Chord, event: KeyDescriptor): boolean {
  if (normalizeKey(event.key) === chord.key) return true;
  if (!chord.hyper && !chord.mod && !chord.alt) return false;
  return keyFromCode(event.code) === chord.key;
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
  if (chord.hyper) caps.push(...(platform === 'apple' ? ['⌘', '⌃'] : ['Ctrl', 'Alt']));
  if (chord.alt) caps.push(platform === 'apple' ? '⌥' : 'Alt');
  return [...caps, ...formatChordKey(chord, platform)];
}

/**
 * The part of a chord that is not the modifier — Shift, where Shift is part of the identity, and the
 * key itself.
 *
 * This is what the hint badges draw. They only exist while the modifier is being held, so repeating
 * ⌘⌃ on all eleven of them would print the thing the user's left hand is already doing eleven times
 * and bury the one character that differs between them.
 */
export function formatChordKey(chord: Chord, platform: Platform): string[] {
  const caps: string[] = [];
  if (chord.shift && shiftIsMeaningful(chord.key)) caps.push(platform === 'apple' ? '⇧' : 'Shift');
  caps.push(KEY_CAPS[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key));
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
/**
 * A chord in the spelling `aria-keyshortcuts` wants: DOM modifier names, `+`-joined, and both
 * keyboards' forms separated by a space where a chord has two ("Meta+Control+S Control+Alt+S").
 * Listing both is the honest answer for a matcher that accepts both, and it keeps the attribute
 * platform-independent, which matters because it is rendered on the server.
 */
export function ariaKeyshortcuts(chord: string): string {
  const parsed = parseChord(chord);
  const key = ARIA_KEYS[parsed.key] ?? parsed.key.toUpperCase();
  const suffix = parsed.shift && shiftIsMeaningful(parsed.key) ? `Shift+${key}` : key;

  if (parsed.hyper) return `Meta+Control+${suffix} Control+Alt+${suffix}`;

  const prefixes: string[] = [];
  if (parsed.alt) prefixes.push('Alt');
  const rest = [...prefixes, suffix].join('+');
  return parsed.mod ? `Meta+${rest} Control+${rest}` : rest;
}

const ARIA_KEYS: Record<string, string> = {
  escape: 'Escape',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  tab: 'Tab',
  ' ': 'Space',
};

export function chordSignature(chord: Chord): string {
  const parts: string[] = [];
  if (chord.mod) parts.push('mod');
  if (chord.hyper) parts.push('hyper');
  if (chord.alt) parts.push('alt');
  if (chord.shift && shiftIsMeaningful(chord.key)) parts.push('shift');
  parts.push(chord.key);
  return parts.join('+');
}
