import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduledSession, submission, track } from '../../db/schema';
import type { AppError } from '../errors';
import { isAppError } from '../errors';
import type { EventContext } from '../context';
import {
  assertRemovable,
  createTrack,
  describeDependents,
  positionDrift,
  positionsForReorder,
  removeTrack,
  reorderTracks,
} from './settings';

/**
 * The two behaviours worth protecting are the ones a naive implementation gets wrong: a delete
 * that quietly blanks the track on every scheduled session, and a reorder that leaves duplicate
 * positions behind. Both are asserted against a recording stand-in for the database, so the test
 * can also check *which* rows were written — a renumber that rewrites all forty rows on every
 * nudge is a different bug from one that rewrites none.
 */

type Projection = Record<string, unknown> | undefined;

type Recorder = {
  /** Rows a `select … from(table)` reads back. */
  rows: Map<unknown, unknown[]>;
  /** Rows an `insert`/`update … returning()` hands back. */
  returning: Map<unknown, unknown[]>;
  counts: Map<unknown, number>;
  findFirst: Map<string, unknown>;
  updates: Array<{ table: unknown; values: Record<string, unknown> }>;
  deletes: unknown[];
};

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../db/client', () => ({ getDb: () => state.db }));

function recorder(): Recorder {
  return {
    rows: new Map(),
    returning: new Map(),
    counts: new Map(),
    findFirst: new Map(),
    updates: [],
    deletes: [],
  };
}

/** Chainable and awaitable at any point, which is the only shape of drizzle this file uses. */
function fakeDb(rec: Recorder) {
  const resolveSelect = (projection: Projection, table: unknown): unknown[] => {
    if (projection && 'value' in projection && !('id' in projection)) {
      return [{ value: rec.counts.get(table) ?? 0 }];
    }
    return rec.rows.get(table) ?? [];
  };

  const select = (projection?: Projection) => {
    let table: unknown = null;
    const builder = {
      from(next: unknown) {
        table = next;
        return builder;
      },
      where: () => builder,
      orderBy: () => builder,
      groupBy: () => builder,
      innerJoin: () => builder,
      then: (onOk: (value: unknown[]) => unknown, onErr?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveSelect(projection, table)).then(onOk, onErr),
    };
    return builder;
  };

  const returned = (table: unknown) => rec.returning.get(table) ?? rec.rows.get(table) ?? [];

  const update = (table: unknown) => {
    const builder = {
      set(values: Record<string, unknown>) {
        rec.updates.push({ table, values });
        return builder;
      },
      where: () => builder,
      returning: () => Promise.resolve(returned(table)),
      then: (onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) =>
        Promise.resolve(null).then(onOk, onErr),
    };
    return builder;
  };

  const insert = (table: unknown) => {
    const builder = {
      values: () => builder,
      returning: () => Promise.resolve(returned(table)),
    };
    return builder;
  };

  const remove = (table: unknown) => {
    const builder = {
      where: () => builder,
      then: (onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) => {
        rec.deletes.push(table);
        return Promise.resolve(null).then(onOk, onErr);
      },
    };
    return builder;
  };

  const query = new Proxy(
    {},
    {
      get: (_target, name: string) => ({
        findFirst: async () => rec.findFirst.get(name) ?? null,
      }),
    },
  );

  return { select, update, insert, delete: remove, query };
}

const EVENT_ID = 'event-1';

function context(roles: EventContext['roles'] = ['organizer']): EventContext {
  return {
    actor: {
      userId: 'user-1',
      email: 'chair@example.test',
      name: 'Chair',
      impersonatedByUserId: null,
    },
    eventId: EVENT_ID,
    roles,
  };
}

