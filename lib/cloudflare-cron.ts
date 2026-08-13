/**
 * The narrow bridge between Cloudflare's scheduled event and the Next application.
 *
 * OpenNext establishes the request-local Cloudflare context (including Hyperdrive) inside its
 * generated `fetch` handler. Calling that handler in-process keeps the cron job on the same tested
 * `/api/cron` service boundary as self-hosted schedulers without making a public network request.
 */

export type CronEnvironment = {
  APP_URL?: string;
  CRON_SECRET?: string;
};

/** The only ExecutionContext capability this bridge owns. */
export type CronExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export type WorkerFetch<Environment> = (
  request: Request,
  env: Environment,
  ctx: CronExecutionContext,
) => Response | Promise<Response>;

export type ScheduledJobResult = {
  ok: true;
  taskRemindersSent: number;
  deadlineRemindersSent: number;
  checkedAt: string;
};

function cronUrl(appUrl: string | undefined): URL {
  return new URL('/api/cron', appUrl ?? 'https://cicero-cron.internal');
}

/**
 * Dispatch one reminder pass through OpenNext's generated fetch handler.
 *
 * This is deliberately a direct function call, not `fetch(APP_URL)`: the Worker needs no public
 * route, DNS, or loopback HTTP request to run its own job. Passing through the generated handler is
 * still important because it supplies the request-scoped bindings consumed by `getDb()`.
 */
export async function runScheduledJobsThroughOpenNext<Environment extends CronEnvironment>(
  fetchHandler: WorkerFetch<Environment>,
  env: Environment,
  ctx: CronExecutionContext,
): Promise<ScheduledJobResult> {
  const headers = new Headers({ accept: 'application/json' });
  if (env.CRON_SECRET) headers.set('authorization', `Bearer ${env.CRON_SECRET}`);

  const response = await fetchHandler(
    new Request(cronUrl(env.APP_URL), { method: 'POST', headers }),
    env,
    ctx,
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Scheduled reminder run failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  const result = (await response.json()) as ScheduledJobResult;
  if (
    result.ok !== true ||
    typeof result.taskRemindersSent !== 'number' ||
    typeof result.deadlineRemindersSent !== 'number' ||
    typeof result.checkedAt !== 'string'
  ) {
    throw new Error('Scheduled reminder run returned an invalid response');
  }

  return result;
}

/** Keep the scheduled event alive until the OpenNext request and all of its side-effects settle. */
export function scheduleReminderRun<Environment extends CronEnvironment>(
  fetchHandler: WorkerFetch<Environment>,
  env: Environment,
  ctx: CronExecutionContext,
): void {
  ctx.waitUntil(
    runScheduledJobsThroughOpenNext(fetchHandler, env, ctx).then((result) => {
      console.info('Scheduled reminders completed', result);
    }),
  );
}
