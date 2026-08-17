/**
 * `AD-9`. The view vocabulary a share link can name, kept in its own module with no database import
 * so the organizer's client component can render the picker without dragging `pg` into the browser
 * bundle — `lib/services/share-links.ts` imports `@/db/client`, and a client component importing
 * these constants from there fails the build on `net`/`tls`.
 *
 * The list is the bundle-driven subset of `EMBED_VIEWS`. `exhibitor-map` is deliberately absent: it
 * reads a floorplan file through its own loader rather than the programme bundle, so it has no draft
 * state worth previewing and would need a second, unrelated access path to serve.
 *
 * This is the TypeScript half of the `share_link_view` enum in `db/schema.ts`; the two lists must
 * stay identical, and `db/share-link-migration.test.ts` pins the SQL side.
 */

export const SHARE_LINK_VIEWS = [
  'agenda',
  'itinerary',
  'sessions',
  'speakers',
  'gallery',
  'sponsors',
] as const;

export type ShareLinkView = (typeof SHARE_LINK_VIEWS)[number];

export function isShareLinkView(value: string): value is ShareLinkView {
  return (SHARE_LINK_VIEWS as readonly string[]).includes(value);
}

export const SHARE_LINK_VIEW_LABEL: Record<ShareLinkView, string> = {
  agenda: 'Agenda grid',
  itinerary: 'Itinerary',
  sessions: 'Session list',
  speakers: 'Speaker directory',
  gallery: 'Speaker gallery',
  sponsors: 'Sponsors and exhibitors',
};

/**
 * A fortnight covers the round trip an organizer is actually waiting on — send the draft, get notes
 * back — without leaving a live bearer URL in a stranger's inbox for a year. The ceiling is a
 * quarter: past that the link outlives the draft it was minted for, and a fresh one costs a click.
 */
export const DEFAULT_SHARE_LINK_DAYS = 14;
export const MAX_SHARE_LINK_DAYS = 90;
