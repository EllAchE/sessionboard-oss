import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runScheduledJobs, timingSafeEqualSpy, vars } = vi.hoisted(() => ({
  runScheduledJobs: vi.fn(),
  timingSafeEqualSpy: vi.fn(),
  vars: new Map<string, string | undefined>(),
}));

vi.mock('@/lib/services/comms', () => ({ runScheduledJobs }));
vi.mock('@/lib/env', () => ({ env: (key: string) => vars.get(key) }));
vi.mock('@/lib/ids', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ids')>();
  timingSafeEqualSpy.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: timingSafeEqualSpy };
});

import { GET, POST } from './route';

const SECRET = 'cron-secret-value';

function call(authorization?: string): Promise<Response> {
  return POST(
    new Request('https://cicero.test/api/cron', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    }),
  );
}

describe('cron dispatcher authorization', () => {
  beforeEach(() => {
    vars.clear();
    runScheduledJobs.mockReset();
    runScheduledJobs.mockResolvedValue({ reminders: 0 });
    timingSafeEqualSpy.mockClear();
  });

  it('runs the jobs when no secret is configured, which is the documented default', async () => {
    const response = await GET(new Request('https://cicero.test/api/cron'));
    expect(response.status).toBe(200);
    expect(runScheduledJobs).toHaveBeenCalledTimes(1);
  });

  it('accepts the configured secret as a bearer token', async () => {
    vars.set('CRON_SECRET', SECRET);
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(runScheduledJobs).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong secret, a missing header and a prefix of the real one alike', async () => {
    vars.set('CRON_SECRET', SECRET);
    for (const header of [undefined, 'Bearer wrong-secret-value', 'Bearer cron-sec', 'Bearer ']) {
      const response = await call(header);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    }
    expect(runScheduledJobs).not.toHaveBeenCalled();
  });

  /**
   * The point of the fix: the comparison never sees the raw secrets, so a caller cannot walk the
   * secret's length out of the response time by sending guesses that get longer. Every comparison
   * is between two 64-character SHA-256 digests, whatever was sent.
   */
  it('compares fixed-length digests rather than the submitted secret', async () => {
    vars.set('CRON_SECRET', SECRET);
    await call('Bearer a');
    await call(`Bearer ${'b'.repeat(500)}`);

    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(2);
    for (const args of timingSafeEqualSpy.mock.calls) {
      expect(args).toHaveLength(2);
      expect(args[0]).toHaveLength(64);
      expect(args[1]).toHaveLength(64);
      expect(args).not.toContain(SECRET);
    }
  });
});
