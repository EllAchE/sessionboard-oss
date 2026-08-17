import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shareLink } from '@/db/schema';
import type { EventContext } from '@/lib/context';
import { invalid, notFound } from '@/lib/errors';
import { hashToken, randomToken, timingSafeEqual } from '@/lib/ids';

/**
 * `AD-9` — the token half of no-login share links. What a resolved link is *allowed to read* lives
 * in `./share-preview`; this module only decides whether a presented string is a live grant.
 *
 * The shape is `api_key`'s, for the same reasons: the first `PREFIX_LENGTH` characters are stored in
 * the clear and indexed, so verification is one indexed lookup rather than a scan over every link on
 * the instance, and so an organizer or a log line can name a link without holding the secret. The
 * remaining characters are the secret, and only their SHA-256 is persisted. Nothing in this codebase
 * stores a plaintext token, and `issueShareLink` returning it is the single moment it exists outside
 * the recipient's URL bar.
 */

const PREFIX_LENGTH = 8;

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

export type IssuedShareLink = {
  id: string;
  label: string;
  view: ShareLinkView;
  prefix: string;
  /** Shown exactly once, at creation. Nothing reconstructs it afterwards. */
  token: string;
  expiresAt: Date;
};

export type ShareLinkSummary = {
  id: string;
  label: string;
  view: ShareLinkView;
  prefix: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastViewedAt: Date | null;
  viewCount: number;
  createdAt: Date;
};

/** What a live token buys the bearer. Deliberately one event and one view, and no identity. */
export type ShareLinkGrant = {
  id: string;
  eventId: string;
  view: ShareLinkView;
  label: string;
  expiresAt: Date;
};

export async function issueShareLink(
  ctx: EventContext,
  input: { label: string; view: string; expiresInDays?: number },
): Promise<IssuedShareLink> {
  const label = input.label.trim();
  if (!label) {
    throw invalid('Name the link so you can tell it apart later', {
      label: 'Say who this link is for',
    });
  }
  if (!isShareLinkView(input.view)) {
    throw invalid('Choose a view this link can open', { view: 'Pick one of the listed views' });
  }

  const days = Math.round(input.expiresInDays ?? DEFAULT_SHARE_LINK_DAYS);
  if (!Number.isFinite(days) || days < 1 || days > MAX_SHARE_LINK_DAYS) {
    throw invalid(`A share link may last between 1 and ${MAX_SHARE_LINK_DAYS} days`, {
      expiresInDays: `Choose 1 to ${MAX_SHARE_LINK_DAYS} days`,
    });
  }

  const token = randomToken();
  const [row] = await getDb()
    .insert(shareLink)
    .values({
      eventId: ctx.eventId,
      label,
      view: input.view,
      prefix: token.slice(0, PREFIX_LENGTH),
      tokenHash: await hashToken(token),
      createdByUserId: ctx.actor.userId,
      expiresAt: new Date(Date.now() + days * 86_400_000),
    })
    .returning();

  return {
    id: row.id,
    label: row.label,
    view: row.view,
    prefix: row.prefix,
    token,
    expiresAt: row.expiresAt,
  };
}

/** Revoked and expired links stay in the list; the organizer needs to see what they killed. */
export async function listShareLinks(eventId: string): Promise<ShareLinkSummary[]> {
  const rows = await getDb()
    .select()
    .from(shareLink)
    .where(eq(shareLink.eventId, eventId))
    .orderBy(desc(shareLink.createdAt));

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    view: row.view,
    prefix: row.prefix,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastViewedAt: row.lastViewedAt,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
  }));
}

/**
 * A timestamp rather than a delete, following `api_key`: the point of revoking is usually that
 * something went wrong, and that is exactly when `viewCount` and `lastViewedAt` are the record an
 * organizer needs. The `eventId` in the predicate is the tenant guard — an organizer cannot revoke
 * another event's link by guessing its id.
 */
export async function revokeShareLink(eventId: string, linkId: string): Promise<void> {
  const revoked = await getDb()
    .update(shareLink)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLink.id, linkId), eq(shareLink.eventId, eventId), isNull(shareLink.revokedAt)))
    .returning({ id: shareLink.id });

  if (revoked.length === 0) throw notFound('That share link');
}

/**
 * The whole authorization decision for an anonymous visitor, in one function.
 *
 * Expiry and revocation are in the SQL predicate rather than checked afterwards, so there is no
 * branch in which a dead row is returned and something downstream forgets to look. The hash compare
 * is `timingSafeEqual` on the hex digests: the prefix lookup can return more than one candidate, and
 * a byte-at-a-time comparison over an attacker-supplied value is exactly what that helper exists to
 * avoid.
 *
 * Returns `null` for every failure — unknown, malformed, expired, revoked. A visitor holding a
 * garbage token learns only that it does not work, never whether the prefix matched something real.
 */
export async function resolveShareLink(token: string): Promise<ShareLinkGrant | null> {
  const presented = token.trim();
  if (presented.length <= PREFIX_LENGTH) return null;

  const now = new Date();
  const candidates = await getDb()
    .select()
    .from(shareLink)
    .where(and(eq(shareLink.prefix, presented.slice(0, PREFIX_LENGTH)), isNull(shareLink.revokedAt)));

  const presentedHash = await hashToken(presented);
  const match = candidates.find(
    (row) => timingSafeEqual(row.tokenHash, presentedHash) && row.expiresAt > now,
  );
  if (!match) return null;

  return {
    id: match.id,
    eventId: match.eventId,
    view: match.view,
    label: match.label,
    expiresAt: match.expiresAt,
  };
}

/**
 * Best-effort, and never in the request's critical path: an organizer wanting to know whether the
 * keynote speaker ever opened the draft is a convenience, and a write failure must not turn a
 * readable page into an error.
 */
export async function recordShareLinkView(linkId: string): Promise<void> {
  try {
    await getDb()
      .update(shareLink)
      .set({
        lastViewedAt: new Date(),
        // Incremented in SQL rather than read-modify-write, which would lose counts whenever the
        // same link is opened from two devices at once.
        viewCount: sql<number>`${shareLink.viewCount} + 1`,
      })
      .where(eq(shareLink.id, linkId));
  } catch {
    // Deliberately swallowed; see the note above.
  }
}
