import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  apiKey,
  event as eventTable,
  membership,
  sessionCookie,
  user,
} from '@/db/schema';
import type { EventContext, MembershipRole } from '@/lib/context';
import { unauthorized } from '@/lib/errors';
import { hashToken, randomToken } from '@/lib/ids';

/**
 * `Z-5`. `Authorization: Bearer <key>`, keys are per event and hashed at rest with the same
 * `hashToken` that backs sessions and magic links — a database dump hands over no working key.
 *
 * The plaintext is never stored, so lookup goes by `prefix` (indexed, not secret) and then compares
 * hashes. A missing key and a wrong key are the same 401 with the same message; which one it was is
 * not the caller's business.
 */

const PREFIX_LENGTH = 8;

export type ApiKeyContext = {
  keyId: string;
  eventId: string;
  eventSlug: string;
  name: string;
};

export type IssuedKey = {
  id: string;
  name: string;
  prefix: string;
  /** Shown exactly once, at creation. Nothing reconstructs it afterwards. */
  plaintext: string;
  createdAt: Date;
};

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function cookieToken(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

/**
 * Speaker operations accept the same opaque token as the signed-in portal, either through the
 * HttpOnly cookie on a same-origin request or as a Bearer secret held by an API client. It remains
 * a user session—not an event-wide integration key—so every downstream service still sees the
 * speaker's identity and can enforce ownership.
 */
export async function requireSpeakerSession(
  request: Request,
  eventSlug: string,
): Promise<EventContext> {
  const token = bearerToken(request) ?? cookieToken(request, 'cicero_session');
  if (!token) throw unauthorized('Sign in as a speaker before changing this event');

  const db = getDb();
  const session = await db.query.sessionCookie.findFirst({
    where: and(
      eq(sessionCookie.tokenHash, await hashToken(token)),
      gt(sessionCookie.expiresAt, new Date()),
    ),
  });
  if (!session) throw unauthorized('That speaker session is not valid');

  const [eventRow, account] = await Promise.all([
    db.query.event.findFirst({ where: eq(eventTable.slug, eventSlug) }),
    db.query.user.findFirst({ where: eq(user.id, session.userId) }),
  ]);
  if (!eventRow || !account) throw unauthorized('That speaker session is not valid');

  const rows = await db.query.membership.findMany({
    where: and(eq(membership.userId, account.id), eq(membership.eventId, eventRow.id)),
  });
  const roles = rows.map((row) => row.role as MembershipRole);
  if (!roles.includes('speaker')) {
    throw unauthorized('That session is not a speaker on this event');
  }

  await db
    .update(sessionCookie)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessionCookie.id, session.id))
    .catch(() => undefined);

  return {
    actor: {
      userId: account.id,
      email: account.email,
      name: account.name,
      impersonatedByUserId: session.impersonatedByUserId,
    },
    eventId: eventRow.id,
    roles,
  };
}

/**
 * Resolves a key to its event, and rejects it if it is not the event in the path — a key issued for
 * one event must not read another's submissions.
 */
export async function requireApiKey(request: Request, eventSlug: string): Promise<ApiKeyContext> {
  const token = bearerToken(request);
  if (!token) throw unauthorized('Send an API key as `Authorization: Bearer <key>`');

  const db = getDb();
  const prefix = token.slice(0, PREFIX_LENGTH);
  const candidates = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.prefix, prefix), isNull(apiKey.revokedAt)));

  const hash = await hashToken(token);
  const match = candidates.find((row) => row.keyHash === hash);
  if (!match) throw unauthorized('That API key is not valid');

  const eventRow = await db.query.event.findFirst({
    where: eq(eventTable.id, match.eventId),
  });
  if (!eventRow || eventRow.slug !== eventSlug) {
    throw unauthorized('That API key does not belong to this event');
  }

  // Best-effort: a failed timestamp write must not fail the request it was decorating.
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, match.id))
    .catch(() => undefined);

  return {
    keyId: match.id,
    eventId: match.eventId,
    eventSlug,
    name: match.name,
  };
}

export async function issueApiKey(eventId: string, name: string): Promise<IssuedKey> {
  const plaintext = randomToken();
  const [row] = await getDb()
    .insert(apiKey)
    .values({
      eventId,
      name,
      prefix: plaintext.slice(0, PREFIX_LENGTH),
      keyHash: await hashToken(plaintext),
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    plaintext,
    createdAt: row.createdAt,
  };
}

export type ApiKeySummary = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export async function listApiKeys(eventId: string): Promise<ApiKeySummary[]> {
  const rows = await getDb().select().from(apiKey).where(eq(apiKey.eventId, eventId));
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Revocation is a timestamp, not a delete, so `lastUsedAt` survives as an audit trail. */
export async function revokeApiKey(eventId: string, keyId: string): Promise<void> {
  await getDb()
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, keyId), eq(apiKey.eventId, eventId)));
}
