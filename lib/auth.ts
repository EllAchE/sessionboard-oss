import { and, eq, gt, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '../db/client';
import { magicToken, membership, sessionCookie, user } from '../db/schema';
import type { Actor, EventContext, MembershipRole } from './context';
import { appUrl } from './env';
import { forbidden, invalid, notFound, unauthorized } from './errors';
import { hashToken, randomToken } from './ids';
import { sendMail } from './mail';
import { renderMarkdown } from './markdown';

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

async function findOrCreateUser(email: string, name?: string | null): Promise<{ id: string; email: string; name: string | null }> {
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
};

/**
 * Always reports success to the caller. Whether an address has an account is not something an
 * unauthenticated visitor gets to enumerate, and the UI copy ("check your inbox") is true either way.
 */
export async function requestMagicLink(
  request: MagicLinkRequest,
): Promise<{ email: string; link: string }> {
  const db = getDb();
  const account = await findOrCreateUser(request.email, request.name);
  const token = randomToken();

  await db.insert(magicToken).values({
    tokenHash: await hashToken(token),
    userId: account.id,
    eventId: request.eventId ?? null,
    redirectTo: request.redirectTo ?? null,
    expiresAt: addMinutes(MAGIC_TTL_MINUTES),
  });

  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  const body = [
    `Hi${account.name ? ` ${account.name}` : ''},`,
    '',
    `[Sign in to Cicero](${link})`,
    '',
    `This link works once and expires in ${MAGIC_TTL_MINUTES} minutes.`,
    'If you did not ask for it, you can ignore this email.',
  ].join('\n');

  await sendMail({
    to: account.email,
    subject: 'Your sign-in link',
    html: renderMarkdown(body),
    text: body.replace(`[Sign in to Cicero](${link})`, link),
    eventId: request.eventId ?? null,
    templateKey: 'auth.magic_link',
  });

  return { email: account.email, link };
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
 * as the speaker and takes effect. `impersonatedByUserId` keeps it attributable and drives the
 * banner and the exit route; nothing else in the codebase branches on it, because a session that
 * behaves differently is a preview wearing a different name.
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
