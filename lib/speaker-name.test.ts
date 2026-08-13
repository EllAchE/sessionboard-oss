import { describe, expect, it } from 'vitest';
import { MAX_SPEAKER_NAME_GRAPHEMES, parseSpeakerName, speakerInitials } from './speaker-name';

describe('speaker names', () => {
  it('trims outside whitespace and makes a blank name an explicit fallback', () => {
    expect(parseSpeakerName('  Ada Lovelace  ')).toBe('Ada Lovelace');
    expect(parseSpeakerName(' \t\n ')).toBeNull();
    expect(parseSpeakerName(null)).toBeNull();
  });

  it('preserves international, decomposed, right-to-left, and emoji names', () => {
    const names = ['李 小龍', 'ليلى الأحمد', 'می\u200cرزا', 'Jose\u0301', '👩‍💻 🧑🏽‍🚀'];
    for (const name of names) expect(parseSpeakerName(name)).toBe(name);
  });

  it('bounds names by grapheme rather than UTF-16 code units', () => {
    const allowed = '👩‍💻'.repeat(MAX_SPEAKER_NAME_GRAPHEMES);
    expect(parseSpeakerName(allowed)).toBe(allowed);
    expect(() => parseSpeakerName(`${allowed}x`)).toThrow('120');
  });

  it.each([
    'Ada\nLovelace',
    'Ada\tLovelace',
    'Ada\0Lovelace',
    'Ada\u061CLovelace',
    'Ada\u200BLovelace',
    'Ada\u200FLovelace',
    'Ada\u202ELovelace',
    'Ada\u00ADLovelace',
    'Ada\u2063Lovelace',
  ])('rejects control or spoofing characters: %j', (name) =>
    expect(() => parseSpeakerName(name)).toThrow('control'),
  );

  it('takes complete graphemes for avatar initials', () => {
    expect(speakerInitials('👩‍💻 李')).toBe('👩‍💻李');
    expect(speakerInitials('Jose\u0301 Alvarez')).toBe('JA');
  });
});
