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
 * The fourth way into the same seeded event: the site it publishes to attendees. It takes no
 * account, so it is not a sign-in entry point and stays out of `DEMO_ENTRY_LINKS`, whose every
 * value is a passwordless sign-in URL that callers hand to a signed-out visitor as a role tour.
 * Gate it on the same `demoEntryPointsAreAvailable` check regardless: an unseeded instance has no
 * event at this slug to show.
 */
export const DEMO_PUBLIC_SITE_LINK = `/${DEMO_EVENT_SLUG}`;
