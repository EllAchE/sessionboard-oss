import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../db/client';
import { event, scheduledSession } from '../../db/schema';
import {
  DELETE_MISSING_CONFIRMATION,
  planProgramReconciliation,
  reconcileProgram,
  type ProgramReconcileInput,
  type ProgramTaxonomy,
} from './program-reconcile';

const TAXONOMY: ProgramTaxonomy = {
  rooms: [{ id: 'room-curia', name: 'Curia Julia' }],
  tracks: [{ id: 'track-office', name: 'Constitution & Office' }],
  formats: [{ id: 'format-oratio', name: 'Oratio' }],
};

function request(overrides: Partial<ProgramReconcileInput> = {}): ProgramReconcileInput {
  return {
    source: 'accelevents',
    mode: 'merge',
    apply: false,
    sessions: [],
    deleteExternalIds: [],
    ...overrides,
  };
}

function session(
  externalId: string,
  title: string,
  overrides: Partial<ProgramReconcileInput['sessions'][number]> = {},
): ProgramReconcileInput['sessions'][number] {
  return {
    externalId,
    title,
    description: null,
    status: 'draft',
    startsAt: null,
    endsAt: null,
    room: null,
    track: null,
    format: null,
    ceuCredits: null,
    ...overrides,
  };
}

function stored(externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `session-${externalId}`,
    clientId: `accelevents:${externalId}`,
    title: 'Earlier title',
    descriptionMarkdown: null,
    status: 'draft' as const,
    startsAt: null,
    endsAt: null,
    roomId: null,
    trackId: null,
    formatId: null,
    ceuCredits: null,
    ...overrides,
  };
}

type MutableProgramState = {
  sessions: ReturnType<typeof stored>[];
  sessionSeq: number;
  locks: number;
  transactions: number;
  /** `AR-30`. The event's conflict policy, which the API path has to honour exactly as the UI does. */
  agendaConflictPolicy: 'warn' | 'block';
};

function inMemoryDatabase(state: MutableProgramState): Database {
  const update = (table: unknown) => {
    let values: Record<string, unknown> = {};
    let committed = false;
    const commit = () => {
      if (committed) return [];
      committed = true;
      if (table === event) {
        state.sessionSeq += 1;
        return [{ ref: state.sessionSeq }];
      }
      if (table === scheduledSession) {
        const index = state.sessions.findIndex((row) => row.clientId === values.clientId);
        if (index >= 0) state.sessions[index] = { ...state.sessions[index], ...values };
      }
      return [];
    };
    const builder = {
      set(next: Record<string, unknown>) {
        values = next;
        return builder;
      },
      where: () => builder,
      returning: () => Promise.resolve(commit()),
      then: (onOk: (rows: unknown[]) => unknown, onError?: (error: unknown) => unknown) =>
        Promise.resolve(commit()).then(onOk, onError),
    };
    return builder;
  };

  const database = {
    query: {
      scheduledSession: { findMany: async () => [...state.sessions] },
      room: { findMany: async () => TAXONOMY.rooms },
      track: { findMany: async () => TAXONOMY.tracks },
      sessionFormat: { findMany: async () => TAXONOMY.formats },
      event: {
        findFirst: async () => ({ agendaConflictPolicy: state.agendaConflictPolicy }),
      },
    },
    update,
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          const id = `created-${state.sessions.length + 1}`;
          state.sessions.push({
            ...stored('placeholder'),
            ...values,
            id,
          } as ReturnType<typeof stored>);
          return [{ id }];
        },
      }),
    }),
    delete: () => ({ where: async () => state.sessions.shift() }),
    execute: async () => {
      state.locks += 1;
    },
    transaction: async (work: (transaction: unknown) => Promise<unknown>) => {
      state.transactions += 1;
      return work(database);
    },
  };
  return database as unknown as Database;
}

