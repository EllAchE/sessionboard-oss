/**
 * `S-11`. What the speaker portal's own appearance may be: the logo slot, the accent, and the one
 * shape an accent is allowed to take. Pure and free of any database import — the same split
 * `lib/event-branding.ts` and `lib/sponsor-branding.ts` make, and for the same reason: the upload
 * route, the `'use client'` panel and the portal's own renderer all read these constants, so the
 * hint under the file input cannot drift from what the route enforces.
 *
 * This is the *speaker portal's* branding, not the event's. `lib/event-branding.ts` is `E-3` and
 * dresses the public event pages; this dresses the signed-in portal and the emails sent from it.
 * Two different tables, two different audiences, deliberately not merged.
 */

export type PortalLogoSpec = {
  label: string;
  /** Roughly what the image should be. Advisory: nothing is rejected on dimensions. */
  guidance: string;
  acceptedTypes: string[];
  maxSizeMb: number;
};

/**
 * The masthead renders it at a couple of hundred pixels, so the ceiling matches the event logo
 * rather than the 10 MB banner. SVG is accepted for the same reason it is there: an organizer
 * supplies a vector mark far more often than a raster one.
 */
export const PORTAL_LOGO: PortalLogoSpec = {
  label: 'Portal logo',
  guidance: 'Sits in the portal masthead. Wide or square, around 240 × 80.',
  acceptedTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'],
  maxSizeMb: 5,
};

/**
 * A literal hex, not a design token — unlike a track colour, which is a token because
 * `app/admin/settings/palette.ts` explains why. The accent has to survive two places a custom
 * property cannot reach: Gmail strips `:root` and Outlook's word renderer never had custom
 * properties, so `wrapInBranding` interpolates this value directly into an inline style. A token
 * name would arrive in the inbox as nothing.
 *
 * Six or three digits, no alpha. Alpha in an inline style is where email clients start disagreeing,
 * and a colour that resolves to transparent in Outlook is a masthead with no rule across the top.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The one place an accent is checked. The organizer's input passes through it before it is stored
 * and the stored value passes through it again before it is rendered, so a row written by a seed, a
 * migration or a hand-run `UPDATE` can never reach an inline `style` attribute unvetted.
 *
 * Returns the normalised colour, or `null` for anything blank or unrecognised.
 */
export function normalizeAccent(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

export type AccentPreset = { hex: string; label: string };

/**
 * The mid-tones from `app/tokens.css`, offered as a starting point rather than as the only choice:
 * a conference arrives with a brand colour, and refusing it would make the setting decorative.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  { hex: '#B7391F', label: 'Vermilion' },
  { hex: '#9C2E17', label: 'Vermilion, deep' },
  { hex: '#2C4A7C', label: 'Lapis' },
  { hex: '#2F7361', label: 'Verdigris' },
  { hex: '#A8781C', label: 'Ochre' },
  { hex: '#4D473E', label: 'Stone' },
];

/**
 * Content-addressed, like the event branding route: the id in the path changes when the image does,
 * so a replacement is visible immediately. Organizer-facing — the speaker's portal serves the same
 * bytes through `/portal/{slug}/file/{fileId}`, which is where the role check lives for them.
 */
export function portalLogoAdminUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/admin/settings/portal/logo/${encodeURIComponent(fileId)}` : null;
}
