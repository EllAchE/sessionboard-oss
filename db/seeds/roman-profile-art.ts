import { romanSpeakerHeadshotBytes } from '../../lib/roman-speaker-headshots';

export const ROMAN_PROFILE_ART = [
  { email: 'octavian@first-settlement.example' },
  { email: 'agrippa@first-settlement.example' },
  { email: 'plancus@first-settlement.example' },
  { email: 'messalla@first-settlement.example' },
  { email: 'maecenas@first-settlement.example' },
  { email: 'taurus@first-settlement.example' },
] as const;

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
    bytes: romanSpeakerHeadshotBytes(speakerKey, slot),
  }));
}
