import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Only the `@/` alias. Test files were written with relative imports to survive without this file,
 * which meant anything reachable only through `@/` — most of `lib/services` — could not be tested
 * at all. Resolving it here costs nothing and removes that whole exclusion.
 *
 * `*.integration.test.ts` is excluded because it needs a live Postgres. Without this line vitest's
 * default glob would pick those files up and `bun run test` would fail on any machine — and in the
 * CI test job — that has no database. They run through `vitest.integration.config.ts` instead.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
