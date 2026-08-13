import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  designRomanSpeakerHeadshot,
  romanSpeakerHeadshotBytes,
  ROMAN_SPEAKER_HEADSHOT_CAPACITY,
  romanSpeakerHeadshotVisualDistance,
} from '../../lib/roman-speaker-headshots';
import {
  createRomanProfileArtAssignments,
  ROMAN_PROFILE_ART,
  ROMAN_PROFILE_ART_CONTENT_TYPE,
} from './roman-profile-art';

const SPEAKER_KEYS = Array.from(
  { length: ROMAN_SPEAKER_HEADSHOT_CAPACITY },
  (_, slot) => `demo-speaker-${slot + 1}@cicero.example`,
);

describe('Roman profile art', () => {
  it('assigns the seeded speakers distinct generated portraits', () => {
    const assignments = createRomanProfileArtAssignments(
      ROMAN_PROFILE_ART.map((entry) => entry.email),
    );

    expect(assignments).toHaveLength(ROMAN_PROFILE_ART.length);
    expect(new Set(assignments.map((entry) => entry.filename)).size).toBe(assignments.length);
    expect(assignments.every((entry) => entry.contentType === ROMAN_PROFILE_ART_CONTENT_TYPE)).toBe(
      true,
    );
    expect(
      assignments.every((entry) => {
        const svg = new TextDecoder().decode(entry.bytes);
        const profile = ROMAN_PROFILE_ART.find((candidate) => candidate.email === entry.speakerKey);
        return Boolean(
          profile && svg.includes('<svg') && svg.includes(`classical ${profile.gender} speaker portrait`),
        );
      }),
    ).toBe(true);
    expect(ROMAN_PROFILE_ART.filter((profile) => profile.gender === 'woman')).toHaveLength(6);
    expect(ROMAN_PROFILE_ART.filter((profile) => profile.gender === 'man')).toHaveLength(6);
    expect(new Set(ROMAN_PROFILE_ART.map((profile) => profile.name)).size).toBe(
      ROMAN_PROFILE_ART.length,
    );
  });

  it('produces 600 exact-unique, visually separated, compact assets', () => {
    const assignments = createRomanProfileArtAssignments(SPEAKER_KEYS);
    const hashes = assignments.map((entry) =>
      createHash('sha256').update(entry.bytes).digest('hex'),
    );
    const designs = SPEAKER_KEYS.map((speakerKey, slot) =>
      designRomanSpeakerHeadshot(speakerKey, slot),
    );

    expect(new Set(hashes).size).toBe(ROMAN_SPEAKER_HEADSHOT_CAPACITY);
    expect(
      new Set(designs.map((design) => `${design.face}:${design.hair}:${design.material}`)).size,
    ).toBe(ROMAN_SPEAKER_HEADSHOT_CAPACITY);
    expect(new Set(designs.map((design) => design.signature)).size).toBe(
      ROMAN_SPEAKER_HEADSHOT_CAPACITY,
    );
    expect(designs.every((design) => design.guaranteedDistinct)).toBe(true);
    expect(designs.filter((design) => design.gender === 'woman')).toHaveLength(300);
    expect(designs.filter((design) => design.gender === 'man')).toHaveLength(300);
    expect(
      designs.filter((design) => design.gender === 'woman').every((design) => design.beard === 0),
    ).toBe(true);
    expect(
      assignments.every((entry) => {
        const svg = new TextDecoder().decode(entry.bytes);
        return !svg.includes('NaN') && !svg.includes('undefined');
      }),
    ).toBe(true);
    expect(Math.max(...assignments.map((entry) => entry.bytes.byteLength))).toBeLessThan(16_000);

    let closestPairDistance = Number.POSITIVE_INFINITY;
    for (let left = 0; left < designs.length; left += 1) {
      for (let right = left + 1; right < designs.length; right += 1) {
        closestPairDistance = Math.min(
          closestPairDistance,
          romanSpeakerHeadshotVisualDistance(designs[left], designs[right]),
        );
      }
    }
    expect(closestPairDistance).toBeGreaterThan(2);
  });

  it('continues deterministically beyond the guaranteed 600-slot set', () => {
    const overflowA = designRomanSpeakerHeadshot('overflow-speaker', 600);
    const overflowB = designRomanSpeakerHeadshot('overflow-speaker', 601);

    expect(romanSpeakerHeadshotBytes('overflow-speaker', 600).byteLength).toBeGreaterThan(1_000);
    expect(overflowA.guaranteedDistinct).toBe(false);
    expect(overflowB.guaranteedDistinct).toBe(false);
    expect(overflowA.signature).not.toBe(overflowB.signature);
    expect(designRomanSpeakerHeadshot('overflow-speaker', 600)).toEqual(overflowA);
  });
});
