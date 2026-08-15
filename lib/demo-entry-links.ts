/**
 * Passwordless sign-in entry points for the seeded demo identities (`db/seed.ts`), one per product
 * role. Kept relative so they follow whatever origin serves the page; `APP_URL` alone owns the
 * absolute deployed origin.
 */
export const DEMO_ENTRY_LINKS = {
  organizer: '/signin?email=organizer@example.com&next=/admin',
  reviewer: '/signin?email=reviewer.cicero@example.com&next=/review',
  speaker: '/signin?email=vitruvius@example.com&next=/portal',
} as const;
