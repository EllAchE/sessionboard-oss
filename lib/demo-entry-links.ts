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

/**
 * The five things a visitor can go and look at, and what to call each one. Both surfaces that offer
 * them -- the `Demos` menu in the site navigation and the first row of the global footer -- read
 * their destinations and labels from here, because the two used to name the same five places
 * differently: the menu said `Organizer dashboard` where the footer said `Organizer demo`, and its
 * fifth entry was `Public agenda`, one page of the published event already listed beside it, rather
 * than the embed showcase the footer offered.
 *
 * The three role tours come first and the two public destinations follow, because the published
 * event is what the three roles above it produce rather than a fourth workspace, and the showcase
 * renders that same event through the widgets.
 *
 * Icons and one-line blurbs stay with each surface: the menu has room for a blurb and the footer
 * does not, and they draw from different icon vocabularies.
 */
export const DEMO_TOURS = [
  { key: 'organizer', href: DEMO_ENTRY_LINKS.organizer, label: 'Organizer demo' },
  { key: 'reviewer', href: DEMO_ENTRY_LINKS.reviewer, label: 'Reviewer demo' },
  { key: 'speaker', href: DEMO_ENTRY_LINKS.speaker, label: 'Speaker demo' },
  { key: 'event', href: DEMO_PUBLIC_SITE_LINK, label: 'Published event' },
  { key: 'embeds', href: EMBED_SHOWCASE_PATH, label: 'Embed showcase' },
] as const;
