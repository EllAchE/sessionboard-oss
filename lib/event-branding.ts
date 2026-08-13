/**
 * `E-3`. Event logo and banner: which slots exist, what an upload into one may be, and where the
 * bytes are served from. Pure — the upload route, the settings panel and the public pages all read
 * the same constants, so the hint under the file input cannot drift from what the route enforces.
 */

export const EVENT_BRANDING_KINDS = ['logo', 'banner'] as const;

export type EventBrandingKind = (typeof EVENT_BRANDING_KINDS)[number];

export type EventBrandingSpec = {
  kind: EventBrandingKind;
  label: string;
  /** The column on `event` this slot writes. */
  column: 'logoFileId' | 'bannerFileId';
  /** Roughly what the image should be, from the requirement. Advisory: nothing is rejected on size. */
  guidance: string;
  acceptedTypes: string[];
  maxSizeMb: number;
};

export const EVENT_BRANDING: Record<EventBrandingKind, EventBrandingSpec> = {
  logo: {
    kind: 'logo',
    label: 'Event logo',
    column: 'logoFileId',
    guidance: 'Square, around 300 × 300.',
    acceptedTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'],
    maxSizeMb: 5,
  },
  banner: {
    kind: 'banner',
    label: 'Event banner',
    column: 'bannerFileId',
    guidance: 'Wide, around 1500 × 500.',
    acceptedTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    maxSizeMb: 10,
  },
};

export function isBrandingKind(value: string): value is EventBrandingKind {
  return (EVENT_BRANDING_KINDS as readonly string[]).includes(value);
}

/**
 * Content-addressed rather than `/{slug}/branding/logo`: the id in the path changes when the image
 * does, so the URL can be cached hard and a replacement is still visible immediately. The route
 * refuses any file id that is not currently one of this event's two branding slots.
 */
export function eventBrandingUrl(slug: string, fileId: string | null | undefined): string | null {
  return fileId ? `/${encodeURIComponent(slug)}/branding/${fileId}` : null;
}
