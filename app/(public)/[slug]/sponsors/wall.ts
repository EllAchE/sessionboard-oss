import { publicSponsorLogoUrl } from '@/lib/sponsor-branding';
import { SPONSOR_KINDS, type SponsorKind, type SponsorRecord } from '@/lib/services/sponsors';

/**
 * `E-7`. The shape of the public wall, kept pure and beside the page the way `speakers/view.ts` is —
 * grouping is the only part of this surface with a decision in it, and a decision that is not in a
 * function is a decision that is not tested.
 *
 * Two rules, both of them about honouring what the organizer already ordered:
 *
 *  - **Tiers come from the rows, not from a list.** `tier` is free text, so the tiers on the wall are
 *    whatever the rows spell, in the order they are first met walking the organizer's `position`
 *    order. Sorting them alphabetically would put Bronze above Gold; sorting them by any inferred
 *    rank would need a tier table the schema deliberately does not have.
 *  - **A tierless section gets no headings.** If nothing in a kind carries a tier, the wall is one
 *    unlabelled block rather than a block under a heading like "Other" that the organizer never
 *    wrote. Mixed sections do get a heading for the untiered rows, because otherwise the run would
 *    read as belonging to whichever tier preceded it.
 */

export type WallEntry = {
  id: string;
  name: string;
  websiteUrl: string | null;
  description: string | null;
  boothLocation: string | null;
  logoUrl: string | null;
};

export type WallTier = {
  /** Stable enough for a React key: a tier appears once per section. */
  key: string;
  /** `null` renders no heading — see the second rule above. */
  label: string | null;
  entries: WallEntry[];
};

export type WallSection = {
  kind: SponsorKind;
  title: string;
  /** Singular; the page pluralises with an `s`, which both of these nouns take. */
  singular: string;
  lede: string;
  /** Flattened count, for the section head — the tiers are a presentation detail. */
  count: number;
  tiers: WallTier[];
};

/**
 * `untiered` heads the rows carrying no tier, and only in a section that has tiers to tell them
 * apart from. It is per kind because "Also supporting" over an exhibitor describes the wrong thing —
 * an exhibitor without a tier is still exhibiting.
 */
const SECTION_COPY: Record<
  SponsorKind,
  { title: string; singular: string; lede: string; untiered: string }
> = {
  sponsor: {
    title: 'Sponsors',
    singular: 'sponsor',
    lede: 'The organisations backing this event.',
    untiered: 'Also supporting',
  },
  exhibitor: {
    title: 'Exhibitors',
    singular: 'exhibitor',
    lede: 'Come and find them on the floor.',
    untiered: 'Also exhibiting',
  },
};

/**
 * The grouping key for rows with no tier. Empty is safe as a sentinel because `sponsorInput` turns a
 * blank tier into `null` before it is stored, so no row can ever spell this one.
 */
const UNTIERED_KEY = '';

function toEntry(slug: string, row: SponsorRecord): WallEntry {
  return {
    id: row.id,
    name: row.name,
    websiteUrl: row.websiteUrl,
    description: row.description,
    boothLocation: row.boothLocation,
    logoUrl: publicSponsorLogoUrl(slug, row.logoFileId),
  };
}

function tiersFor(kind: SponsorKind, slug: string, rows: SponsorRecord[]): WallTier[] {
  const tiered = rows.some((row) => row.tier);

  const groups = new Map<string, WallTier>();
  for (const row of rows) {
    const key = row.tier ?? UNTIERED_KEY;
    const existing = groups.get(key);
    if (existing) {
      existing.entries.push(toEntry(slug, row));
      continue;
    }
    groups.set(key, {
      key,
      label: row.tier ?? (tiered ? SECTION_COPY[kind].untiered : null),
      entries: [toEntry(slug, row)],
    });
  }

  return [...groups.values()];
}

/**
 * Sections in `SPONSOR_KINDS` order, with empty ones dropped: an event that has sponsors but no
 * exhibitors should not be shown an exhibitor heading over nothing. Rows arrive already ordered by
 * `listPublicSponsors`, so this never re-sorts.
 */
export function buildSponsorWall(slug: string, rows: SponsorRecord[]): WallSection[] {
  return SPONSOR_KINDS.flatMap((kind) => {
    const owned = rows.filter((row) => row.kind === kind);
    if (owned.length === 0) return [];
    // Named rather than spread: `untiered` is `tiersFor`'s business and has nothing to say to a page.
    const { title, singular, lede } = SECTION_COPY[kind];
    return [
      {
        kind,
        title,
        singular,
        lede,
        count: owned.length,
        tiers: tiersFor(kind, slug, owned),
      },
    ];
  });
}
