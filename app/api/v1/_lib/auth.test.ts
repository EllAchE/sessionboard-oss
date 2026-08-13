import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findEvent, selectWhere } = vi.hoisted(() => ({
  findEvent: vi.fn(),
  selectWhere: vi.fn(),
}));

vi.mock('@/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: selectWhere }) }),
    query: { event: { findFirst: findEvent } },
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  }),
}));
vi.mock('@/lib/ids', () => ({
  hashToken: vi.fn(async () => 'matching-hash'),
  randomToken: vi.fn(),
}));

import { requireApiKey } from './auth';

describe('event API-key isolation', () => {
  beforeEach(() => {
    selectWhere.mockReset();
    findEvent.mockReset();
    selectWhere.mockResolvedValue([
      {
        id: 'key-1',
        eventId: 'event-1',
        name: 'Integration',
        keyHash: 'matching-hash',
      },
    ]);
  });

  it('accepts a key only for its own event slug', async () => {
    findEvent.mockResolvedValue({ id: 'event-1', slug: 'first-settlement' });
    const context = await requireApiKey(
      new Request('https://cicero.test', { headers: { authorization: 'Bearer abcdefgh-secret' } }),
      'first-settlement',
    );
    expect(context.eventId).toBe('event-1');
  });

  it('rejects a valid key used against another event path', async () => {
    findEvent.mockResolvedValue({ id: 'event-1', slug: 'first-settlement' });
    await expect(
      requireApiKey(
        new Request('https://cicero.test', {
          headers: { authorization: 'Bearer abcdefgh-secret' },
        }),
        'other-event',
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
