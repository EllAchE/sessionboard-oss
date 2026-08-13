import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  event as eventTable,
  room as roomTable,
  scheduledSession,
  sessionFormat,
  track as trackTable,
} from '../../db/schema';
import { env } from '../env';
import { conflict, notFound } from '../errors';
import { FakeAccelEventsProgramGateway } from './fake-program';
import { FIXTURE_EVENT_URL } from './fixtures';
import { toSpeakerDto } from './mapping';
import { PersistentFakeAccelEventsProgramGateway } from './persistent-fake-program';
import type {
  AccelEventsProgramGateway,
  ProgramRecord,
  ProgramSyncAction,
  ProgramSyncMode,
  ProgramSyncResult,
  ProgramSyncSummary,
  RemoteProgramRecord,
} from './program-types';
import { accelEventsMode, listAcceptedSpeakers } from './sync';

export type ProgramSyncOptions = {
  mode?: ProgramSyncMode;
  allowDeletes?: boolean;
  resetFixture?: 'drifted';
};

export async function reconcilePublishedProgram(
  eventId: string,
  options: ProgramSyncOptions = {},
): Promise<ProgramSyncSummary> {
  if (accelEventsMode() !== 'fake') {
    throw conflict(
      'Full programme reconciliation belongs to the fixture province. Live Accelevents supports only the documented accepted-orator crossing.',
    );
  }

  const desired = await loadPublishedProgram(eventId);
  const eventUrl = env('ACCELEVENTS_EVENT_URL') ?? FIXTURE_EVENT_URL;
  const gateway = new PersistentFakeAccelEventsProgramGateway(eventId, eventUrl);
  const fixtureReset = options.resetFixture === 'drifted';
  if (fixtureReset) await gateway.resetToDriftedFixture(desired);

  return reconcileProgram(gateway, desired, {
    mode: options.mode ?? 'preview',
    allowDeletes: options.allowDeletes ?? false,
    fixtureReset,
  });
}

export async function reconcileProgram(
  gateway: AccelEventsProgramGateway,
  desired: ProgramRecord[],
  options: {
    mode: ProgramSyncMode;
    allowDeletes: boolean;
    fixtureReset?: boolean;
  },
): Promise<ProgramSyncSummary> {
  const remote = await gateway.listRecords();
  const operations = planProgramSync(desired, remote);
  const results: ProgramSyncResult[] = [];

  for (const operation of operations) {
    if (options.mode === 'preview' || operation.action === 'noop') {
      results.push({
        ...operation,
        status: options.mode === 'preview' ? 'planned' : 'unchanged',
        message:
          operation.action === 'delete'
            ? 'Preview only; apply mode also requires the deletion decree'
            : null,
      });
      continue;
    }

    if (operation.action === 'delete' && !options.allowDeletes) {
      results.push({
        ...operation,
        status: 'blocked',
        message: 'The remote inscription remains because the deletion decree is absent',
      });
      continue;
    }

    const record = desired.find(
      (candidate) =>
        candidate.resourceType === operation.resourceType &&
        candidate.sourceId === operation.sourceId,
    );

    if (operation.action === 'create' && record) {
      const created = await gateway.createRecord(record);
      results.push({
        ...operation,
        remoteId: created.remoteId,
        status: 'applied',
        message: null,
      });
    } else if (operation.action === 'update' && record && operation.remoteId) {
      await gateway.updateRecord(operation.remoteId, record);
      results.push({ ...operation, status: 'applied', message: null });
    } else if (operation.action === 'delete' && operation.remoteId) {
      await gateway.deleteRecord(operation.remoteId);
      results.push({ ...operation, status: 'applied', message: null });
    }
  }

  return {
    mode: options.mode,
    adapter: 'fake',
    eventUrl: gateway.eventUrl,
    allowDeletes: options.allowDeletes,
    fixtureReset: options.fixtureReset ?? false,
    counts: {
      create: results.filter((result) => result.action === 'create').length,
      update: results.filter((result) => result.action === 'update').length,
      delete: results.filter((result) => result.action === 'delete').length,
      noop: results.filter((result) => result.action === 'noop').length,
      blockedDeletes: results.filter(
        (result) => result.action === 'delete' && result.status === 'blocked',
      ).length,
    },
    results,
  };
}

