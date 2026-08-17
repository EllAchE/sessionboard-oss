import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  airtableSync,
  participant,
  participantRole,
  room as roomTable,
  scheduledSession,
  sessionFormat,
  submission,
  track as trackTable,
  user as userTable,
} from '../../db/schema';
import { features } from '../env';
import { isAppError } from '../errors';
import { formatRef } from '../ids';
import { getAirtableClient } from './client';
import {
  configuredTables,
  fieldsFor,
  type AirtableEntityType,
  type MirrorRow,
  type SessionMirrorRow,
  type SpeakerMirrorRow,
  type SubmissionMirrorRow,
} from './mapping';

/**
 * `Z-2`, one way only. Airtable is a mirror an organizer's team can build views over, never the
 * store — no transactions, no joins, five requests per second, and `A-2`'s conflict detection
 * would be unimplementable against it. Every write here is best-effort: a mirror failure is
 * recorded and surfaced, and never fails the Cicero write that triggered it.
 *
 * `airtable_sync` carries one row per entity with a unique constraint on
 * `(eventId, entityType, entityId)`, which is what makes the backfill resumable: a run that dies
 * halfway leaves synced rows marked synced, and the next run starts from what is left.
 */

export type MirrorEntity = { type: AirtableEntityType; id: string };

export function airtableEnabled(): boolean {
  return features.airtable();
}

