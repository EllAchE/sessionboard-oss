import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/db/client', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => [{ requestCount: ++state.count }],
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/ids', () => ({ hashToken: vi.fn(async (value: string) => `hash:${value}`) }));

import { consumeRateLimit, rateLimitWindow } from './rate-limit';

describe('database-backed inbound rate limiting', () => {
  beforeEach(() => {
    state.count = 0;
  });

  it('uses deterministic fixed windows', () => {
    const { startedAt, resetAt } = rateLimitWindow(
      new Date('2026-08-13T12:00:42.500Z'),
      60,
    );
    expect(startedAt.toISOString()).toBe('2026-08-13T12:00:00.000Z');
    expect(resetAt.toISOString()).toBe('2026-08-13T12:01:00.000Z');
  });

  it('returns remaining capacity and rejects over-limit requests with a retry time', async () => {
    const policy = { namespace: 'test', limit: 2, windowSeconds: 60 };
    const now = new Date('2026-08-13T12:00:42.500Z');

    await expect(consumeRateLimit('caller', policy, now)).resolves.toMatchObject({ remaining: 1 });
    await expect(consumeRateLimit('caller', policy, now)).resolves.toMatchObject({ remaining: 0 });
    await expect(consumeRateLimit('caller', policy, now)).rejects.toMatchObject({
      code: 'rate_limited',
      details: { retryAfterSeconds: '18' },
    });
  });
});
