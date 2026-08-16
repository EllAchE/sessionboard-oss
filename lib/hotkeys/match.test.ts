import { describe, expect, it } from 'vitest';
import {
  chordSignature,
  formatChordString,
  isTypingTarget,
  matchesChord,
  parseChord,
} from './match';

const press = (key: string, modifiers: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key,
  ...modifiers,
});

describe('parseChord', () => {
  it('reads modifiers and folds the key to what the browser reports', () => {
    expect(parseChord('mod+k')).toEqual({ key: 'k', mod: true, shift: false, alt: false });
    expect(parseChord('shift+A')).toEqual({ key: 'a', mod: false, shift: true, alt: false });
    expect(parseChord('Esc')).toEqual({ key: 'escape', mod: false, shift: false, alt: false });
    expect(parseChord('up')).toEqual({ key: 'arrowup', mod: false, shift: false, alt: false });
  });

  it('takes a lone punctuation key literally rather than splitting on it', () => {
    expect(parseChord('+').key).toBe('+');
    expect(parseChord('[').key).toBe('[');
    expect(parseChord('?').key).toBe('?');
    expect(parseChord('mod++').key).toBe('+');
  });
});

describe('matchesChord', () => {
  it('accepts either ⌘ or Ctrl for mod, on whatever keyboard is plugged in', () => {
    const chord = parseChord('mod+k');
    expect(matchesChord(chord, press('k', { metaKey: true }))).toBe(true);
    expect(matchesChord(chord, press('k', { ctrlKey: true }))).toBe(true);
    expect(matchesChord(chord, press('k'))).toBe(false);
  });

  it('keeps a bare letter away from any modified keystroke', () => {
    // `⌘A` is "select all" in the browser and must never reach the queue's accept binding.
    const accept = parseChord('a');
    expect(matchesChord(accept, press('a'))).toBe(true);
    expect(matchesChord(accept, press('a', { metaKey: true }))).toBe(false);
    expect(matchesChord(accept, press('a', { ctrlKey: true }))).toBe(false);
    expect(matchesChord(accept, press('a', { altKey: true }))).toBe(false);
  });

  it('separates a letter from its shifted self, because the queue gives them different meanings', () => {
    expect(matchesChord(parseChord('a'), press('A', { shiftKey: true }))).toBe(false);
    expect(matchesChord(parseChord('shift+a'), press('A', { shiftKey: true }))).toBe(true);
    expect(matchesChord(parseChord('shift+a'), press('a'))).toBe(false);
  });

  it('ignores shift for a character that already spells it, so ? fires as ?', () => {
    expect(matchesChord(parseChord('?'), press('?', { shiftKey: true }))).toBe(true);
    expect(matchesChord(parseChord('?'), press('?'))).toBe(true);
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
  it('names the mod key the way the reader’s keyboard does', () => {
    expect(formatChordString('mod+k', 'apple')).toEqual(['⌘', 'K']);
    expect(formatChordString('mod+k', 'other')).toEqual(['Ctrl', 'K']);
  });

  it('draws bare keys as caps the overlay can render', () => {
    expect(formatChordString('escape', 'other')).toEqual(['Esc']);
    expect(formatChordString('enter', 'other')).toEqual(['↵']);
    expect(formatChordString('arrowdown', 'other')).toEqual(['↓']);
    expect(formatChordString('shift+a', 'other')).toEqual(['Shift', 'A']);
  });
});

describe('chordSignature', () => {
  it('collapses chords that in fact collide and separates ones that do not', () => {
    expect(chordSignature(parseChord('shift+?'))).toBe(chordSignature(parseChord('?')));
    expect(chordSignature(parseChord('shift+a'))).not.toBe(chordSignature(parseChord('a')));
    expect(chordSignature(parseChord('mod+k'))).not.toBe(chordSignature(parseChord('k')));
  });
});