/** Fire-and-forget from a write path. Never throws; the sync row is the record of what happened. */
export async function mirrorEntity(eventId: string, entity: MirrorEntity): Promise<void> {
  if (!airtableEnabled()) return;
  try {
    await syncEntities(eventId, [entity]);
  } catch (error) {
    console.error(
      `airtable mirror failed for ${entity.type} ${entity.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export type SyncProgress = {
  attempted: number;
  created: number;
  updated: number;
  failed: number;
  /** True when the run stopped early — rate limit or budget — and a resume has work left. */
  incomplete: boolean;
};

const EMPTY_PROGRESS: SyncProgress = {
  attempted: 0,
  created: 0,
  updated: 0,
  failed: 0,
  incomplete: false,
};

export async function syncEntities(
  eventId: string,
  entities: MirrorEntity[],
): Promise<SyncProgress> {
  const client = getAirtableClient();
  if (!client || entities.length === 0) return { ...EMPTY_PROGRESS };

  const tables = configuredTables();
  const progress: SyncProgress = { ...EMPTY_PROGRESS };
  const db = getDb();

  const byType = new Map<AirtableEntityType, string[]>();
  for (const entity of entities) {
    byType.set(entity.type, [...(byType.get(entity.type) ?? []), entity.id]);
  }

  for (const [entityType, ids] of byType) {
    const rows = await loadRows(eventId, entityType, ids);
    const existing = await db
      .select()
      .from(airtableSync)
      .where(
        and(
          eq(airtableSync.eventId, eventId),
          eq(airtableSync.entityType, entityType),
          inArray(airtableSync.entityId, ids),
        ),
      );
    const remoteByEntity = new Map(existing.map((row) => [row.entityId, row.remoteRecordId]));

    for (const row of rows) {
      progress.attempted += 1;
      const fields = fieldsFor(entityType, row);
      const remoteId = remoteByEntity.get(row.id) ?? null;

      try {
        const written = remoteId
          ? await client.updateRecords(tables[entityType], [{ id: remoteId, fields }])
          : await client.createRecords(tables[entityType], [fields]);

        await recordSync(eventId, entityType, row.id, {
          remoteRecordId: written[0]?.id ?? remoteId,
          status: 'synced',
          error: null,
        });

        if (remoteId) progress.updated += 1;
        else progress.created += 1;
      } catch (error) {
        const message = isAppError(error) ? error.message : 'Airtable rejected this record';
        if (!isAppError(error))
          console.error(error instanceof Error ? error.message : String(error));

        await recordSync(eventId, entityType, row.id, {
          remoteRecordId: remoteId,
          status: 'failed',
          error: message,
        });
        progress.failed += 1;

        // A 429 locks the base for 30 seconds. Stopping and reporting `incomplete` is cheaper than
        // burning the rest of the batch against a closed door; the next run resumes from here.
        if (isAppError(error) && error.code === 'rate_limited') {
          progress.incomplete = true;
          return progress;
        }
      }
    }
  }

  return progress;
}

async function recordSync(
  eventId: string,
  entityType: AirtableEntityType,
  entityId: string,
  patch: {
    remoteRecordId: string | null;
    status: 'pending' | 'synced' | 'failed';
    error: string | null;
  },
): Promise<void> {
  const db = getDb();
  await db
    .insert(airtableSync)
    .values({
      eventId,
      entityType,
      entityId,
      remoteRecordId: patch.remoteRecordId,
      status: patch.status,
      error: patch.error,
      syncedAt: patch.status === 'synced' ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [airtableSync.eventId, airtableSync.entityType, airtableSync.entityId],
      set: {
        remoteRecordId: patch.remoteRecordId,
        status: patch.status,
        error: patch.error,
        syncedAt: patch.status === 'synced' ? new Date() : null,
      },
    });
}

/**
 * "Sync now" (`Z-2`). Resumable by construction: it asks for what is not yet synced, so calling it
 * again after a rate-limit stop picks up exactly the remainder. `limit` bounds one run because
 * 5 rps means a thousand rows is over three minutes of wall clock.
 */
export async function backfill(
  eventId: string,
  options: {
    types?: AirtableEntityType[];
    limit?: number;
    force?: boolean;
  } = {},
): Promise<SyncProgress> {
  if (!airtableEnabled()) return { ...EMPTY_PROGRESS };

  const types = options.types ?? (['speaker', 'submission', 'session'] as AirtableEntityType[]);
  const limit = options.limit ?? 200;
  const db = getDb();

  const pending: MirrorEntity[] = [];

  for (const type of types) {
    const ids = await allEntityIds(eventId, type);
    if (ids.length === 0) continue;

    const synced = options.force
      ? new Set<string>()
      : new Set(
          (
            await db
              .select({ entityId: airtableSync.entityId })
              .from(airtableSync)
              .where(
                and(
                  eq(airtableSync.eventId, eventId),
                  eq(airtableSync.entityType, type),
                  eq(airtableSync.status, 'synced'),
                ),
              )
          ).map((row) => row.entityId),
        );

    for (const id of ids) {
      if (!synced.has(id)) pending.push({ type, id });
    }
  }

  const batch = pending.slice(0, limit);
  const progress = await syncEntities(eventId, batch);
  return {
    ...progress,
    incomplete: progress.incomplete || pending.length > batch.length,
  };
}

export type BackfillStatus = {
  enabled: boolean;
  baseId: string | null;
  tables: Record<AirtableEntityType, string>;
  counts: Record<AirtableEntityType, { total: number; synced: number; failed: number }>;
};

export async function backfillStatus(eventId: string): Promise<BackfillStatus> {
  const client = getAirtableClient();
  const tables = configuredTables();
  const types: AirtableEntityType[] = ['speaker', 'submission', 'session'];
  const db = getDb();

  const counts = {} as BackfillStatus['counts'];
  for (const type of types) {
    const ids = await allEntityIds(eventId, type);
    const rows = await db
      .select({ status: airtableSync.status })
      .from(airtableSync)
      .where(and(eq(airtableSync.eventId, eventId), eq(airtableSync.entityType, type)));

    counts[type] = {
      total: ids.length,
      synced: rows.filter((row) => row.status === 'synced').length,
      failed: rows.filter((row) => row.status === 'failed').length,
    };
  }

  return {
    enabled: airtableEnabled(),
    baseId: client?.baseId ?? null,
    tables,
    counts,
  };
}

export type AirtableLogEntry = {
  id: string;
  entityType: string;
  entityId: string;
  remoteRecordId: string | null;
  status: 'pending' | 'synced' | 'failed';
  error: string | null;
  syncedAt: Date | null;
  createdAt: Date;
};

export async function listAirtableLog(eventId: string, limit = 50): Promise<AirtableLogEntry[]> {
  const rows = await getDb()
    .select()
    .from(airtableSync)
    .where(eq(airtableSync.eventId, eventId))
    .orderBy(asc(airtableSync.createdAt));

  return rows.slice(-limit).reverse();
}

export async function testConnection(): Promise<{
  ok: boolean;
  message: string;
  tables?: string[];
}> {
  const client = getAirtableClient();
  if (!client) {
    return {
      ok: false,
      message: 'Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID to enable the mirror',
    };
  }

  try {
    const tables = await client.listTables();
    const names = tables.map((table) => table.name);
    const wanted = Object.values(configuredTables());
    const missing = wanted.filter((name) => !names.includes(name));

    return {
      ok: missing.length === 0,
      message:
        missing.length === 0
          ? `Connected to ${client.baseId}, with all ${wanted.length} tables present`
          : `Connected, but this base has no table named ${missing.join(', ')}`,
      tables: names,
    };
  } catch (error) {
    return {
      ok: false,
      message: isAppError(error) ? error.message : 'Could not reach Airtable',
    };
  }
}

// ---------------------------------------------------------------------------
// Read-only queries. They live here rather than in `lib/services/**`, which
// another workstream owns; nothing below writes.
// ---------------------------------------------------------------------------

async function allEntityIds(eventId: string, type: AirtableEntityType): Promise<string[]> {
  const db = getDb();

  if (type === 'submission') {
    const rows = await db
      .select({ id: submission.id })
      .from(submission)
      .where(eq(submission.eventId, eventId));
    return rows.map((row) => row.id);
  }

  if (type === 'session') {
    const rows = await db
      .select({ id: scheduledSession.id })
      .from(scheduledSession)
      .where(eq(scheduledSession.eventId, eventId));
    return rows.map((row) => row.id);
  }

  const rows = await db
    .select({ id: participant.id })
    .from(participant)
    .where(eq(participant.eventId, eventId));
  return rows.map((row) => row.id);
}

async function loadRows(
  eventId: string,
  type: AirtableEntityType,
  ids: string[],
): Promise<MirrorRow[]> {
  if (ids.length === 0) return [];
  if (type === 'submission') return loadSubmissionRows(eventId, ids);
  if (type === 'session') return loadSessionRows(eventId, ids);
  return loadSpeakerRows(eventId, ids);
}

async function loadSubmissionRows(eventId: string, ids: string[]): Promise<SubmissionMirrorRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: submission.id,
      ref: submission.ref,
      title: submission.title,
      status: submission.status,
      level: submission.level,
      abstract: submission.descriptionMarkdown,
      submittedAt: submission.submittedAt,
      trackName: trackTable.name,
      formatName: sessionFormat.name,
      speakerName: userTable.name,
      speakerEmail: userTable.email,
    })
    .from(submission)
    .leftJoin(trackTable, eq(submission.trackId, trackTable.id))
    .leftJoin(sessionFormat, eq(submission.formatId, sessionFormat.id))
    .leftJoin(userTable, eq(submission.submitterUserId, userTable.id))
    .where(and(eq(submission.eventId, eventId), inArray(submission.id, ids)));

  return rows.map((row) => ({
    id: row.id,
    ref: formatRef('submission', row.ref),
    title: row.title,
    status: row.status,
    trackName: row.trackName,
    formatName: row.formatName,
    level: row.level,
    speakerName: row.speakerName,
    speakerEmail: row.speakerEmail,
    abstract: row.abstract,
    submittedAt: row.submittedAt,
  }));
}

async function loadSpeakerRows(eventId: string, ids: string[]): Promise<SpeakerMirrorRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: participant.id,
      displayName: participant.displayName,
      pronouns: participant.pronouns,
      jobTitle: participant.jobTitle,
      company: participant.company,
      bio: participant.bioMarkdown,
      email: userTable.email,
      userName: userTable.name,
    })
    .from(participant)
    .innerJoin(userTable, eq(participant.userId, userTable.id))
    .where(and(eq(participant.eventId, eventId), inArray(participant.id, ids)));

  const accepted = await db
    .select({
      participantId: participantRole.participantId,
      title: submission.title,
    })
    .from(participantRole)
    .innerJoin(submission, eq(participantRole.submissionId, submission.id))
    .where(and(eq(submission.eventId, eventId), eq(submission.status, 'accepted')));

  const titles = new Map<string, string[]>();
  for (const row of accepted) {
    titles.set(row.participantId, [...(titles.get(row.participantId) ?? []), row.title]);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.displayName ?? row.userName,
    email: row.email,
    jobTitle: row.jobTitle,
    company: row.company,
    pronouns: row.pronouns,
    bio: row.bio,
    acceptedSessions: titles.get(row.id) ?? [],
  }));
}

async function loadSessionRows(eventId: string, ids: string[]): Promise<SessionMirrorRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: scheduledSession.id,
      ref: scheduledSession.ref,
      title: scheduledSession.title,
      status: scheduledSession.status,
      startsAt: scheduledSession.startsAt,
      endsAt: scheduledSession.endsAt,
      submissionId: scheduledSession.submissionId,
      trackName: trackTable.name,
      roomName: roomTable.name,
    })
    .from(scheduledSession)
    .leftJoin(trackTable, eq(scheduledSession.trackId, trackTable.id))
    .leftJoin(roomTable, eq(scheduledSession.roomId, roomTable.id))
    .where(and(eq(scheduledSession.eventId, eventId), inArray(scheduledSession.id, ids)));

  const submissionIds = rows
    .map((row) => row.submissionId)
    .filter((id): id is string => Boolean(id));
  const speakerNames = new Map<string, string[]>();

  if (submissionIds.length > 0) {
    const people = await db
      .select({
        submissionId: participantRole.submissionId,
        displayName: participant.displayName,
        userName: userTable.name,
        email: userTable.email,
      })
      .from(participantRole)
      .innerJoin(participant, eq(participantRole.participantId, participant.id))
      .innerJoin(userTable, eq(participant.userId, userTable.id))
      .where(inArray(participantRole.submissionId, submissionIds))
      .orderBy(asc(participantRole.position));

    for (const person of people) {
      const name = person.displayName ?? person.userName ?? person.email;
      speakerNames.set(person.submissionId, [
        ...(speakerNames.get(person.submissionId) ?? []),
        name,
      ]);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    ref: formatRef('session', row.ref),
    title: row.title,
    status: row.status,
    trackName: row.trackName,
    roomName: row.roomName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    speakerNames: row.submissionId ? (speakerNames.get(row.submissionId) ?? []) : [],
  }));
}
