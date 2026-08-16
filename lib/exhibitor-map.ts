/**
 * `AR-36`. Pure exhibitor-map contract shared by upload validation, admin copy, and public routes.
 * The first version is intentionally one static PDF rather than structured booth geometry.
 */

export const EXHIBITOR_MAP_UPLOAD = {
  label: 'Exhibitor map',
  acceptedTypes: ['application/pdf'],
  maxSizeMb: 25,
} as const;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-

/** PDF readers allow a small amount of leading material, so inspect the first KiB for the marker. */
export function hasPdfSignature(input: ArrayBuffer | Uint8Array): boolean {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const end = Math.min(bytes.byteLength - PDF_SIGNATURE.length + 1, 1024);
  for (let offset = 0; offset < end; offset += 1) {
    if (PDF_SIGNATURE.every((byte, index) => bytes[offset + index] === byte)) return true;
  }
  return false;
}

export function exhibitorMapEmbedPath(slug: string): string {
  return `/embed/${encodeURIComponent(slug)}/exhibitor-map`;
}

export function exhibitorMapFilePath(slug: string): string {
  return `${exhibitorMapEmbedPath(slug)}/file`;
}
