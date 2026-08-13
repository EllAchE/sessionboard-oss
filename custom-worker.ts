// OpenNext creates this module during `bun run cf:build`.
// @ts-expect-error Generated build output is intentionally absent from a clean checkout.
import openNextWorker from './.open-next/worker.js';
import { scheduleReminderRun, type CronExecutionContext } from './lib/cloudflare-cron';

interface CiceroWorkerEnv extends CloudflareEnv {
  APP_URL?: string;
  CRON_SECRET?: string;
}

type CiceroScheduledController = {
  cron: string;
  scheduledTime: number;
};

const ciceroWorker = {
  fetch: openNextWorker.fetch,

  scheduled(
    _controller: CiceroScheduledController,
    env: CiceroWorkerEnv,
    ctx: CronExecutionContext,
  ) {
    scheduleReminderRun(openNextWorker.fetch, env, ctx);
  },
};

export default ciceroWorker;
