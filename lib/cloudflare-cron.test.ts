import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runScheduledJobsThroughOpenNext,
  scheduleReminderRun,
  type CronExecutionContext,
  type ScheduledJobResult,
  type WorkerFetch,
} from './cloudflare-cron';

type TestEnvironment = { APP_URL?: string; CRON_SECRET?: string };

const RESULT: ScheduledJobResult = {
  ok: true,
  taskRemindersSent: 3,
  deadlineRemindersSent: 2,
  checkedAt: '2026-08-13T16:00:00.000Z',
};

function context(waitUntil = vi.fn()): CronExecutionContext {
  return {
    waitUntil,
  };
}

describe('Cloudflare scheduled reminder dispatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the OpenNext handler in-process with the cron route and configured secret', async () => {
    const fetchHandler: WorkerFetch<TestEnvironment> = vi.fn(async () =>
      Response.json(RESULT),
    );
    const env = {
      APP_URL: 'https://cicero.example.test/base/path',
      CRON_SECRET: 'private-cron-secret',
    };
    const ctx = context();

    await expect(runScheduledJobsThroughOpenNext(fetchHandler, env, ctx)).resolves.toEqual(RESULT);

    expect(fetchHandler).toHaveBeenCalledTimes(1);
    const [request, receivedEnv, receivedContext] = vi.mocked(fetchHandler).mock.calls[0]!;
    expect(request.url).toBe('https://cicero.example.test/api/cron');
    expect(request.method).toBe('POST');
    expect(request.headers.get('authorization')).toBe('Bearer private-cron-secret');
    expect(receivedEnv).toBe(env);
    expect(receivedContext).toBe(ctx);
  });

  it('works without the optional HTTP fallback secret', async () => {
    const fetchHandler: WorkerFetch<TestEnvironment> = vi.fn(async (request) => {
      expect(request.headers.has('authorization')).toBe(false);
      return Response.json(RESULT);
    });

    await expect(
      runScheduledJobsThroughOpenNext(fetchHandler, {}, context()),
    ).resolves.toEqual(RESULT);
  });

  it('rejects non-success and malformed responses so the scheduled event is observable as failed', async () => {
    const failed: WorkerFetch<TestEnvironment> = vi.fn(async () =>
      new Response('database unavailable', { status: 503 }),
    );
    await expect(runScheduledJobsThroughOpenNext(failed, {}, context())).rejects.toThrow(
      'Scheduled reminder run failed with HTTP 503: database unavailable',
    );

    const malformed: WorkerFetch<TestEnvironment> = vi.fn(async () =>
      Response.json({ ok: true, reminders: 5 }),
    );
    await expect(runScheduledJobsThroughOpenNext(malformed, {}, context())).rejects.toThrow(
      'Scheduled reminder run returned an invalid response',
    );
  });

  it('registers the whole run with waitUntil', async () => {
    let pending: Promise<unknown> | undefined;
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      pending = promise;
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchHandler: WorkerFetch<TestEnvironment> = vi.fn(async () =>
      Response.json(RESULT),
    );

    scheduleReminderRun(fetchHandler, {}, context(waitUntil));

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await pending;
    expect(info).toHaveBeenCalledWith('Scheduled reminders completed', RESULT);
  });
});
