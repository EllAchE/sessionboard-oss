import { conflict, notFound } from '../errors';
import type {
  AccelEventsProgramGateway,
  ProgramRecord,
  ProgramResourceType,
  RemoteProgramRecord,
} from './program-types';

type FakeProgramOptions = {
  eventUrl: string;
  records?: RemoteProgramRecord[];
};

export class FakeAccelEventsProgramGateway implements AccelEventsProgramGateway {
  readonly kind = 'fake' as const;
  readonly eventUrl: string;

  private readonly byRemoteId = new Map<string, RemoteProgramRecord>();

  constructor(options: FakeProgramOptions) {
    this.eventUrl = options.eventUrl;
    for (const record of options.records ?? []) this.store(record);
  }

  async listRecords(): Promise<RemoteProgramRecord[]> {
    return [...this.byRemoteId.values()].map(clone).sort(compareRecords);
  }

  async createRecord(record: ProgramRecord): Promise<RemoteProgramRecord> {
    const existing = this.findBySource(record.resourceType, record.sourceId);
    if (existing)
      throw conflict(`${sourceKey(record)} already exists in the fake Accelevents event`);

    const created = { ...clone(record), remoteId: fakeRemoteId(record) };
    this.store(created);
    return clone(created);
  }

  async updateRecord(remoteId: string, record: ProgramRecord): Promise<RemoteProgramRecord> {
    if (!this.byRemoteId.has(remoteId)) throw notFound('That fake Accelevents record');
    const updated = { ...clone(record), remoteId };
    this.store(updated);
    return clone(updated);
  }

  async deleteRecord(remoteId: string): Promise<void> {
    if (!this.byRemoteId.delete(remoteId)) throw notFound('That fake Accelevents record');
  }

  resetToDriftedFixture(desired: ProgramRecord[]): void {
    this.byRemoteId.clear();
    for (const record of driftedFixtureRecords(desired)) this.store(record);
  }

  private findBySource(
    resourceType: ProgramResourceType,
    sourceId: string,
  ): RemoteProgramRecord | undefined {
    return [...this.byRemoteId.values()].find(
      (record) => record.resourceType === resourceType && record.sourceId === sourceId,
    );
  }

  private store(record: RemoteProgramRecord): void {
    this.byRemoteId.set(record.remoteId, clone(record));
  }
}

export function fakeRemoteId(record: ProgramRecord): string {
  return `fixture:${record.resourceType}:${record.sourceId}`;
}

export function driftedFixtureRecords(desired: ProgramRecord[]): RemoteProgramRecord[] {
  const byType = new Map<ProgramResourceType, ProgramRecord[]>();
  for (const record of [...desired].sort(compareRecords)) {
    byType.set(record.resourceType, [...(byType.get(record.resourceType) ?? []), record]);
  }

  const records: RemoteProgramRecord[] = [];
  for (const resourceType of ['event', 'session', 'speaker'] as const) {
    const desiredType = byType.get(resourceType) ?? [];
    const stale = desiredType[0];
    const unchanged = desiredType[1];
    if (stale) records.push(fixtureRecord(stale, driftedData(stale)));
    if (unchanged) records.push(fixtureRecord(unchanged, unchanged.data));
  }

  records.push({
    remoteId: 'fixture:session:retired-motion',
    resourceType: 'session',
    sourceId: 'retired-motion',
    data: {
      title: 'A Retired Motion',
      status: 'published',
    },
  });
  return records;
}

function fixtureRecord(record: ProgramRecord, data: Record<string, unknown>): RemoteProgramRecord {
  return {
    ...clone(record),
    remoteId: fakeRemoteId(record),
    data: clone(data),
  };
}

function driftedData(record: ProgramRecord): Record<string, unknown> {
  const field =
    record.resourceType === 'event'
      ? 'name'
      : record.resourceType === 'session'
        ? 'title'
        : 'firstName';
  const value = record.data[field];
  return {
    ...clone(record.data),
    [field]: typeof value === 'string' ? `${value} (outdated)` : 'Outdated fixture value',
  };
}

function sourceKey(record: ProgramRecord): string {
  return `${record.resourceType}:${record.sourceId}`;
}

function compareRecords(a: ProgramRecord, b: ProgramRecord): number {
  return sourceKey(a).localeCompare(sourceKey(b));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
