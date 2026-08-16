import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppError, notFound } from '@/lib/errors';
import { publicEntries } from '@/lib/services/schedule';
import {
  parseSessionSyncCsv,
  planSessionSync,
  sessionSyncJsonBodySchema,
  syncPublishedSessions,
  type SessionSyncRow,
  type SessionSyncSession,
  type SessionSyncSnapshot,
  type SessionSyncStore,
} from './session-sync';

const START = new Date('2027-01-13T08:00:00.000Z');

function session(
  overrides: Partial<SessionSyncSession> & Pick<SessionSyncSession, 'id' | 'clientId'>,
): SessionSyncSession {
  const { id, clientId, ...optionalOverrides } = overrides;
  return {
    id,
    eventId: 'event-a',
    ref: 1,
    title: 'Existing session',
    submissionId: null,
    descriptionMarkdown: null,
    roomId: 'room-curia',
    trackId: 'track-constitution',
    formatId: 'format-oratio',
    startsAt: START,
    endsAt: new Date(START.getTime() + 45 * 60_000),
    status: 'published',
    ceuCredits: null,
    clientId,
    icsUid: `${id}@cicero.events`,
    icsSequence: 0,
    speakers: [],
    ...optionalOverrides,
  };
}

function snapshot(sessions: SessionSyncSession[] = []): SessionSyncSnapshot {
  return {
    sessions,
    rooms: [
      { id: 'room-curia', name: 'Curia Julia' },
      { id: 'room-portico', name: 'Portico of Octavia' },
    ],
    tracks: [{ id: 'track-constitution', name: 'Constitution & Office' }],
    formats: [
      { id: 'format-oratio', name: 'Oratio' },
      { id: 'format-consilium', name: 'Consilium' },
    ],
  };
}

function cloneSnapshot(value: SessionSyncSnapshot): SessionSyncSnapshot {
  return {
    ...value,
    sessions: value.sessions.map((row) => ({
      ...row,
      startsAt: row.startsAt ? new Date(row.startsAt) : null,
      endsAt: row.endsAt ? new Date(row.endsAt) : null,
      speakers: row.speakers.map((speaker) => ({ ...speaker })),
    })),
    rooms: value.rooms.map((row) => ({ ...row })),
    tracks: value.tracks.map((row) => ({ ...row })),
    formats: value.formats.map((row) => ({ ...row })),
  };
}

type InsertValues = Parameters<SessionSyncStore['insertSession']>[2];
type UpdatePatch = Parameters<SessionSyncStore['updateSession']>[2];

class FakeStore implements SessionSyncStore {
  events: Map<string, SessionSyncSnapshot>;
  sequences: Map<string, number>;
  transactionCalls = 0;
  lockedReads = 0;
  failClientId: string | null;

  constructor(
    events: Map<string, SessionSyncSnapshot>,
    sequences = new Map<string, number>(),
    failClientId: string | null = null,
  ) {
    this.events = new Map(
      [...events].map(([eventId, value]) => [eventId, cloneSnapshot(value)]),
    );
    this.sequences = new Map(sequences);
    this.failClientId = failClientId;
  }

  async transaction<T>(work: (transaction: SessionSyncStore) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    const working = new FakeStore(this.events, this.sequences, this.failClientId);
    const result = await work(working);
    this.events = working.events;
    this.sequences = working.sequences;
    this.lockedReads += working.lockedReads;
    return result;
  }

  async loadSnapshot(eventId: string, lock: boolean): Promise<SessionSyncSnapshot> {
    if (lock) this.lockedReads += 1;
    const value = this.events.get(eventId);
    if (!value) throw notFound('That event');
    return cloneSnapshot(value);
  }

  async reserveSessionRefs(eventId: string, count: number): Promise<number[]> {
    const current = this.sequences.get(eventId) ?? 0;
    const refs = Array.from({ length: count }, (_, index) => current + index + 1);
    this.sequences.set(eventId, current + count);
    return refs;
  }

  async insertSession(eventId: string, ref: number, values: InsertValues): Promise<string> {
    if (values.clientId === this.failClientId) throw new Error('injected write failure');
    const value = this.events.get(eventId);
    if (!value) throw notFound('That event');
    const id = `created-${values.clientId}`;
    value.sessions.push(
      session({
        id,
        eventId,
        ref,
        submissionId: null,
        ...values,
        icsUid: `${id}@cicero.events`,
      }),
    );
    return id;
  }

  async updateSession(eventId: string, sessionId: string, patch: UpdatePatch): Promise<void> {
    const value = this.events.get(eventId);
    const index = value?.sessions.findIndex((row) => row.id === sessionId) ?? -1;
    if (!value || index < 0) throw new Error('session missing');
    value.sessions[index] = { ...value.sessions[index], ...patch };
  }
}

function rows(input: unknown[]): SessionSyncRow[] {
  return sessionSyncJsonBodySchema.parse({ rows: input }).rows;
}

const romanFixture = readFileSync(
  new URL('../../docs/examples/first-settlement-session-sync.csv', import.meta.url),
  'utf8',
);

describe('session sync input', () => {
  it('parses the deterministic Roman fixture as exactly one create, update, and delete', () => {
    const parsed = parseSessionSyncCsv(romanFixture);
    expect(parsed.map((row) => row.action).sort()).toEqual(['create', 'delete', 'update']);
    expect(parsed).toHaveLength(3);
  });

  it('validates required headers, publishing fields, and timezone-aware ranges', () => {
    expect(() => parseSessionSyncCsv('title\nA session')).toThrowError(AppError);
    expect(() =>
      parseSessionSyncCsv(
        'action,client_id,title,room,starts_at,ends_at\ncreate,x,Talk,Curia Julia,2027-01-13T09:00:00,2027-01-13T08:00:00Z',
      ),
    ).toThrowError(AppError);
  });
});

