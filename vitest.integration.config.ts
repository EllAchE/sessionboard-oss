import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The database-backed suite, kept separate from `vitest.config.ts` so `bun run test` stays a pure
 * unit run with no Postgres anywhere near it — that is what lets CI's test job keep working without
 * a service container, and what keeps the fast suite fast.
 *
 * Single-forked on purpose: these tests share one database, and running files in parallel against
 * it turns an ordering bug into an intermittent failure that costs far more than the wall clock it
 * saves.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['**/*.integration.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // A cold Postgres connection plus migrations is slower than any unit test here.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
