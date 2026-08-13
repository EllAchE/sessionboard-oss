# Repo Guidelines

`AGENTS.md` is the canonical, tool-neutral policy source. Claude Code reads the same bytes through
the root `CLAUDE.md` symlink; never replace that link with a second policy copy.

This is a Bun-based Next.js app deployed to Cloudflare Workers (OpenNext + Hyperdrive). See
`README.md` for environment setup and `docs/02-architecture.md` / `docs/03-plan.md` for the system
design and workstream ownership map.

- Install dependencies with `bun install` only when needed.
- After changes, run `bun run lint`, `bun run typecheck`, `bun run build`, and `bun run test` as
  relevant to what changed — these are exactly the CI gates in `.github/workflows/ci.yml`.

## Worktrees and Branches — read this before touching any file

**Never edit files directly in this primary checkout.** Every task, whether run by a human or a
spawned agent, must happen in its own dedicated git worktree on its own branch. Agents spawned
against this repo without that step are what caused concurrent in-progress changes to collide in
this checkout — do not repeat it.

- Before writing any code, run `git status --short --branch` in the directory you're about to work
  in. If it reports this primary checkout (not a path under `../worktrees/`), stop and create a
  worktree first — do not proceed with edits here.
- Create a sibling worktree: `git worktree add ../worktrees/<slug>-<timestamp> -b <branch>` from
  this repo's root, branching off up-to-date `main`. Follow the naming convention already in use in
  this repo — e.g. `s-<ticket>-<slug>-<timestamp>` for ticketed work, `<slug>-<timestamp>` for
  ad hoc tasks. Do the actual work inside that worktree path, never in an in-tree or built-in agent
  worktree.
- Confirm the worktree exists (`git worktree list`) and `cd` into it before editing.
- Treat any dirty state you find in the primary checkout or in another worktree as another session's
  in-progress work. Do not stash, restore, reset, clean, stage, or commit it — surface it once and
  make sure your own task is isolated in its own worktree instead.
- Respect the ownership boundaries in `docs/03-plan.md` §3 (the workstream table and the
  schema/service-signature/`components/ui` freeze rule) when your change crosses directories another
  workstream owns.
- After opening a PR, remove only the worktree and branch this session created; leave every other
  worktree and every other session's dirty state alone.

## PR Conventions

- Commits must be signed (existing history in this repo is `gpgsig`-signed; keep it that way).
- Keep one concern per PR and branch from up-to-date `main`.
