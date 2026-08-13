import { createHash } from 'node:crypto';
import {
  designRomanSpeakerHeadshot,
  renderRomanSpeakerHeadshot,
  ROMAN_SPEAKER_HEADSHOT_CAPACITY,
  romanSpeakerHeadshotVisualDistance,
} from '../lib/roman-speaker-headshots';

const startedAt = performance.now();
const designs = Array.from({ length: ROMAN_SPEAKER_HEADSHOT_CAPACITY }, (_, slot) =>
  designRomanSpeakerHeadshot(`verification-speaker-${slot + 1}`, slot),
);
const assets = designs.map((design) =>
  renderRomanSpeakerHeadshot(`verification-speaker-${design.slot + 1}`, design.slot),
);
const hashes = assets.map((asset) => createHash('sha256').update(asset).digest('hex'));
const exactDuplicateCount = hashes.length - new Set(hashes).size;
const primaryCombinationCount = new Set(
  designs.map((design) => `${design.face}:${design.hair}:${design.material}`),
).size;
const signatureDuplicateCount = designs.length - new Set(designs.map((design) => design.signature)).size;
const genderCounts = Object.fromEntries(
  ['woman', 'man'].map((gender) => [
    gender,
    designs.filter((design) => design.gender === gender).length,
  ]),
);
let closestPairDistance = Number.POSITIVE_INFINITY;
let nearDuplicatePairs = 0;

for (let left = 0; left < designs.length; left += 1) {
  for (let right = left + 1; right < designs.length; right += 1) {
    const distance = romanSpeakerHeadshotVisualDistance(designs[left], designs[right]);
    closestPairDistance = Math.min(closestPairDistance, distance);
    if (distance <= 2) nearDuplicatePairs += 1;
  }
}

const bytes = assets.map((asset) => Buffer.byteLength(asset));
const totalGeneratedBytes = bytes.reduce((total, size) => total + size, 0);
const report = {
  assetCount: assets.length,
  exactDuplicateCount,
  primaryCombinationCount,
  signatureDuplicateCount,
  genderCounts,
  nearDuplicateThreshold: 2,
  nearDuplicatePairs,
  closestPairDistance,
  totalGeneratedBytes,
  averageAssetBytes: Math.round(totalGeneratedBytes / bytes.length),
  largestAssetBytes: Math.max(...bytes),
  verificationMs: Math.round(performance.now() - startedAt),
};

console.log(JSON.stringify(report, null, 2));

if (
  exactDuplicateCount > 0 ||
  primaryCombinationCount !== ROMAN_SPEAKER_HEADSHOT_CAPACITY ||
  signatureDuplicateCount > 0 ||
  genderCounts.woman !== ROMAN_SPEAKER_HEADSHOT_CAPACITY / 2 ||
  genderCounts.man !== ROMAN_SPEAKER_HEADSHOT_CAPACITY / 2 ||
  nearDuplicatePairs > 0
) {
  process.exitCode = 1;
}
