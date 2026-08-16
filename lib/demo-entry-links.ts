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
  organizer: `/signin?email=${DEMO_ENTRY_IDENTITIES[0].email}&next=/admin`,
  reviewer: `/signin?email=${DEMO_ENTRY_IDENTITIES[1].email}&next=/review`,
  speaker: `/signin?email=${DEMO_ENTRY_IDENTITIES[2].email}&next=/portal`,
} as const;
