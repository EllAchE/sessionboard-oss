import {
  romanSpeakerHeadshotBytes,
  type RomanSpeakerHeadshotGender,
} from '../../lib/roman-speaker-headshots';

export const ROMAN_PROFILE_ART = [
  { email: 'octavian@first-settlement.example', gender: 'man' },
  { email: 'agrippa@first-settlement.example', gender: 'man' },
  { email: 'plancus@first-settlement.example', gender: 'man' },
  { email: 'messalla@first-settlement.example', gender: 'man' },
  { email: 'maecenas@first-settlement.example', gender: 'man' },
  { email: 'taurus@first-settlement.example', gender: 'man' },
] as const;

const ROMAN_PROFILE_ART_GENDER = new Map<string, RomanSpeakerHeadshotGender>(
  ROMAN_PROFILE_ART.map((entry) => [entry.email, entry.gender]),
);

export const ROMAN_PROFILE_ART_CONTENT_TYPE = 'image/svg+xml';

export type RomanProfileArtAssignment<SpeakerKey extends string = string> = {
  speakerKey: SpeakerKey;
  slot: number;
  filename: string;
  contentType: typeof ROMAN_PROFILE_ART_CONTENT_TYPE;
  bytes: Uint8Array;
};

export function createRomanProfileArtAssignments<SpeakerKey extends string>(
  speakerKeys: readonly SpeakerKey[],
): RomanProfileArtAssignment<SpeakerKey>[] {
  return speakerKeys.map((speakerKey, slot) => ({
    speakerKey,
    slot,
    filename: `roman-speaker-${String(slot + 1).padStart(3, '0')}.svg`,
    contentType: ROMAN_PROFILE_ART_CONTENT_TYPE,
    bytes: romanSpeakerHeadshotBytes(speakerKey, slot, ROMAN_PROFILE_ART_GENDER.get(speakerKey)),
  }));
}
