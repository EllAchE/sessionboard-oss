import { invalid } from './errors';

export const MAX_SPEAKER_NAME_GRAPHEMES = 120;

const MAX_SPEAKER_NAME_CODE_UNITS = 1024;
const FORBIDDEN_NAME_CHARACTERS = /[\p{Cc}\p{Bidi_Control}\u200b\u2028\u2029\u2060\ufeff]/u;
const DEFAULT_IGNORABLE_CHARACTER = /\p{Default_Ignorable_Code_Point}/u;
const ALLOWED_NAME_JOINER_OR_VARIANT =
  /[\u180b-\u180d\u200c\u200d\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/u;

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
      (entry) => entry.segment,
    );
  }
  return Array.from(value);
}

export function parseSpeakerName(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value.length > MAX_SPEAKER_NAME_CODE_UNITS) {
    throw invalid(`Speaker names are limited to ${MAX_SPEAKER_NAME_GRAPHEMES} characters`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasForbiddenCharacter = Array.from(trimmed).some(
    (character) =>
      FORBIDDEN_NAME_CHARACTERS.test(character) ||
      (DEFAULT_IGNORABLE_CHARACTER.test(character) &&
        !ALLOWED_NAME_JOINER_OR_VARIANT.test(character)),
  );
  if (hasForbiddenCharacter) {
    throw invalid('Speaker names cannot contain control, invisible, or directional characters');
  }
  if (graphemes(trimmed).length > MAX_SPEAKER_NAME_GRAPHEMES) {
    throw invalid(`Speaker names are limited to ${MAX_SPEAKER_NAME_GRAPHEMES} characters`);
  }
  return trimmed;
}

export function speakerInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => graphemes(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}
