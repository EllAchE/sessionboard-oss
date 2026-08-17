/** The event and identities created together by `db/seed.ts`. */
export const DEMO_EVENT_SLUG = 'demo';

export const DEMO_ENTRY_IDENTITIES = [
  { email: 'organizer@example.com', role: 'organizer' },
  { email: 'reviewer.cicero@example.com', role: 'reviewer' },
  { email: 'vitruvius@example.com', role: 'speaker' },
] as const;

/**
 * Passwordless sign-in entry points for the seeded demo identities, one per product role. Kept
 * relative so they follow whatever origin serves the page; `APP_URL` alone owns the absolute
 * deployed origin.
 */
export const DEMO_ENTRY_LINKS = {
  organizer: `/signin?email=${DEMO_ENTRY_IDENTITIES[0].email}&next=/organizer`,
  reviewer: `/signin?email=${DEMO_ENTRY_IDENTITIES[1].email}&next=/review`,
  speaker: `/signin?email=${DEMO_ENTRY_IDENTITIES[2].email}&next=/portal`,
} as const;

/**
 * The attendee-facing pages of the same demo event — the published programme, which needs no
 * account at all.
 *
 * Deliberately a separate constant rather than more `DEMO_ENTRY_LINKS` keys: that one means
 * "passwordless sign-in link", and `app/page.test.tsx` iterates its values asserting that none of
 * them reach a fresh instance. These carry no identity, so they do not belong under that rule.
 */
export const DEMO_PUBLIC_LINKS = {
  event: `/${DEMO_EVENT_SLUG}`,
  agenda: `/${DEMO_EVENT_SLUG}/agenda`,
  sessions: `/${DEMO_EVENT_SLUG}/sessions`,
  speakers: `/${DEMO_EVENT_SLUG}/speakers`,
  sponsors: `/${DEMO_EVENT_SLUG}/sponsors`,
} as const;

/** The published showcase of every embed view, running against the demo event. */
export const EMBED_SHOWCASE_PATH = '/embeds';
