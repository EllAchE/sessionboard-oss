import { and, eq, gt, isNull } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { getDb } from '../db/client';
import { event, magicToken, membership, sessionCookie, user } from '../db/schema';
import type { Actor, EventContext, MembershipRole } from './context';
import {
  demoEventSlugs,
  magicLinkPrecheck,
  membershipsAreDemoOnly,
  type LinkDeliveryTransport,
  type LinkVisibility,
} from './demo-access';
import { appUrl } from './env';
import { forbidden, invalid, notFound, unauthorized } from './errors';
import { hashToken, randomToken } from './ids';
import { activeTransportName, sendMail } from './mail';
import { escapeMarkdownText, renderMarkdown } from './markdown';
import {
  consumeRateLimit,
  enforceMagicLinkRateLimit,
  MAGIC_LINK_IP_RATE_LIMIT,
  requestClientAddress,
} from './rate-limit';

/**
 * Magic links everywhere, passwords nowhere (`T-4a`). A speaker touches this product perhaps four
 * times across six months; a password they set in March is a support ticket in September, and
 * Sessionboard's own participants hit exactly that. Organizers get the same flow because a second
 * credential system would exist solely to be worse than the first.
 */

const SESSION_COOKIE = 'cicero_session';
const SESSION_TTL_DAYS = 30;
const MAGIC_TTL_MINUTES = 30;

function secureCookies(): boolean {
  return appUrl().startsWith('https://');
}

function addMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

function addDays(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureUserAccount(
  email: string,
  name?: string | null,
): Promise<{ id: string; email: string; name: string | null }> {
  const db = getDb();
  const normalized = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw invalid('That does not look like an email address', { email: 'Enter a valid email address' });
  }

  const existing = await db.query.user.findFirst({ where: eq(user.email, normalized) });
  if (existing) {
    // A cold submitter who typed their name on the CFP form should not stay nameless forever.
    if (!existing.name && name) {
      await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, existing.id));
      return { ...existing, name };
    }
    return existing;
  }

  const [created] = await db
    .insert(user)
    .values({ email: normalized, name: name ?? null })
    .returning();
  return created;
}

export type MagicLinkRequest = {
  email: string;
  name?: string | null;
  eventId?: string | null;
  redirectTo?: string | null;
  developmentOrigin?: string;
};

/**
 * Always reports success to the caller. Whether an address has an account is not something an
 * unauthenticated visitor gets to enumerate, and the UI copy ("check your inbox") is true either way.
 */
export async function requestMagicLink(
  request: MagicLinkRequest,
): Promise<{ email: string; link: string; delivered: boolean }> {
  await Promise.all([
    enforceMagicLinkRateLimit(normalizeEmail(request.email)),
    consumeRateLimit(
      requestClientAddress({ headers: await headers() }),
      MAGIC_LINK_IP_RATE_LIMIT,
    ),
  ]);
  const db = getDb();
  const account = await ensureUserAccount(request.email, request.name);
  const token = randomToken();

  await db.insert(magicToken).values({
    tokenHash: await hashToken(token),
    userId: account.id,
    eventId: request.eventId ?? null,
    redirectTo: request.redirectTo ?? null,
    expiresAt: addMinutes(MAGIC_TTL_MINUTES),
  });

  const origin =
    process.env.NODE_ENV === 'development' && request.developmentOrigin
      ? request.developmentOrigin.replace(/\/+$/, '')
      : appUrl();
  const link = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;
  const body = [
    `Hi${account.name ? ` ${escapeMarkdownText(account.name)}` : ''},`,
    '',
    `[Sign in to Cicero](${link})`,
    '',
    `This link works once and expires in ${MAGIC_TTL_MINUTES} minutes.`,
    'If you did not ask for it, you can ignore this email.',
  ].join('\n');

  const { sent } = await sendMail({
    to: account.email,
    subject: 'Your sign-in link',
    html: renderMarkdown(body),
    text: [
      `Hi${account.name ? ` ${account.name}` : ''},`,
      '',
      link,
      '',
      `This link works once and expires in ${MAGIC_TTL_MINUTES} minutes.`,
      'If you did not ask for it, you can ignore this email.',
    ].join('\n'),
    eventId: request.eventId ?? null,
    templateKey: 'auth.magic_link',
  });

  return { email: account.email, link, delivered: sent };
}

// ---------------------------------------------------------------------------
// `T-7a`: a magic link obtainable without an inbox — and the boundary that keeps
// that from being an authentication bypass once `T-6` mail is real.
// ---------------------------------------------------------------------------

/**
 * Conditions 3 and 4: an existing account, holding demo-event membership and no membership on any
 * event outside the demo it does not own itself. The rule these are numbered against, the threat
 * model, and why both requirements can hold at once are in `lib/demo-access.ts` — read it first.
 */
async function isSeededDemoAccount(email: string): Promise<boolean> {
  const db = getDb();
  const account = await db.query.user.findFirst({ where: eq(user.email, normalizeEmail(email)) });
  if (!account) return false;

  const rows = await db
    .select({ slug: event.slug, ownerUserId: event.ownerUserId })
    .from(membership)
    .innerJoin(event, eq(membership.eventId, event.id))
    .where(eq(membership.userId, account.id));

  return membershipsAreDemoOnly(account.id, rows, demoEventSlugs());
}

