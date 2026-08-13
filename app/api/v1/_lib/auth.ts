import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { apiKey, event as eventTable } from '@/db/schema';
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

/**
 * Resolves a key to its event, and rejects it if it is not the event in the path — a key issued for
 * one event must not read another's submissions.
 */
export async function requireApiKey(request: Request, eventSlug: string): Promise<ApiKeyContext> {
  const token = bearerToken(request);
  if (!token) throw unauthorized('Send an aqueduct key as `Authorization: Bearer <key>`');

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
