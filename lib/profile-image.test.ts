import { describe, expect, it } from 'vitest';
import {
  PROFILE_IMAGE_CONTENT_TYPE,
  PROFILE_IMAGE_EDGE_PX,
  normalizedProfileImageProblem,
  squareCrop,
  webpDimensions,
} from './profile-image';

function vp8x(width: number, height: number): Uint8Array {
  // Extended header plus one structurally complete lossy-image chunk. The compressed tail is not
  // decoded in this unit — browsers do that before upload — but the server parser still verifies
  // RIFF/chunk lengths and that an image payload agrees with the canvas dimensions.
  const bytes = new Uint8Array(50);
  bytes.set(Buffer.from('RIFF'), 0);
  bytes.set(Buffer.from('WEBP'), 8);
  bytes.set(Buffer.from('VP8X'), 12);
  bytes[16] = 10;
  bytes.set(Buffer.from('VP8 '), 30);
  bytes[34] = 11;
  bytes.set([0, 0, 0, 0x9d, 0x01, 0x2a], 38);
  const write24 = (offset: number, value: number) => {
    const minusOne = value - 1;
    bytes[offset] = minusOne & 0xff;
    bytes[offset + 1] = (minusOne >> 8) & 0xff;
    bytes[offset + 2] = (minusOne >> 16) & 0xff;
  };
  const write32 = (offset: number, value: number) => {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = (value >> 16) & 0xff;
    bytes[offset + 3] = (value >> 24) & 0xff;
  };
  write32(4, bytes.length - 8);
  write24(24, width);
  write24(27, height);
  bytes[44] = width & 0xff;
  bytes[45] = (width >> 8) & 0x3f;
  bytes[46] = height & 0xff;
  bytes[47] = (height >> 8) & 0x3f;
  return bytes;
}

describe('profile image normalization contract', () => {
  it('center-crops landscape and portrait sources', () => {
    expect(squareCrop(1200, 800)).toEqual({ sourceX: 200, sourceY: 0, sourceSize: 800 });
    expect(squareCrop(600, 900)).toEqual({ sourceX: 0, sourceY: 150, sourceSize: 600 });
  });

  it('reads extended WebP dimensions without decoding image bytes', () => {
    expect(webpDimensions(vp8x(512, 384))).toEqual({ width: 512, height: 384 });
    expect(webpDimensions(new Uint8Array(30))).toBeNull();
    const truncated = vp8x(512, 512).slice(0, -1);
    expect(webpDimensions(truncated)).toBeNull();
  });

  it('accepts only the canonical 512px WebP representation', () => {
    const bytes = vp8x(PROFILE_IMAGE_EDGE_PX, PROFILE_IMAGE_EDGE_PX);
    expect(
      normalizedProfileImageProblem({
        contentType: PROFILE_IMAGE_CONTENT_TYPE,
        sizeBytes: bytes.byteLength,
        bytes,
      }),
    ).toBeNull();
    expect(
      normalizedProfileImageProblem({
        contentType: 'image/png',
        sizeBytes: bytes.byteLength,
        bytes,
      }),
    ).toMatch(/not normalized/i);
    expect(
      normalizedProfileImageProblem({
        contentType: PROFILE_IMAGE_CONTENT_TYPE,
        sizeBytes: vp8x(1024, 1024).byteLength,
        bytes: vp8x(1024, 1024),
      }),
    ).toMatch(/512 × 512/);
  });
});