describe('program reconciliation planning', () => {
  it('uses stable external ids to distinguish creates, updates, and noops', () => {
    const plan = planProgramReconciliation(
      request({
        sessions: [
          session('new', 'A new motion'),
          session('changed', 'A revised motion'),
          session('same', 'Earlier title'),
        ],
      }),
      [stored('changed'), stored('same')],
      TAXONOMY,
    );

    expect(plan.summary).toEqual({ create: 1, update: 1, delete: 0, noop: 1, error: 0 });
  });

  it('previews replace deletes but refuses to apply them without the exact confirmation', () => {
    const unconfirmed = planProgramReconciliation(
      request({ mode: 'replace', apply: true }),
      [stored('missing')],
      TAXONOMY,
    );
    expect(unconfirmed).toMatchObject({
      canApply: false,
      requiresDeleteConfirmation: true,
      summary: { delete: 1 },
    });

    const confirmed = planProgramReconciliation(
      request({
        mode: 'replace',
        apply: true,
        confirmDeleteMissing: DELETE_MISSING_CONFIRMATION,
      }),
      [stored('missing')],
      TAXONOMY,
    );
    expect(confirmed.canApply).toBe(true);
  });

  it('never infers organizer or another integration session as missing', () => {
    const plan = planProgramReconciliation(
      request({ mode: 'replace', confirmDeleteMissing: DELETE_MISSING_CONFIRMATION }),
      [
        stored('managed'),
        { ...stored('organizer'), clientId: null },
        { ...stored('airtable'), clientId: 'airtable:air-1' },
      ],
      TAXONOMY,
    );
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toMatchObject({ externalId: 'managed', action: 'delete' });
  });

  it('supports explicit merge deletes without turning the patch into a full replacement', () => {
    const plan = planProgramReconciliation(
      request({ deleteExternalIds: ['remove'] }),
      [stored('remove'), stored('keep')],
      TAXONOMY,
    );
    expect(plan.operations).toEqual([
      {
        externalId: 'remove',
        action: 'delete',
        sessionId: 'session-remove',
        changes: [],
        message: null,
      },
    ]);
  });

  it('reports every invalid record and prevents the collection from applying', () => {
    const plan = planProgramReconciliation(
      request({
        apply: true,
        sessions: [
          session('bad-publish', 'Unplaced public session', { status: 'published' }),
          session('duplicate', 'First'),
          session('duplicate', 'Second'),
        ],
      }),
      [],
      TAXONOMY,
    );
    expect(plan.summary.error).toBe(2);
    expect(plan.canApply).toBe(false);
  });

  it('resolves taxonomy by event-local id or exact case-insensitive name', () => {
    const plan = planProgramReconciliation(
      request({
        sessions: [
          session('published', 'The powers returned', {
            status: 'published',
            startsAt: '2027-01-13T08:00:00.000Z',
            endsAt: '2027-01-13T08:45:00.000Z',
            room: 'curia julia',
            track: 'track-office',
            format: 'Oratio',
          }),
        ],
      }),
      [
        stored('published', {
          title: 'The powers returned',
          status: 'published',
          startsAt: new Date('2027-01-13T08:00:00.000Z'),
          endsAt: new Date('2027-01-13T08:45:00.000Z'),
          roomId: 'room-curia',
          trackId: 'track-office',
          formatId: 'format-oratio',
        }),
      ],
      TAXONOMY,
    );
    expect(plan.summary).toMatchObject({ noop: 1, error: 0 });
  });

  it('normalizes null, empty, and whitespace descriptions to a clear', () => {
    for (const description of [null, '', '   ']) {
      const plan = planProgramReconciliation(
        request({ sessions: [session('clear', 'Earlier title', { description })] }),
        [stored('clear', { descriptionMarkdown: 'Old copy' })],
        TAXONOMY,
      );
      expect(plan.operations[0]).toMatchObject({
        action: 'update',
        changes: ['descriptionMarkdown'],
      });
    }
  });
});

