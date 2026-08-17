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
 * The fourth way into the same seeded event: the site it publishes to attendees, page by page. None
 * of these takes an account, so they are not sign-in entry points and stay out of
 * `DEMO_ENTRY_LINKS`, whose every value is a passwordless sign-in URL that callers hand to a
 * signed-out visitor as a role tour — `app/page.test.tsx` iterates that constant asserting none of
 * its values reach a fresh instance, and these carry no identity to keep out. Gate them on the same
 * `demoEntryPointsAreAvailable` check regardless: an unseeded instance has no event at this slug.
 */
export const DEMO_PUBLIC_LINKS = {
  event: `/${DEMO_EVENT_SLUG}`,
  agenda: `/${DEMO_EVENT_SLUG}/agenda`,
  sessions: `/${DEMO_EVENT_SLUG}/sessions`,
  speakers: `/${DEMO_EVENT_SLUG}/speakers`,
  sponsors: `/${DEMO_EVENT_SLUG}/sponsors`,
} as const;

/** The event's front door, for callers that want the site rather than one of its pages. */
export const DEMO_PUBLIC_SITE_LINK = DEMO_PUBLIC_LINKS.event;

/** The published showcase of every embed view, running against the demo event. */
export const EMBED_SHOWCASE_PATH = '/embeds';
