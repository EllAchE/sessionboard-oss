import { describe, expect, it } from 'vitest';
import {
  ariaKeyshortcuts,
  chordSignature,
  formatChordKey,
  formatChordString,
  isHyperDown,
  isTypingTarget,
  matchesChord,
  parseChord,
} from './match';

type Modifier = 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey';

const press = (key: string, modifiers: Partial<Record<Modifier, boolean>> & { code?: string } = {}) => ({
  key,
  ...modifiers,
});

/** The workspace modifier as each keyboard sends it. */
const apple = (key: string, extra: Partial<Record<Modifier, boolean>> & { code?: string } = {}) =>
  press(key, { metaKey: true, ctrlKey: true, ...extra });
const pc = (key: string, extra: Partial<Record<Modifier, boolean>> & { code?: string } = {}) =>
  press(key, { ctrlKey: true, altKey: true, ...extra });

describe('parseChord', () => {
  it('reads modifiers and folds the key to what the browser reports', () => {
    expect(parseChord('mod+k')).toEqual({ key: 'k', mod: true, hyper: false, shift: false, alt: false });
    expect(parseChord('hyper+s')).toEqual({ key: 's', mod: false, hyper: true, shift: false, alt: false });
    expect(parseChord('hyper+shift+f')).toEqual({ key: 'f', mod: false, hyper: true, shift: true, alt: false });
    expect(parseChord('Esc')).toEqual({ key: 'escape', mod: false, hyper: false, shift: false, alt: false });
    expect(parseChord('up')).toEqual({ key: 'arrowup', mod: false, hyper: false, shift: false, alt: false });
  });

  it('takes a lone punctuation key literally rather than splitting on it', () => {
    expect(parseChord('+').key).toBe('+');
    expect(parseChord('[').key).toBe('[');
    expect(parseChord('?').key).toBe('?');
    expect(parseChord('hyper++').key).toBe('+');
  });
});

