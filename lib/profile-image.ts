/**
 * The one profile-image contract used by both speaker upload surfaces. The browser does the
 * expensive decode and re-encode so the result stays compatible with Cloudflare Workers; the
 * server independently inspects the bytes before accepting them, so calling the route directly
 * cannot bypass the size and dimension bounds.
 */

export const PROFILE_IMAGE_EDGE_PX = 512;
export const PROFILE_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const PROFILE_IMAGE_MAX_STORED_BYTES = 1024 * 1024;
export const PROFILE_IMAGE_CONTENT_TYPE = 'image/webp';

export type ImageDimensions = { width: number; height: number };

export function squareCrop(width: number, height: number): {
  sourceX: number;
  sourceY: number;
  sourceSize: number;
} {
  const sourceSize = Math.min(width, height);
  return {
    sourceX: Math.floor((width - sourceSize) / 2),
    sourceY: Math.floor((height - sourceSize) / 2),
    sourceSize,
  };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function uint24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function uint32le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

/** Reads dimensions from the three WebP bitstream layouts without decoding the image. */
export function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 4) !== 'WEBP' ||
    uint32le(bytes, 4) + 8 !== bytes.length
  ) {
    return null;
  }

  let extended: ImageDimensions | null = null;
  let image: ImageDimensions | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(bytes, offset, 4);
    const chunkSize = uint32le(bytes, offset + 4);
    const payload = offset + 8;
    const end = payload + chunkSize;
    if (end > bytes.length) return null;

    if (chunk === 'VP8X' && chunkSize >= 10) {
      extended = {
        width: uint24le(bytes, payload + 4) + 1,
        height: uint24le(bytes, payload + 7) + 1,
      };
    } else if (chunk === 'VP8 ' && chunkSize >= 10) {
      if (
        bytes[payload + 3] !== 0x9d ||
        bytes[payload + 4] !== 0x01 ||
        bytes[payload + 5] !== 0x2a
      ) {
        return null;
      }
      image = {
        width: (bytes[payload + 6] | (bytes[payload + 7] << 8)) & 0x3fff,
        height: (bytes[payload + 8] | (bytes[payload + 9] << 8)) & 0x3fff,
      };
    } else if (chunk === 'VP8L' && chunkSize >= 5) {
      if (bytes[payload] !== 0x2f) return null;
      image = {
        width: 1 + bytes[payload + 1] + ((bytes[payload + 2] & 0x3f) << 8),
        height:
          1 +
          (bytes[payload + 2] >> 6) +
          (bytes[payload + 3] << 2) +
          ((bytes[payload + 4] & 0x0f) << 10),
      };
    }

    offset = end + (chunkSize % 2);
  }

  if (offset !== bytes.length || !image) return null;
  if (extended && (extended.width !== image.width || extended.height !== image.height)) return null;
  return extended ?? image;
}

export function normalizedProfileImageProblem(input: {
  contentType: string;
  sizeBytes: number;
  bytes: Uint8Array;
}): string | null {
  if (input.contentType.toLowerCase().split(';')[0].trim() !== PROFILE_IMAGE_CONTENT_TYPE) {
    return 'That image was not normalized. Choose it again in the profile form.';
  }
  if (input.sizeBytes <= 0 || input.sizeBytes !== input.bytes.byteLength) {
    return 'That image is empty or incomplete.';
  }
  if (input.sizeBytes > PROFILE_IMAGE_MAX_STORED_BYTES) {
    return 'The optimized profile picture must be 1 MB or smaller.';
  }
  const dimensions = webpDimensions(input.bytes);
  if (!dimensions) return 'That file is not a readable WebP image.';
  if (dimensions.width !== PROFILE_IMAGE_EDGE_PX || dimensions.height !== PROFILE_IMAGE_EDGE_PX) {
    return `Profile pictures must be ${PROFILE_IMAGE_EDGE_PX} × ${PROFILE_IMAGE_EDGE_PX} pixels after cropping.`;
  }
  return null;
}

function webpName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'profile-picture';
  return `${stem}.webp`;
}

/**
 * Center-crops and re-encodes a browser-selected image into the canonical stored representation.
 * One bounded 512 px asset serves as both the profile image and the roster thumbnail, avoiding a
 * second file model while keeping the bytes small on list views.
 */
export async function normalizeProfileImage(file: File): Promise<File> {
  if (file.size <= 0) throw new Error('Choose an image to upload.');
  if (file.size > PROFILE_IMAGE_MAX_INPUT_BYTES) {
    throw new Error('Choose an image that is 10 MB or smaller.');
  }
  if (!file.type.toLowerCase().startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error('That image has no readable pixels.');
    }

    const crop = squareCrop(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = PROFILE_IMAGE_EDGE_PX;
    canvas.height = PROFILE_IMAGE_EDGE_PX;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the image.');
    context.drawImage(
      image,
      crop.sourceX,
      crop.sourceY,
      crop.sourceSize,
      crop.sourceSize,
      0,
      0,
      PROFILE_IMAGE_EDGE_PX,
      PROFILE_IMAGE_EDGE_PX,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, PROFILE_IMAGE_CONTENT_TYPE, 0.82),
    );
    if (!blob || blob.type !== PROFILE_IMAGE_CONTENT_TYPE) {
      throw new Error('This browser cannot optimize profile pictures as WebP.');
    }
    if (blob.size > PROFILE_IMAGE_MAX_STORED_BYTES) {
      throw new Error('The optimized image is still too large. Choose a simpler picture.');
    }
    return new File([blob], webpName(file.name), {
      type: PROFILE_IMAGE_CONTENT_TYPE,
      lastModified: Date.now(),
    });
  } catch (error) {
    if (error instanceof Error && error.message) throw error;
    throw new Error('That image could not be read. Try a JPEG, PNG, GIF or WebP file.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
