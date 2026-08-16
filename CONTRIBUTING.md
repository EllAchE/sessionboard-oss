# Contributing to Cicero

Thanks for helping improve Cicero. Keep each pull request focused on one concern and describe the
observable outcome, not only the files changed.

## Setup

Use Bun; `bun.lock` is the dependency lockfile.

```bash
cp .env.example .env
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

`docker compose up` is the zero-configuration self-host path. It starts Postgres and MinIO, creates
the bucket, and migrates before serving.

## Working branches

Do not edit the shared primary checkout. Create a sibling Git worktree from current `origin/main`
and work on a dedicated branch. Treat dirty files in another checkout as someone else's work.

Before a broad change, inspect active pull requests and worktrees for overlap. The workstream table
in `docs/03-plan.md` records the original competition build; it is not current ownership policy.

## Verification

Run the checks relevant to the change before opening a pull request:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
bun run audit
```

For database behavior, point `DATABASE_URL` at a disposable migrated Postgres database and run
`bun run test:integration`. Run `bun run db:check` after changing the Drizzle schema or migration
metadata. OpenAPI and MCP changes must be regenerated with `bun run docs:openapi` and
`bun run docs:mcp`; CI fails if the checked-in artifacts drift.

`bun run audit` gates on high and critical advisories. Moderates still print, and Dependabot opens
weekly update pull requests, but a moderate does not block unrelated work. One known moderate is
expected: drizzle-kit depends on the deprecated `@esbuild-kit/core-utils`, which pins esbuild 0.18
(GHSA-67mh-4wv8-2f99). That advisory covers `esbuild serve`, which nothing here runs; drizzle-kit
0.31.10 is the newest release and still carries it; and Bun does not support scoped `overrides`, so
the only available silencer is a tree-wide esbuild downgrade that would also pull wrangler off its
pinned version. Leaving it visible is the better trade.

Database migrations and external sends deserve explicit rollout and rollback notes. Never aim a
seed or integration test at data you care about.

## Pull requests

Commits must be signed. Explain migrations, deployment order, external effects, and any validation
that could not be run. Do not commit credentials, API keys, magic links, database URLs, or captured
customer data.
