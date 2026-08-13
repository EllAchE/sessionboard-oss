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

describe('runAtomicAgendaMutation', () => {
  it('does not commit a changed session with a room, track, or speaker overlap', async () => {
    const calls: string[] = [];
    let committed = false;
    const transaction = vi.fn(async (work: (tx: object) => Promise<string>) => {
      const result = await work({});
      committed = true;
      return result;
    });
    const startsAt = new Date('2026-10-12T16:00:00Z');
    const endsAt = new Date('2026-10-12T17:00:00Z');
    const speaker = { participantId: 'speaker-1', name: 'Ada' };
    const entries = [
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
        },
        async () => {
          calls.push('mutate');
          return { data: 'saved', changedSessionIds: ['changed'] };
        },
      ),
    ).rejects.toThrow('both occupy');

    expect(calls).toEqual(['lock', 'mutate', 'load']);
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
        },
        async () => ({
          data: 'saved',
          changedSessionIds: ['touching', 'cancelled'],
        }),
      ),
    ).resolves.toBe('saved');
    expect(committed).toBe(true);
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
        },
        async () => ({ data: 'saved', changedSessionIds: ['changed'] }),
      ),
    ).resolves.toBe('saved');
  });
});