describe('matchesChord', () => {
  it('accepts either ⌘ or Ctrl for mod, on whatever keyboard is plugged in', () => {
    const chord = parseChord('mod+k');
    expect(matchesChord(chord, press('k', { metaKey: true }))).toBe(true);
    expect(matchesChord(chord, press('k', { ctrlKey: true }))).toBe(true);
    expect(matchesChord(chord, press('k'))).toBe(false);
  });

  it('reads the workspace modifier as ⌘⌃ or Ctrl+Alt, whichever keyboard sent it', () => {
    const chord = parseChord('hyper+s');
    expect(matchesChord(chord, apple('s'))).toBe(true);
    expect(matchesChord(chord, pc('s'))).toBe(true);
    expect(matchesChord(chord, press('s', { ctrlKey: true }))).toBe(false);
    expect(matchesChord(chord, press('s', { metaKey: true }))).toBe(false);
    expect(matchesChord(chord, press('s'))).toBe(false);
  });

  /**
   * ⌘⌥ is the browser's: ⌘⌥I and ⌘⌥J open devtools, ⌘⌥U views source, and `preventDefault()` gets
   * none of them back. The tier exists precisely because those keystrokes never reach the page, so
   * the matcher must not claim to hear them.
   */
  it('never answers to ⌘⌥, which the browser keeps for itself', () => {
    const chord = parseChord('hyper+s');
    expect(matchesChord(chord, press('s', { metaKey: true, altKey: true }))).toBe(false);
    expect(matchesChord(chord, press('s', { metaKey: true, ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('stands an unmodified key down while the workspace modifier is held', () => {
    // ⌘⌃↵ is not "open this row", and ⌘⌃⎋ is not "clear the selection".
    expect(matchesChord(parseChord('enter'), press('Enter'))).toBe(true);
    expect(matchesChord(parseChord('enter'), apple('Enter'))).toBe(false);
    expect(matchesChord(parseChord('escape'), pc('Escape'))).toBe(false);
    expect(matchesChord(parseChord('mod+k'), apple('k'))).toBe(false);
  });

  /**
   * The reason `code` is read at all. Option rewrites the character on macOS (⌥S arrives as `ß`) and
   * AltGr does the same on European layouts, so a chord that only compared `event.key` would be
   * unreachable on a PC keyboard for exactly the modifier tier this scheme is built on.
   */
  it('falls back to the physical key when the modifiers rewrote the character', () => {
    expect(matchesChord(parseChord('hyper+s'), pc('ß', { code: 'KeyS' }))).toBe(true);
    expect(matchesChord(parseChord('hyper+1'), pc('™', { code: 'Digit1' }))).toBe(true);
    expect(matchesChord(parseChord('hyper+.'), pc('≥', { code: 'Period' }))).toBe(true);
  });

  it('leaves a bare key to its layout, so AZERTY is not silently remapped', () => {
    // On AZERTY the key in QWERTY's `a` position prints `q`. A code fallback here would fire `a`.
    expect(matchesChord(parseChord('a'), press('q', { code: 'KeyA' }))).toBe(false);
    expect(matchesChord(parseChord('enter'), press('Enter', { code: 'NumpadEnter' }))).toBe(true);
  });

  it('separates a letter from its shifted self, because the queue gives them different meanings', () => {
    expect(matchesChord(parseChord('hyper+y'), apple('Y', { shiftKey: true }))).toBe(false);
    expect(matchesChord(parseChord('hyper+shift+y'), apple('Y', { shiftKey: true }))).toBe(true);
    expect(matchesChord(parseChord('hyper+shift+y'), apple('y'))).toBe(false);
  });

  it('ignores shift for a character that already spells it, so ⌘⌃/ fires as /', () => {
    expect(matchesChord(parseChord('hyper+/'), apple('/', { shiftKey: true }))).toBe(true);
    expect(matchesChord(parseChord('hyper+/'), apple('/'))).toBe(true);
  });
});

describe('isHyperDown', () => {
  it('recognises the modifier being held with nothing else, which is what reveals the hints', () => {
    expect(isHyperDown({ metaKey: true, ctrlKey: true })).toBe(true);
    expect(isHyperDown({ ctrlKey: true, altKey: true })).toBe(true);
  });

  it('says no to every near miss, so the hints do not flash on ⌘ or ⌘⌥', () => {
    expect(isHyperDown({ metaKey: true })).toBe(false);
    expect(isHyperDown({ ctrlKey: true })).toBe(false);
    expect(isHyperDown({ metaKey: true, altKey: true })).toBe(false);
    expect(isHyperDown({ metaKey: true, ctrlKey: true, altKey: true })).toBe(false);
    expect(isHyperDown({})).toBe(false);
  });
});

describe('isTypingTarget', () => {
  it('stands shortcuts down inside anything that takes text', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('leaves them live everywhere else', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe('formatChordString', () => {
  it('names the modifiers the way the reader’s keyboard does', () => {
    expect(formatChordString('mod+k', 'apple')).toEqual(['⌘', 'K']);
    expect(formatChordString('mod+k', 'other')).toEqual(['Ctrl', 'K']);
    expect(formatChordString('hyper+s', 'apple')).toEqual(['⌘', '⌃', 'S']);
    expect(formatChordString('hyper+s', 'other')).toEqual(['Ctrl', 'Alt', 'S']);
    expect(formatChordString('hyper+shift+f', 'apple')).toEqual(['⌘', '⌃', '⇧', 'F']);
  });

  it('draws bare keys as caps the overlay can render', () => {
    expect(formatChordString('escape', 'other')).toEqual(['Esc']);
    expect(formatChordString('enter', 'other')).toEqual(['↵']);
    expect(formatChordString('hyper+arrowdown', 'other')).toEqual(['Ctrl', 'Alt', '↓']);
    expect(formatChordString('hyper+backspace', 'apple')).toEqual(['⌘', '⌃', '⌫']);
  });
});

describe('formatChordKey', () => {
  /**
   * What a hint badge draws. The user is holding the modifier while they read it, so the modifier
   * itself is the one thing on the cap they do not need told.
   */
  it('drops the modifier and keeps what distinguishes the chord', () => {
    expect(formatChordKey(parseChord('hyper+s'), 'apple')).toEqual(['S']);
    expect(formatChordKey(parseChord('hyper+shift+n'), 'apple')).toEqual(['⇧', 'N']);
    expect(formatChordKey(parseChord('hyper+shift+n'), 'other')).toEqual(['Shift', 'N']);
    expect(formatChordKey(parseChord('hyper+]'), 'apple')).toEqual([']']);
  });
});

describe('ariaKeyshortcuts', () => {
  /**
   * A matcher that accepts two keyboards has to announce two keystrokes; the attribute renders on
   * the server, where which keyboard is on the other end is not yet known.
   */
  it('announces both spellings of a chord the matcher accepts both ways', () => {
    expect(ariaKeyshortcuts('hyper+s')).toBe('Meta+Control+S Control+Alt+S');
    expect(ariaKeyshortcuts('mod+k')).toBe('Meta+K Control+K');
    expect(ariaKeyshortcuts('hyper+shift+f')).toBe('Meta+Control+Shift+F Control+Alt+Shift+F');
  });

  it('spells named keys the way the DOM does', () => {
    expect(ariaKeyshortcuts('escape')).toBe('Escape');
    expect(ariaKeyshortcuts('mod+enter')).toBe('Meta+Enter Control+Enter');
    expect(ariaKeyshortcuts('hyper+arrowdown')).toBe('Meta+Control+ArrowDown Control+Alt+ArrowDown');
  });
});

describe('chordSignature', () => {
  it('collapses chords that in fact collide and separates ones that do not', () => {
    expect(chordSignature(parseChord('hyper+shift+/'))).toBe(chordSignature(parseChord('hyper+/')));
    expect(chordSignature(parseChord('hyper+shift+y'))).not.toBe(chordSignature(parseChord('hyper+y')));
    expect(chordSignature(parseChord('hyper+k'))).not.toBe(chordSignature(parseChord('mod+k')));
    expect(chordSignature(parseChord('hyper+k'))).not.toBe(chordSignature(parseChord('k')));
  });
});
