import type { SponsorKind, SponsorRecord } from '@/lib/services/sponsors';

/**
 * `E-7`. Pure, and free of any database import, so the `'use client'` board can value-import from
 * here. `lib/services/sponsors.ts` reaches `db/client`, which opens a connection at import and
 * would drag `pg` — and with it `net` and `tls` — into the browser bundle.
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };

export type SponsorWire = SponsorRecord & {
  /** Resolved here rather than in the client, which has no business knowing the route shape. */
  logoUrl: string | null;
};

export type SponsorGroup = {
  kind: SponsorKind;
  /** Plural, for the section heading. */
  label: string;
  /** Singular, for the buttons and the empty state. */
  singular: string;
  lede: string;
  rows: SponsorWire[];
};

export const SPONSOR_GROUP_COPY: Record<SponsorKind, Pick<SponsorGroup, 'label' | 'singular' | 'lede'>> =
  {
    sponsor: {
      label: 'Sponsors',
      singular: 'sponsor',
      lede: 'The organisations backing this event, in the order they should be recognised.',
    },
    exhibitor: {
      label: 'Exhibitors',
      singular: 'exhibitor',
      lede: 'Organisations with a stand on the floor. Booth is where to find them.',
    },
  };

/** The organizer-side logo route. Private: it reads the bytes back through the files service. */
export function sponsorLogoUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/organizer/sponsors/logo/${fileId}` : null;
}
