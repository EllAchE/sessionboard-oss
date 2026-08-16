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
 *
 * `.claude/**` is excluded because Claude Code puts its built-in agent worktrees under
 * `.claude/worktrees/<name>/`, and each one is a complete checkout of this repo. Vitest's default
 * glob walks straight into them, so one stray worktree adds a second copy of the whole suite —
 * mid-edit, on another branch — to `bun run test`. CI clones fresh and never sees them, so those
 * failures show up only locally, where they bury the real ones.
 *
 * Both entries extend `configDefaults.exclude` instead of replacing it: assigning `exclude` drops
 * vitest's defaults, which would pull `node_modules` and `dist` back into collection.
 */
export default defineConfig({
  // Next preserves JSX for its own compiler. Vite otherwise preserves it too, leaving Vitest's
  // SSR transform with syntax it cannot execute.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/**', '**/*.integration.test.ts'],
  },
});
