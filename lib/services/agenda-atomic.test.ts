import { describe, expect, it, vi } from 'vitest';
import { runAtomicAgendaMutation } from './agenda-atomic';
import type { ScheduleEntry } from './schedule';

function entry(overrides: Partial<ScheduleEntry> & { id: string }): ScheduleEntry {
  return {
    ref: 1,
    title: overrides.id,
    submissionId: null,
    roomId: null,
    trackId: null,
    formatId: null,
    startsAt: null,
    endsAt: null,
    status: 'draft',
    ceuCredits: null,
    clientId: null,
    speakers: [],
    ...overrides,
  };
}

/** A room, a track and a speaker clash all at once between `existing` and `changed`. */
function brokenPair() {
  const startsAt = new Date('2026-10-12T16:00:00Z');
  const endsAt = new Date('2026-10-12T17:00:00Z');
  const speaker = { participantId: 'speaker-1', name: 'Ada' };
  return [
    entry({
      id: 'existing',
      roomId: 'room-1',
      trackId: 'track-1',
      startsAt,
      endsAt,
      speakers: [speaker],
    }),
    entry({
      id: 'changed',
      roomId: 'room-1',
      trackId: 'track-1',
      startsAt,
      endsAt,
      speakers: [speaker],
    }),
  ];
}