/**
 * The one place that decides whether a freshly minted link may be rendered outside the recipient's
 * delivered copy. Every caller that puts a link on a public or organizer-readable page goes through
 * this and nothing else. `transport` names the channel carrying that copy; mail is the default, and
 * the SMS archive supplies its own transport so a live Twilio send cannot inherit mail's log-mode
 * exception.
 * Returns why it is allowed — the two reasons want different words on screen — or `null`.
 */
export async function magicLinkMayBeShown(
  email: string,
  transport: LinkDeliveryTransport = activeTransportName(),
): Promise<LinkVisibility> {
  const precheck = magicLinkPrecheck(transport, email);
  if (precheck !== 'ask-the-database') return precheck;
  return (await isSeededDemoAccount(email)) ? 'seeded-demo-account' : null;
}

/**
 * Burns the token and opens a session. Single-use and time-boxed, so a link forwarded to a mailing
 * list or sitting in a mail-scanner's cache is spent by the time anyone else clicks it.
 */
export async function consumeMagicLink(token: string): Promise<{ redirectTo: string }> {
  const db = getDb();
  const tokenHash = await hashToken(token);

  const record = await db.query.magicToken.findFirst({
    where: and(eq(magicToken.tokenHash, tokenHash), isNull(magicToken.usedAt), gt(magicToken.expiresAt, new Date())),
  });
  if (!record) {
    throw unauthorized('That sign-in link has expired or has already been used');
  }

  await db.update(magicToken).set({ usedAt: new Date() }).where(eq(magicToken.id, record.id));
  await openSession(record.userId, null);

  return { redirectTo: record.redirectTo ?? '/' };
}

async function openSession(userId: string, impersonatedByUserId: string | null): Promise<void> {
  const db = getDb();
  const token = randomToken();
  const expiresAt = addDays(SESSION_TTL_DAYS);

  await db.insert(sessionCookie).values({
    tokenHash: await hashToken(token),
    userId,
    impersonatedByUserId,
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    expires: expiresAt,
  });
}

/** Who is acting right now, or null. Cheap enough to call per render; not cached across requests. */
export async function currentActor(): Promise<Actor | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = getDb();
  const session = await db.query.sessionCookie.findFirst({
    where: and(eq(sessionCookie.tokenHash, await hashToken(token)), gt(sessionCookie.expiresAt, new Date())),
  });
  if (!session) return null;

  const account = await db.query.user.findFirst({ where: eq(user.id, session.userId) });
  if (!account) return null;

  return {
    userId: account.id,
    email: account.email,
    name: account.name,
    impersonatedByUserId: session.impersonatedByUserId,
  };
}

export async function requireCurrentActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw unauthorized();
  return actor;
}

export async function rolesFor(userId: string, eventId: string): Promise<MembershipRole[]> {
  const db = getDb();
  const rows = await db.query.membership.findMany({
    where: and(eq(membership.userId, userId), eq(membership.eventId, eventId)),
  });
  return rows.map((row) => row.role);
}

/**
 * The standard entry point for every authenticated surface: resolves the actor, resolves their
 * roles on this event, and refuses if they have none. A user with no membership must not be able to
 * tell an event that exists from one that does not, so this is `not_found`, not `forbidden`.
 */
export async function requireEventContext(eventId: string): Promise<EventContext> {
  const actor = await requireCurrentActor();
  const roles = await rolesFor(actor.userId, eventId);
  if (roles.length === 0) throw notFound('That event');
  return { actor, eventId, roles };
}

/** For public surfaces that behave differently when signed in but never require it. */
export async function optionalEventContext(eventId: string): Promise<EventContext | null> {
  const actor = await currentActor();
  if (!actor) return null;
  const roles = await rolesFor(actor.userId, eventId);
  return { actor, eventId, roles };
}

export async function grantRole(userId: string, eventId: string, role: MembershipRole): Promise<void> {
  await getDb().insert(membership).values({ userId, eventId, role }).onConflictDoNothing();
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessionCookie).where(eq(sessionCookie.tokenHash, await hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/**
 * `S-10`, and one of the places this diverges from the incumbent on purpose. Sessionboard offers a
 * read-only "view portal as…", which is useless for support — an organizer who can see that a
 * speaker is stuck cannot help them — and useless for judging.
 *
 * Here the organizer's session is replaced by a real session as the target user. Every write lands
 * as the speaker and takes effect. `impersonatedByUserId` identifies the organizer while this
 * session exists and drives the banner and exit route. Services that need durable attribution must
 * persist both identities themselves; not every mutation does that yet. Nothing branches on this
 * value for authorization, because a session that behaves differently is a preview wearing a
 * different name.
 */
export async function startImpersonation(ctx: EventContext, targetUserId: string): Promise<void> {
  if (!ctx.roles.includes('organizer')) {
    throw forbidden('Only organizers can view the portal as someone else');
  }
  if (ctx.actor.impersonatedByUserId) {
    // Otherwise the return path is a chain rather than a single step back to a known identity.
    throw forbidden('Stop the current impersonation before starting another');
  }
  const targetRoles = await rolesFor(targetUserId, ctx.eventId);
  if (targetRoles.length === 0) {
    throw notFound('That participant');
  }

  await signOut();
  await openSession(targetUserId, ctx.actor.userId);
}

export async function stopImpersonation(): Promise<void> {
  const actor = await requireCurrentActor();
  const returnTo = actor.impersonatedByUserId;
  if (!returnTo) throw invalid('You are not viewing as anyone');

  await signOut();
  await openSession(returnTo, null);
}
