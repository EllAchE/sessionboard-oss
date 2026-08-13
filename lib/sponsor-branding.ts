/**
 * `E-7`. What a sponsor logo upload may be. Pure and free of any database import — the same split
 * `lib/event-branding.ts` makes, and for the same reason: the upload route and the `'use client'`
 * board both read these constants, so the hint under the file input cannot drift from what the
 * route enforces.
 */

export type SponsorLogoSpec = {
  label: string;
  /** Roughly what the image should be. Advisory: nothing is rejected on dimensions. */
  guidance: string;
  acceptedTypes: string[];
  maxSizeMb: number;
};

/**
 * SVG is accepted, as it is for the event logo, because a sponsor supplies a vector mark far more
 * often than a raster one. The ceiling matches the event logo rather than the 10 MB banner: a wall
 * of these renders at a couple of hundred pixels and a 5 MB source is already generous.
 */
export const SPONSOR_LOGO: SponsorLogoSpec = {
  label: 'Sponsor logo',
  guidance: 'A square or wide mark on a transparent background, up to 5 MB.',
  acceptedTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'],
  maxSizeMb: 5,
};

/**
 * Where the public wall reads a logo from — the unauthenticated twin of
 * `app/admin/sponsors/types.ts`'s `sponsorLogoUrl`, which stays behind the organizer gate.
 *
 * Content-addressed and event-scoped for the same reason `eventBrandingUrl` is: the id in the path
 * changes when the image does, so the response can be cached hard and a replacement still shows
 * immediately, and the slug in the path is what the route resolves the owning event from. The route
 * refuses any file id that is not currently a sponsor logo on that event.
 */
export function publicSponsorLogoUrl(
  slug: string,
  fileId: string | null | undefined,
): string | null {
  return fileId ? `/${encodeURIComponent(slug)}/sponsors/logo/${fileId}` : null;
}
