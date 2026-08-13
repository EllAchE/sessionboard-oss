import { and, eq, like } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { accelevantsSync } from '../../db/schema';
import { conflict, notFound } from '../errors';
import { driftedFixtureRecords, fakeRemoteId } from './fake-program';
import { PROGRAM_RESOURCE_TYPES } from './program-types';
import type {
  AccelEventsProgramGateway,
  ProgramRecord,
  ProgramResourceType,
  RemoteProgramRecord,
} from './program-types';

type StoredProgramRecord = {
  kind: 'program_record';
  resourceType: ProgramResourceType;
  sourceId: string;
  data: Record<string, unknown>;
};

export class PersistentFakeAccelEventsProgramGateway implements AccelEventsProgramGateway {
  readonly kind = 'fake' as const;
  readonly eventUrl: string;

  constructor(
    private readonly eventId: string,
    eventUrl: string,
  ) {
    this.eventUrl = eventUrl;
  }

  async listRecords(): Promise<RemoteProgramRecord[]> {
    const rows = await getDb()
      .select({ remoteId: accelevantsSync.remoteId, requestBody: accelevantsSync.requestBody })
      .from(accelevantsSync)
      .where(
        and(eq(accelevantsSync.eventId, this.eventId), like(accelevantsSync.remoteId, 'fixture:%')),
      );

    return rows
      .flatMap((row) => decode(row.remoteId, row.requestBody))
      .sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
  }

  async createRecord(record: ProgramRecord): Promise<RemoteProgramRecord> {
    if ((await this.findBySource(record.resourceType, record.sourceId)) !== undefined) {
      throw conflict(`${sourceKey(record)} already exists in the fake Accelevents event`);
    }

    const remoteId = fakeRemoteId(record);
    await getDb()
      .insert(accelevantsSync)
      .values({
        eventId: this.eventId,
        remoteId,
        status: 'synced',
        requestBody: encode(record),
        responseBody: { adapter: 'fake' },
        syncedAt: new Date(),
      });
    return { ...structuredClone(record), remoteId };
  }

  async updateRecord(remoteId: string, record: ProgramRecord): Promise<RemoteProgramRecord> {
    const [updated] = await getDb()
      .update(accelevantsSync)
      .set({ requestBody: encode(record), syncedAt: new Date() })
      .where(and(eq(accelevantsSync.eventId, this.eventId), eq(accelevantsSync.remoteId, remoteId)))
      .returning({ remoteId: accelevantsSync.remoteId });
    if (!updated) throw notFound('That fake Accelevents record');
    return { ...structuredClone(record), remoteId };
  }

  async deleteRecord(remoteId: string): Promise<void> {
    const [deleted] = await getDb()
      .delete(accelevantsSync)
      .where(and(eq(accelevantsSync.eventId, this.eventId), eq(accelevantsSync.remoteId, remoteId)))
      .returning({ remoteId: accelevantsSync.remoteId });
    if (!deleted) throw notFound('That fake Accelevents record');
  }

  async resetToDriftedFixture(desired: ProgramRecord[]): Promise<void> {
    await getDb()
      .delete(accelevantsSync)
      .where(
        and(eq(accelevantsSync.eventId, this.eventId), like(accelevantsSync.remoteId, 'fixture:%')),
      );

    const records = driftedFixtureRecords(desired);
    if (records.length === 0) return;
    await getDb()
      .insert(accelevantsSync)
      .values(
        records.map((record) => ({
          eventId: this.eventId,
          remoteId: record.remoteId,
          status: 'synced' as const,
          requestBody: encode(record),
          responseBody: { adapter: 'fake' },
          syncedAt: new Date(),
        })),
      );
  }

  private async findBySource(
    resourceType: ProgramResourceType,
    sourceId: string,
  ): Promise<RemoteProgramRecord | undefined> {
    return (await this.listRecords()).find(
      (record) => record.resourceType === resourceType && record.sourceId === sourceId,
    );
  }
}

function encode(record: ProgramRecord): StoredProgramRecord {
  return {
    kind: 'program_record',
    resourceType: record.resourceType,
    sourceId: record.sourceId,
    data: structuredClone(record.data),
  };
}

function decode(remoteId: string | null, value: unknown): RemoteProgramRecord[] {
  if (!remoteId || !value || typeof value !== 'object' || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  if (
    record.kind !== 'program_record' ||
    !PROGRAM_RESOURCE_TYPES.includes(record.resourceType as ProgramResourceType) ||
    typeof record.sourceId !== 'string' ||
    !record.data ||
    typeof record.data !== 'object' ||
    Array.isArray(record.data)
  ) {
    return [];
  }

  return [
    {
      remoteId,
      resourceType: record.resourceType as ProgramResourceType,
      sourceId: record.sourceId,
      data: structuredClone(record.data as Record<string, unknown>),
    },
  ];
}

function sourceKey(record: ProgramRecord): string {
  return `${record.resourceType}:${record.sourceId}`;
}