describe('program reconciliation execution', () => {
  let state: MutableProgramState;
  let database: Database;

  beforeEach(() => {
    state = {
      sessions: [],
      sessionSeq: 0,
      locks: 0,
      transactions: 0,
      agendaConflictPolicy: 'warn',
    };
    database = inMemoryDatabase(state);
  });

  it('keeps preview side-effect free, then applies once and becomes idempotent', async () => {
    const input = request({ sessions: [session('new', 'A new motion')] });
    const preview = await reconcileProgram('event-1', input, database);
    expect(preview).toMatchObject({ applied: false, summary: { create: 1 } });
    expect(state.sessions).toHaveLength(0);
    expect(state.transactions).toBe(0);

    const applied = await reconcileProgram('event-1', { ...input, apply: true }, database);
    expect(applied).toMatchObject({ applied: true, summary: { create: 1 } });
    expect(state.sessions).toHaveLength(1);
    expect(state.locks).toBe(1);

    const repeated = await reconcileProgram('event-1', { ...input, apply: true }, database);
    expect(repeated).toMatchObject({ applied: true, summary: { noop: 1 } });
    expect(state.sessions).toHaveLength(1);
  });

  it('applies an explicit merge delete without touching unlisted records', async () => {
    state.sessions.push(stored('remove'), stored('keep'));
    const result = await reconcileProgram(
      'event-1',
      request({ apply: true, deleteExternalIds: ['remove'] }),
      database,
    );
    expect(result).toMatchObject({ applied: true, summary: { delete: 1 } });
    expect(state.sessions.map((row) => row.clientId)).toEqual(['accelevents:keep']);
  });

  it('applies an update to the row selected by its stable external id', async () => {
    state.sessions.push(stored('revise'));
    const result = await reconcileProgram(
      'event-1',
      request({ apply: true, sessions: [session('revise', 'Revised title')] }),
      database,
    );
    expect(result).toMatchObject({ applied: true, summary: { update: 1 } });
    expect(state.sessions[0].title).toBe('Revised title');
  });

  it('refuses an unconfirmed replace delete and applies the confirmed request', async () => {
    state.sessions.push(stored('missing'));
    const refused = await reconcileProgram(
      'event-1',
      request({ apply: true, mode: 'replace' }),
      database,
    );
    expect(refused).toMatchObject({
      applied: false,
      canApply: false,
      requiresDeleteConfirmation: true,
    });
    expect(state.sessions).toHaveLength(1);

    const applied = await reconcileProgram(
      'event-1',
      request({
        apply: true,
        mode: 'replace',
        confirmDeleteMissing: DELETE_MISSING_CONFIRMATION,
      }),
      database,
    );
    expect(applied).toMatchObject({ applied: true, summary: { delete: 1 } });
    expect(state.sessions).toHaveLength(0);
  });

  it('does not write any valid row when another row has an error', async () => {
    const result = await reconcileProgram(
      'event-1',
      request({
        apply: true,
        sessions: [
          session('valid', 'Valid draft'),
          session('invalid', 'Missing placement', { status: 'published' }),
        ],
      }),
      database,
    );
    expect(result).toMatchObject({ applied: false, canApply: false, summary: { error: 1 } });
    expect(state.sessions).toHaveLength(0);
  });

  const overlappingPair = () => {
    const placement = {
      startsAt: '2027-01-13T08:00:00.000Z',
      endsAt: '2027-01-13T08:45:00.000Z',
      room: 'Curia Julia',
      track: 'Constitution & Office',
    };
    return request({
      apply: true,
      sessions: [
        session('first', 'First motion', placement),
        session('second', 'Second motion', placement),
      ],
    });
  };

  it('rejects an overlapping room and track collection before any write under a block policy', async () => {
    state.agendaConflictPolicy = 'block';

    await expect(reconcileProgram('event-1', overlappingPair(), database)).rejects.toThrow(
      'both occupy',
    );
    expect(state.sessions).toHaveLength(0);
  });

  /**
   * `AR-30`. The API and the board have to agree. An organizer can drag these two talks into the
   * same room under the default `warn` policy, so a push that describes the same programme must not
   * come back `409` — it applies, and it reports what it left behind.
   */
  it('applies an overlapping collection under the default warn policy and reports the clashes', async () => {
    const result = await reconcileProgram('event-1', overlappingPair(), database);

    expect(result.applied).toBe(true);
    expect(state.sessions).toHaveLength(2);

    const messages = result.conflicts.map((item) => item.message);
    expect(result.conflicts.filter((item) => item.kind === 'room')).toHaveLength(1);
    expect(result.conflicts.filter((item) => item.kind === 'track')).toHaveLength(1);
    expect(messages.some((message) => message.includes('both occupy'))).toBe(true);
  });

  /** A room clash is an `error`; a track collision is a `warning`. Blocking never applies to the latter. */
  it('never blocks a track-only collision, even under a block policy', async () => {
    state.agendaConflictPolicy = 'block';
    const placement = {
      startsAt: '2027-01-13T08:00:00.000Z',
      endsAt: '2027-01-13T08:45:00.000Z',
      track: 'Constitution & Office',
    };

    const result = await reconcileProgram(
      'event-1',
      request({
        apply: true,
        sessions: [
          session('first', 'First motion', { ...placement, room: null }),
          session('second', 'Second motion', { ...placement, room: null }),
        ],
      }),
      database,
    );

    expect(result.applied).toBe(true);
    expect(state.sessions).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ kind: 'track', severity: 'warning' });
  });

  /** A dry run answers the question rather than throwing it, so an integrator can look before pushing. */
  it('reports the clashes a preview would create without writing anything', async () => {
    state.agendaConflictPolicy = 'block';

    const result = await reconcileProgram(
      'event-1',
      { ...overlappingPair(), apply: false },
      database,
    );

    expect(result.applied).toBe(false);
    expect(state.sessions).toHaveLength(0);
    expect(result.conflicts.map((item) => item.kind).sort()).toEqual(['room', 'track']);
  });
});