export function planProgramSync(
  desired: ProgramRecord[],
  remote: RemoteProgramRecord[],
): Omit<ProgramSyncResult, 'status' | 'message'>[] {
  const desiredByKey = uniqueBySource(desired);
  const remoteByKey = uniqueBySource(remote);
  const keys = [...new Set([...desiredByKey.keys(), ...remoteByKey.keys()])].sort();

  return keys.map((key) => {
    const wanted = desiredByKey.get(key);
    const present = remoteByKey.get(key);

    if (!present && wanted) return operation(wanted, null, 'create');
    if (present && !wanted) return operation(present, present.remoteId, 'delete');
    if (!present || !wanted) throw new Error(`Program sync could not resolve ${key}`);

    return operation(
      wanted,
      present.remoteId,
      equalData(wanted.data, present.data) ? 'noop' : 'update',
    );
  });
}

async function loadPublishedProgram(eventId: string): Promise<ProgramRecord[]> {
  const db = getDb();
  const eventRow = await db.query.event.findFirst({
    where: eq(eventTable.id, eventId),
  });
  if (!eventRow) throw notFound('That event');

  const [sessions, speakers] = await Promise.all([
    db
      .select({
        id: scheduledSession.id,
        ref: scheduledSession.ref,
        title: scheduledSession.title,
        description: scheduledSession.descriptionMarkdown,
        startsAt: scheduledSession.startsAt,
        endsAt: scheduledSession.endsAt,
        status: scheduledSession.status,
        ceuCredits: scheduledSession.ceuCredits,
        room: roomTable.name,
        track: trackTable.name,
        format: sessionFormat.name,
      })
      .from(scheduledSession)
      .leftJoin(roomTable, eq(scheduledSession.roomId, roomTable.id))
      .leftJoin(trackTable, eq(scheduledSession.trackId, trackTable.id))
      .leftJoin(sessionFormat, eq(scheduledSession.formatId, sessionFormat.id))
      .where(eq(scheduledSession.eventId, eventId))
      .orderBy(asc(scheduledSession.startsAt), asc(scheduledSession.ref)),
    listAcceptedSpeakers(eventId),
  ]);

  const eventRecord: ProgramRecord = {
    resourceType: 'event',
    sourceId: eventRow.id,
    data: compact({
      slug: eventRow.slug,
      name: eventRow.name,
      tagline: eventRow.tagline,
      description: eventRow.descriptionMarkdown,
      timezone: eventRow.timezone,
      startsOn: eventRow.startsOn,
      endsOn: eventRow.endsOn,
      websiteUrl: eventRow.websiteUrl,
      venueName: eventRow.venueName,
      venueAddress: eventRow.venueAddress,
    }),
  };

  const sessionRecords: ProgramRecord[] = sessions
    .filter((session) => session.status === 'published')
    .map((session) => ({
      resourceType: 'session',
      sourceId: session.id,
      data: compact({
        ref: `SESS-${session.ref}`,
        title: session.title,
        description: session.description,
        status: session.status,
        startsAt: session.startsAt?.toISOString() ?? null,
        endsAt: session.endsAt?.toISOString() ?? null,
        room: session.room,
        track: session.track,
        format: session.format,
        ceuCredits: session.ceuCredits,
      }),
    }));

  const speakerRecords: ProgramRecord[] = speakers.map((speaker) => ({
    resourceType: 'speaker',
    sourceId: speaker.participantId,
    data: compact({
      ...toSpeakerDto(speaker),
      sessionTitles: speaker.sessionTitles,
    }),
  }));

  return [eventRecord, ...sessionRecords, ...speakerRecords];
}

function uniqueBySource<T extends ProgramRecord>(records: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const record of records) {
    const key = sourceKey(record);
    if (out.has(key)) throw conflict(`Program contains more than one ${key}`);
    out.set(key, record);
  }
  return out;
}

function sourceKey(record: ProgramRecord): string {
  return `${record.resourceType}:${record.sourceId}`;
}

function operation(
  record: ProgramRecord,
  remoteId: string | null,
  action: ProgramSyncAction,
): Omit<ProgramSyncResult, 'status' | 'message'> {
  return {
    resourceType: record.resourceType,
    sourceId: record.sourceId,
    remoteId,
    action,
  };
}

function equalData(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export { FakeAccelEventsProgramGateway };
