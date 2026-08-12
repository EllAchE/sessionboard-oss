import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Only the `@/` alias. Test files were written with relative imports to survive without this file,
 * which meant anything reachable only through `@/` — most of `lib/services` — could not be tested
 * at all. Resolving it here costs nothing and removes that whole exclusion.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