describe('planSessionSync', () => {
  it('plans create, update, and logical delete while publishing only the resulting collection', () => {
    const current = snapshot([
      session({
        id: 'opening',
        clientId: 'roman-republic-restoration',
        title: 'On Returning the Republic to Senate and People',
      }),
      session({
        id: 'provincial',
        clientId: 'roman-provincial-command',
        title: 'A Ten-Year Command for the Unsettled Provinces',
        startsAt: new Date('2027-01-13T09:30:00.000Z'),
        endsAt: new Date('2027-01-13T10:00:00.000Z'),
      }),
    ]);

    const plan = planSessionSync(parseSessionSyncCsv(romanFixture), current);
    expect(plan).toMatchObject({ created: 1, updated: 1, deleted: 1, unchanged: 0 });
    expect(plan.conflicts).toEqual([]);
    expect(publicEntries(plan.finalEntries).map((row) => row.clientId).sort()).toEqual([
      'roman-censors-register',
      'roman-republic-restoration',
    ]);
    expect(
      plan.finalEntries.find((row) => row.clientId === 'roman-provincial-command')?.status,
    ).toBe('cancelled');
  });

  it('rejects cross-event client IDs and conflicting create reuse before any write', () => {
    const current = snapshot([
      session({ id: 'other', clientId: 'other-event-id', eventId: 'event-b' }),
      session({ id: 'opening', clientId: 'same-client' }),
    ]);
    const update = rows([
      {
        action: 'update',
        client_id: 'other-event-id',
        title: 'Attempted cross-event update',
        room: 'Curia Julia',
        starts_at: '2027-01-13T09:00:00+01:00',
        ends_at: '2027-01-13T09:45:00+01:00',
      },
    ]);
    const create = rows([
      {
        action: 'create',
        client_id: 'same-client',
        title: 'Different data',
        room: 'Curia Julia',
        starts_at: '2027-01-13T09:00:00+01:00',
        ends_at: '2027-01-13T09:45:00+01:00',
      },
    ]);

    expect(() => planSessionSync(update, snapshot([current.sessions[1]]))).toThrowError(AppError);
    expect(() => planSessionSync(create, current)).toThrowError(AppError);
  });
});

describe('syncPublishedSessions', () => {
  it('previews without a transaction, then applies atomically and replays as unchanged', async () => {
    const eventA = snapshot([
      session({
        id: 'opening',
        clientId: 'roman-republic-restoration',
        title: 'On Returning the Republic to Senate and People',
      }),
      session({
        id: 'provincial',
        clientId: 'roman-provincial-command',
        startsAt: new Date('2027-01-13T09:30:00.000Z'),
        endsAt: new Date('2027-01-13T10:00:00.000Z'),
      }),
    ]);
    const eventB = snapshot([
      session({ id: 'isolated', eventId: 'event-b', clientId: 'event-b-session' }),
    ]);
    const store = new FakeStore(
      new Map([
        ['event-a', eventA],
        ['event-b', eventB],
      ]),
      new Map([['event-a', 2]]),
    );
    const parsed = parseSessionSyncCsv(romanFixture);
    const notifications: Array<{ sessionId: string; cancel: boolean }> = [];
    const notify = async (sessionId: string, options: { cancel: boolean }) => {
      notifications.push({ sessionId, cancel: options.cancel });
    };

    const preview = await syncPublishedSessions('event-a', parsed, {
      dryRun: true,
      store,
      notify,
    });
    expect(preview).toMatchObject({ dryRun: true, created: 1, updated: 1, deleted: 1 });
    expect(preview.calendarNotifications).toEqual({ planned: 3, attempted: 0, failed: 0 });
    expect(store.transactionCalls).toBe(0);
    expect(store.events.get('event-a')).toEqual(eventA);

    const applied = await syncPublishedSessions('event-a', parsed, {
      dryRun: false,
      store,
      notify,
    });
    expect(applied).toMatchObject({ dryRun: false, created: 1, updated: 1, deleted: 1 });
    expect(applied.calendarNotifications).toEqual({ planned: 3, attempted: 3, failed: 0 });
    expect(notifications).toEqual(
      expect.arrayContaining([
        { sessionId: 'opening', cancel: false },
        { sessionId: 'provincial', cancel: true },
        { sessionId: 'created-roman-censors-register', cancel: false },
      ]),
    );
    expect(store.events.get('event-b')).toEqual(eventB);

    notifications.length = 0;
    const replay = await syncPublishedSessions('event-a', parsed, {
      dryRun: false,
      store,
      notify,
    });
    expect(replay).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 3 });
    expect(replay.calendarNotifications).toEqual({ planned: 0, attempted: 0, failed: 0 });
    expect(notifications).toEqual([]);
  });

  it('rolls the whole collection back when a later write fails', async () => {
    const original = snapshot();
    const store = new FakeStore(new Map([['event-a', original]]), new Map(), 'second');
    const input = rows([
      {
        action: 'create',
        client_id: 'first',
        title: 'First',
        room: 'Curia Julia',
        starts_at: '2027-01-13T09:00:00+01:00',
        ends_at: '2027-01-13T09:45:00+01:00',
      },
      {
        action: 'create',
        client_id: 'second',
        title: 'Second',
        room: 'Portico of Octavia',
        starts_at: '2027-01-13T10:00:00+01:00',
        ends_at: '2027-01-13T10:45:00+01:00',
      },
    ]);

    await expect(
      syncPublishedSessions('event-a', input, {
        dryRun: false,
        store,
        notify: async () => undefined,
      }),
    ).rejects.toThrow('injected write failure');
    expect(store.events.get('event-a')).toEqual(original);
    expect(store.sequences.get('event-a')).toBeUndefined();
  });
});