async function rejection(work: Promise<unknown>): Promise<AppError> {
  try {
    await work;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to be refused');
}

const TRACK_ROWS = [
  { id: 'track-a', position: 0 },
  { id: 'track-b', position: 1 },
  { id: 'track-c', position: 2 },
];

let rec: Recorder;

beforeEach(() => {
  rec = recorder();
  rec.findFirst.set('track', { id: 'track-b', eventId: EVENT_ID, name: 'Platform' });
  rec.rows.set(track, TRACK_ROWS);
  state.db = fakeDb(rec);
});

describe('describeDependents', () => {
  it('pluralises each noun and joins the tail with "and"', () => {
    expect(
      describeDependents([
        { noun: 'submission', count: 1 },
        { noun: 'scheduled session', count: 3 },
      ]),
    ).toBe('1 submission and 3 scheduled sessions');
  });

  it('drops the nouns that have no rows', () => {
    expect(
      describeDependents([
        { noun: 'submission', count: 0 },
        { noun: 'scheduled session', count: 2 },
      ]),
    ).toBe('2 scheduled sessions');
  });

  it('is null when nothing depends on the row', () => {
    expect(describeDependents([{ noun: 'submission', count: 0 }])).toBeNull();
  });
});

describe('assertRemovable', () => {
  it('passes when nothing depends on the row', () => {
    expect(() => assertRemovable('track', [{ noun: 'submission', count: 0 }])).not.toThrow();
  });

  it('refuses with a conflict that carries the count', () => {
    let thrown: unknown;
    try {
      assertRemovable('track', [{ noun: 'submission', count: 4 }]);
    } catch (error) {
      thrown = error;
    }
    expect(isAppError(thrown)).toBe(true);
    const error = thrown as AppError;
    expect(error.code).toBe('conflict');
    expect(error.message).toBe('That track is still used by 4 submissions');
    expect(error.details?.dependents).toBe('4');
  });

  it('yields to an explicit force', () => {
    expect(() =>
      assertRemovable('track', [{ noun: 'submission', count: 4 }], { force: true }),
    ).not.toThrow();
  });
});

describe('positionsForReorder', () => {
  it('renumbers from zero with no gaps', () => {
    const existing = [
      { id: 'a', position: 0 },
      { id: 'b', position: 4 },
      { id: 'c', position: 9 },
    ];
    expect(positionsForReorder(existing, ['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('closes the gap a delete left behind when no order is requested', () => {
    const existing = [
      { id: 'a', position: 0 },
      { id: 'c', position: 2 },
    ];
    expect(positionsForReorder(existing, [])).toEqual([
      { id: 'a', position: 0 },
      { id: 'c', position: 1 },
    ]);
  });

  it('keeps rows the caller omitted, in their existing order, after the ones it named', () => {
    const existing = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ];
    expect(positionsForReorder(existing, ['c'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('ignores a repeated id rather than numbering it twice', () => {
    const existing = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ];
    expect(positionsForReorder(existing, ['b', 'b', 'a'])).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
  });

  it('rejects an id from another event', () => {
    expect(() => positionsForReorder([{ id: 'a', position: 0 }], ['someone-elses'])).toThrow();
  });

  it('reports only the rows whose stored position actually moved', () => {
    const existing = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ];
    const next = positionsForReorder(existing, ['a', 'c', 'b']);
    expect(positionDrift(existing, next)).toEqual([
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });
});

describe('removeTrack', () => {
  it('refuses a delete that would blank the track on live rows, naming the count', async () => {
    rec.counts.set(submission, 2);
    rec.counts.set(scheduledSession, 3);

    const error = await rejection(removeTrack(context(), 'track-b'));
    expect(error.code).toBe('conflict');
    expect(error.message).toBe('That track is still used by 2 submissions and 3 scheduled sessions');
    expect(rec.deletes).toHaveLength(0);
  });

  it('deletes an unused track and renumbers what is left', async () => {
    rec.counts.set(submission, 0);
    rec.counts.set(scheduledSession, 0);
    // What compactPositions reads back after the delete: track-b is gone, track-c still holds 2.
    rec.rows.set(track, [
      { id: 'track-a', position: 0 },
      { id: 'track-c', position: 2 },
    ]);

    await removeTrack(context(), 'track-b');

    expect(rec.deletes).toEqual([track]);
    expect(rec.updates).toEqual([{ table: track, values: { position: 1 } }]);
  });

  it('honours force, and still closes the gap', async () => {
    rec.counts.set(submission, 7);
    rec.counts.set(scheduledSession, 0);
    rec.rows.set(track, [
      { id: 'track-a', position: 0 },
      { id: 'track-c', position: 2 },
    ]);

    await removeTrack(context(), 'track-b', { force: true });

    expect(rec.deletes).toEqual([track]);
    expect(rec.updates).toEqual([{ table: track, values: { position: 1 } }]);
  });

  it('moves dependents onto the sibling instead of blanking them', async () => {
    rec.counts.set(submission, 7);
    rec.counts.set(scheduledSession, 4);

    await removeTrack(context(), 'track-b', { reassignTo: 'track-a' });

    expect(rec.updates.slice(0, 2)).toEqual([
      { table: submission, values: { trackId: 'track-a' } },
      { table: scheduledSession, values: { trackId: 'track-a' } },
    ]);
    expect(rec.deletes).toEqual([track]);
  });

  it('refuses to reassign a track onto itself', async () => {
    const error = await rejection(removeTrack(context(), 'track-b', { reassignTo: 'track-b' }));
    expect(error.code).toBe('invalid');
    expect(rec.deletes).toHaveLength(0);
  });

  it('is closed to a reviewer', async () => {
    const error = await rejection(removeTrack(context(['reviewer']), 'track-b'));
    expect(error.code).toBe('forbidden');
  });
});

describe('reorderTracks', () => {
  it('writes only the rows that moved', async () => {
    await reorderTracks(context(), ['track-b', 'track-a', 'track-c']);
    expect(rec.updates).toEqual([
      { table: track, values: { position: 0 } },
      { table: track, values: { position: 1 } },
    ]);
  });

  it('writes nothing when the requested order is the stored one', async () => {
    await reorderTracks(context(), ['track-a', 'track-b', 'track-c']);
    expect(rec.updates).toHaveLength(0);
  });

  it('is closed to a reviewer', async () => {
    const error = await rejection(reorderTracks(context(['reviewer']), ['track-a']));
    expect(error.code).toBe('forbidden');
  });
});

describe('createTrack', () => {
  it('rejects a literal colour so a hex can never reach the database', async () => {
    const error = await rejection(createTrack(context(), { name: 'Platform', color: '#B7391F' }));
    expect(error.code).toBe('invalid');
  });

  it('appends the new row at the end of the list', async () => {
    // No existing track named "Platform" here, unlike the shared beforeEach fixture — this is
    // the free-name path, not the conflict path.
    rec.findFirst.set('track', null);
    rec.rows.set(track, [
      { id: 'track-a', position: 0 },
      { id: 'track-b', position: 1 },
    ]);
    rec.returning.set(track, [
      { id: 'track-new', name: 'Platform', color: '--lapis-500', description: null, position: 2 },
    ]);

    const created = await createTrack(context(), { name: 'Platform', color: '--lapis-500' });
    expect(created.position).toBe(2);
  });
});