describe('runAtomicAgendaMutation', () => {
  it('does not commit a changed session with a room, track, or speaker overlap under a block policy', async () => {
    const calls: string[] = [];
    let committed = false;
    const transaction = vi.fn(async (work: (tx: object) => Promise<string>) => {
      const result = await work({});
      committed = true;
      return result;
    });
    const entries = brokenPair();

    await expect(
      runAtomicAgendaMutation(
        {
          transaction,
          lock: async () => {
            calls.push('lock');
          },
          loadEntries: async () => {
            calls.push('load');
            return entries;
          },
          loadPolicy: async () => {
            calls.push('policy');
            return 'block';
          },
        },
        async () => {
          calls.push('mutate');
          return { data: 'saved', changedSessionIds: ['changed'] };
        },
      ),
    ).rejects.toThrow('both occupy');

    expect(calls).toEqual(['lock', 'mutate', 'load', 'policy']);
    expect(committed).toBe(false);
  });

  it('commits endpoint-touching and cancelled sessions', async () => {
    let committed = false;
    const transaction = async (work: (tx: object) => Promise<string>) => {
      const result = await work({});
      committed = true;
      return result;
    };
    const entries = [
      entry({
        id: 'existing',
        roomId: 'room-1',
        startsAt: new Date('2026-10-12T16:00:00Z'),
        endsAt: new Date('2026-10-12T17:00:00Z'),
      }),
      entry({
        id: 'touching',
        roomId: 'room-1',
        startsAt: new Date('2026-10-12T17:00:00Z'),
        endsAt: new Date('2026-10-12T18:00:00Z'),
      }),
      entry({
        id: 'cancelled',
        roomId: 'room-1',
        startsAt: new Date('2026-10-12T16:30:00Z'),
        endsAt: new Date('2026-10-12T17:30:00Z'),
        status: 'cancelled',
      }),
    ];

    await expect(
      runAtomicAgendaMutation(
        {
          transaction,
          lock: async () => undefined,
          loadEntries: async () => entries,
          // Deliberately the strict policy: this asserts the *detector* finds nothing here, which
          // would be hidden if a permissive policy were doing the work instead.
          loadPolicy: async () => 'block',
        },
        async () => ({
          data: 'saved',
          changedSessionIds: ['touching', 'cancelled'],
        }),
      ),
    ).resolves.toBe('saved');
    expect(committed).toBe(true);
  });

  /**
   * `AR-30`, and the whole point of the change: with the default policy the conflicting agenda is
   * allowed to exist. If it were not, `A-2`'s conflicts view could only ever render zero rows.
   */
  it('commits a conflicting change under the default warn policy and hands the clashes to onWarn', async () => {
    let committed = false;
    const warned: string[] = [];

    await expect(
      runAtomicAgendaMutation(
        {
          transaction: async (work: (tx: object) => Promise<string>) => {
            const result = await work({});
            committed = true;
            return result;
          },
          lock: async () => undefined,
          loadEntries: async () => brokenPair(),
          loadPolicy: async () => 'warn',
          onWarn: (conflicts) => {
            warned.push(...conflicts.map((item) => item.kind));
          },
        },
        async () => ({ data: 'saved', changedSessionIds: ['changed'] }),
      ),
    ).resolves.toBe('saved');

    expect(committed).toBe(true);
    expect([...warned].sort()).toEqual(['room', 'speaker', 'track']);
  });

  /** An omitted `loadPolicy` must mean the product default, not "block everything". */
  it('treats a missing policy as warn', async () => {
    const warned: string[] = [];

    await expect(
      runAtomicAgendaMutation(
        {
          transaction: async (work) => work({}),
          lock: async () => undefined,
          loadEntries: async () => brokenPair(),
          onWarn: (conflicts) => {
            warned.push(...conflicts.map((item) => item.kind));
          },
        },
        async () => ({ data: 'saved', changedSessionIds: ['changed'] }),
      ),
    ).resolves.toBe('saved');

    expect(warned).toHaveLength(3);
  });

  /** A track collision is a warning, so `block` has nothing to block — it commits and still warns. */
  it('commits a track-only collision even under a block policy', async () => {
    const warned: string[] = [];
    const startsAt = new Date('2026-10-12T16:00:00Z');
    const endsAt = new Date('2026-10-12T17:00:00Z');

    await expect(
      runAtomicAgendaMutation(
        {
          transaction: async (work) => work({}),
          lock: async () => undefined,
          loadEntries: async () => [
            entry({ id: 'existing', trackId: 'track-1', startsAt, endsAt }),
            entry({ id: 'changed', trackId: 'track-1', startsAt, endsAt }),
          ],
          loadPolicy: async () => 'block',
          onWarn: (conflicts) => {
            warned.push(...conflicts.map((item) => item.kind));
          },
        },
        async () => ({ data: 'saved', changedSessionIds: ['changed'] }),
      ),
    ).resolves.toBe('saved');

    expect(warned).toEqual(['track']);
  });

  /** No clash, no noise: `onWarn` must not fire on a clean save. */
  it('does not warn when the mutation leaves the agenda clean', async () => {
    const onWarn = vi.fn();

    await expect(
      runAtomicAgendaMutation(
        {
          transaction: async (work) => work({}),
          lock: async () => undefined,
          loadEntries: async () => [
            entry({
              id: 'changed',
              roomId: 'room-1',
              startsAt: new Date('2026-10-12T16:00:00Z'),
              endsAt: new Date('2026-10-12T17:00:00Z'),
            }),
          ],
          loadPolicy: async () => 'warn',
          onWarn,
        },
        async () => ({ data: 'saved', changedSessionIds: ['changed'] }),
      ),
    ).resolves.toBe('saved');

    expect(onWarn).not.toHaveBeenCalled();
  });

  it('does not let an unrelated historical conflict block a safe change', async () => {
    const startsAt = new Date('2026-10-12T16:00:00Z');
    const endsAt = new Date('2026-10-12T17:00:00Z');
    const entries = [
      entry({ id: 'legacy-a', roomId: 'room-1', startsAt, endsAt }),
      entry({ id: 'legacy-b', roomId: 'room-1', startsAt, endsAt }),
      entry({ id: 'changed', roomId: 'room-2', startsAt, endsAt }),
    ];

    await expect(
      runAtomicAgendaMutation(
        {
          transaction: async (work) => work({}),
          lock: async () => undefined,
          loadEntries: async () => entries,
          loadPolicy: async () => 'block',
        },
        async () => ({ data: 'saved', changedSessionIds: ['changed'] }),
      ),
    ).resolves.toBe('saved');
  });
});
