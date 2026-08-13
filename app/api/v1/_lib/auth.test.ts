import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findEvent, findMemberships, findSession, findUser, selectWhere } = vi.hoisted(() => ({
  findEvent: vi.fn(),
  findMemberships: vi.fn(),
  findSession: vi.fn(),
  findUser: vi.fn(),
  selectWhere: vi.fn(),
}));

vi.mock('@/db/client', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: selectWhere }) }),
    query: {
      event: { findFirst: findEvent },
      membership: { findMany: findMemberships },
      sessionCookie: { findFirst: findSession },
      user: { findFirst: findUser },
    },
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  }),
}));
vi.mock('@/lib/ids', () => ({
  hashToken: vi.fn(async () => 'matching-hash'),
  randomToken: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({
  API_KEY_RATE_LIMIT: {},
  SPEAKER_API_RATE_LIMIT: {},
  consumeRateLimit: vi.fn(),
}));

import { requireApiKey, requireSpeakerSession } from './auth';

describe('event API-key isolation', () => {
  beforeEach(() => {
    selectWhere.mockReset();
    findEvent.mockReset();
    selectWhere.mockResolvedValue([
      {
        id: 'key-1',
        eventId: 'event-1',
        name: 'Integration',
        scope: 'write',
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

  it('allows a write key to read and write', async () => {
    findEvent.mockResolvedValue({ id: 'event-1', slug: 'first-settlement' });
    const request = new Request('https://cicero.test', {
      headers: { authorization: 'Bearer abcdefgh-secret' },
    });
    await expect(requireApiKey(request, 'first-settlement', 'read')).resolves.toMatchObject({
      scope: 'write',
    });
    await expect(requireApiKey(request, 'first-settlement', 'write')).resolves.toMatchObject({
      scope: 'write',
    });
  });

  it('rejects a read-only key on a write operation', async () => {
    findEvent.mockResolvedValue({ id: 'event-1', slug: 'first-settlement' });
    selectWhere.mockResolvedValueOnce([
      {
        id: 'key-1',
        eventId: 'event-1',
        name: 'Website',
        scope: 'read',
        keyHash: 'matching-hash',
      },
    ]);
    await expect(
      requireApiKey(
        new Request('https://cicero.test', {
          headers: { authorization: 'Bearer abcdefgh-secret' },
        }),
        'first-settlement',
        'write',
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('speaker-session isolation', () => {
  beforeEach(() => {
    findEvent.mockReset().mockResolvedValue({ id: 'event-1', slug: 'first-settlement' });
    findSession.mockReset().mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      impersonatedByUserId: null,
    });
    findUser.mockReset().mockResolvedValue({
      id: 'user-1',
      email: 'speaker@example.com',
      name: 'Ada Speaker',
    });
    findMemberships.mockReset().mockResolvedValue([{ role: 'speaker' }]);
  });

  it.each([
    new Headers({ authorization: 'Bearer speaker-secret' }),
    new Headers({ cookie: 'another=value; cicero_session=speaker-secret' }),
  ])('accepts the signed-in speaker token from a supported transport', async (headers) => {
    const context = await requireSpeakerSession(
      new Request('https://cicero.test', { headers }),
      'first-settlement',
    );
    expect(context).toMatchObject({
      eventId: 'event-1',
      actor: { userId: 'user-1', email: 'speaker@example.com' },
      roles: ['speaker'],
    });
  });

  it('does not turn another event role into speaker authority', async () => {
    findMemberships.mockResolvedValue([{ role: 'organizer' }]);
    await expect(
      requireSpeakerSession(
        new Request('https://cicero.test', {
          headers: { authorization: 'Bearer speaker-secret' },
        }),
        'first-settlement',
      ),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
