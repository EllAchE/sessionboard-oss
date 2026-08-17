/**
 * How big the sample conferences are.
 *
 * A seven-speaker demo is honest about the product's *shape* and dishonest about its *load*. Every
 * screen that has to cope with a real call for papers — the review queue, the agenda grid, the
 * speaker gallery, the assignment spread across a reviewer pool — looks effortless on fourteen
 * proposals and is the entire job on four hundred. So the seed ships one event at each of three
 * scales instead of one event at whichever scale was convenient, and the middle one is what a
 * visitor lands on.
 *
 * `demo` is the medium event and keeps its slug: it is the default sample event, it is what
 * `lib/demo-entry-links.ts` points at, and it is the one with the hand-authored narrative core.
 * `demo-small` and `demo-large` are the same conference wound down and up, so a reader comparing
 * them is looking at scale rather than at two unrelated fixtures.
 *
 * ## Headshot slots
 *
 * Portraits come from the deterministic generator in `roman-profile-art.ts`, which has
 * `ROMAN_SPEAKER_HEADSHOT_CAPACITY` (600) distinct slots. Each event draws a contiguous range, and
 * the ranges must not overlap or two speakers in different events end up with the same face — which
 * looks like a bug in the generator and is not one. The offsets below are spaced with room to grow:
 * `first-settlement` holds 0-12 (the thirteen hand-authored `ROMAN_PROFILE_ART` entries), and the
 * assertions in `event-sizes.test.ts` fail if a future edit lets two ranges touch.
 */

export type EventSizeKey = 'small' | 'medium' | 'large';

export type EventSize = {
  key: EventSizeKey;
  slug: string;
  name: string;
  tagline: string;
  /** Confirmed speakers on the published roster — one generated person per speaker. */
  speakers: number;
  /** Proposals in the call, across every status. Roughly two per speaker, as real calls run. */
  submissions: number;
  /** Concurrent rooms. Enough that the accepted talks fit the grid without double-booking. */
  rooms: number;
  days: number;
  /** Reviewers on the programme committee, sized so nobody carries an absurd queue. */
  reviewers: number;
  /** First `roman-profile-art` slot this event draws from. Ranges must not overlap. */
  headshotSlotOffset: number;
};

export const EVENT_SIZES: Record<EventSizeKey, EventSize> = {
  small: {
    key: 'small',
    slug: 'demo-small',
    name: 'Cicero Forum: Provincial Assembly',
    tagline: 'A single-track day for one province, sized like a community conference.',
    speakers: 8,
    submissions: 18,
    rooms: 2,
    days: 1,
    reviewers: 2,
    headshotSlotOffset: 100,
  },
  medium: {
    key: 'medium',
    slug: 'demo',
    name: 'Cicero Forum 2026',
    tagline: 'The default sample event: a two-day, multi-track conference.',
    speakers: 45,
    submissions: 96,
    rooms: 5,
    days: 2,
    reviewers: 6,
    headshotSlotOffset: 13,
  },
  large: {
    key: 'large',
    slug: 'demo-large',
    name: 'Cicero Forum: Imperial Congress',
    tagline: 'Three days, ten rooms, and a call for papers big enough to hurt.',
    speakers: 180,
    submissions: 384,
    rooms: 10,
    days: 3,
    reviewers: 18,
    headshotSlotOffset: 200,
  },
};

/** The size a visitor lands on when nobody has asked for one. */
export const DEFAULT_EVENT_SIZE: EventSizeKey = 'medium';

/** The two events seeded beside the default, in the order they are created. */
export const SIBLING_EVENT_SIZES: EventSize[] = [EVENT_SIZES.small, EVENT_SIZES.large];

export const ALL_EVENT_SIZES: EventSize[] = [
  EVENT_SIZES.small,
  EVENT_SIZES.medium,
  EVENT_SIZES.large,
];

/** Every sample-event slug the seed creates, default first. */
export const SIZED_EVENT_SLUGS: string[] = [
  EVENT_SIZES[DEFAULT_EVENT_SIZE].slug,
  ...SIBLING_EVENT_SIZES.map((size) => size.slug),
];

/** The mail domain a generated speaker for this event gets. Reserved by RFC 2606, so undeliverable. */
export function generatedEmailDomain(size: EventSize): string {
  return `${size.slug}.example`;
}
