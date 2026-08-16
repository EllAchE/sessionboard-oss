# Completed handoff: survey and document alternative Sessionboard designs

> **Completed 2026-08-16.** The resulting index and 32 repository reports live in
> [`../alternatives/README.md`](../alternatives/README.md). The brief below is retained to explain
> the survey method; it is not unfinished work.

Self-contained brief for the session that surveys other entrants' Sessionboard clones, reads their
code, and documents each one in this repo. You do not need prior context from the session that
wrote this page.

## Original status when this was written

At the time this handoff was drafted, no repositories had been collected or analyzed. That is no
longer the current state; use the completed output linked above. The instructions below are the
historical execution brief, not a request to start over.

Do not confuse this with the gap list measured against *our own* requirements, which does exist and
is a different thing entirely (see "What we shipped" below).

## Why this is worth doing

Two reasons, in priority order:

1. **Write-up material.** Knowing what other people built — especially what they shipped that we
   did not, and what they skipped that we built — is the strongest available evidence about which
   parts of the brief were genuinely hard and which reads of the ambiguities were common.
2. **A record of alternative designs.** Several teams solving the same frozen brief is a natural
   experiment. The interesting output is not a scoreboard, it is the set of *different structural
   choices* people made for the same requirement.

This is retrospective work. It will not change what ships.

## Hard constraints — read before touching Discord

The Discord access path is a **selfbot using the user's own account token**, which violates
Discord's Terms of Service. The account at risk is the user's. These are not suggestions:

- **Use the alt account, never the main one.** Confirm which account you are acting as before any
  command — every invocation prints `Discord: acting as <name>` to stderr.
- **Read-only. Absolutely.** Never `send`, never join a server, never react, never DM. The skill's
  `send` path is off-limits for this task in every circumstance.
- **Keep volume low.** Prefer `search` over paging `read` — it answers "where does X come up" in a
  handful of requests instead of one per 100 messages per channel.
- **Stop on any 429.** Do not retry in a loop. Shrink the query and come back later, or stop.
- **Never paste the Discord token into chat**, a file, a commit, or an agent prompt.
- **Never reproduce another entrant's demo credentials** — not in notes, not in this repo, not in
  chat. If a project's README or Discord message contains a login, do not copy it forward. Note
  only that a demo exists.

For public repositories, `git clone` and `gh repo view` are ordinary tooling and carry none of the
above risk. Prefer them over Discord for anything you can get from GitHub directly.

## Phase 1 — find the projects

Goal: a list of `owner/repo` (or bare URLs) that other entrants shared.

```
bun skills/discord/scripts/discord.ts whoami        # confirm the acting account FIRST
bun skills/discord/scripts/discord.ts guilds        # locate the competition server
bun skills/discord/scripts/discord.ts channels <guildId>
```

Then search rather than paging history. Discord matches whole tokens, not substrings, so the
keyword list *is* your recall ceiling — `deploy` will not find `deployed`. Run a spread:

```
bun skills/discord/scripts/discord.ts search <guild> github.com repo submission demo deployed vercel
bun skills/discord/scripts/discord.ts search <guild> sessionboard clone built shipped --json
```

`--json` carries `permalink`, `channel` and `author_id`, which you want for attribution. Expect
links in a submissions/showcase channel and scattered through general chat.

Record every candidate with where you found it. **Do not clone anything yet.**

## Phase 2 — pull and scan

Clone into the session scratchpad, never into this repo or a sibling of it:

```
git clone --depth 50 <url> "$SCRATCHPAD/alternatives/<owner>-<repo>"
```

For each project, answer these from the code — not from its README's claims:

- **Stack** — framework, language, ORM, database, styling, auth approach.
- **What actually runs** — is there a live deployment? Does the repo build? Note if you cannot tell.
- **Feature coverage** — walk the brief's areas: CFP intake, review rounds and scoring, decisions
  and notifications, agenda/scheduling with conflicts, speaker portal and tasks, content
  deliverables, comms, public pages, embeds, API, AI features.
- **Structural choices worth recording** — where did they put domain logic? One table or several
  for submissions? Did they build a form engine or hardcode forms? Is AI advisory or decisive?
- **What they shipped that we did not.** This is the headline output. Be specific and concrete.
- **What we shipped that they did not.** Equally interesting; do not skip it.
- **Scale** — rough LOC, file count, commit count, contributor count, time span of commits.

Verify claims against code before writing them down. A README saying "full conflict detection" is
a claim, not a fact.

## Phase 3 — document each one

One file per project at `docs/alternatives/<owner>-<repo>.md`, using the template in
`docs/alternatives/README.md`. Keep them factual and neutral. These are other people's work:
describe, do not grade, and do not editorialize about quality.

Never include: demo credentials, tokens, API keys, `.env` contents, or anything scraped from a
private channel that the author did not post publicly.

## Phase 4 — the index

Update `docs/alternatives/README.md`:

- The comparison matrix — features down the side, projects across the top.
- **The list this whole exercise exists to produce: every feature others shipped that we did not.**
  Consolidated, deduplicated, each attributed to the projects that have it.
- The count of repositories analyzed, and how many were found but *not* analyzed, with the reason
  (private, empty, unbuildable, never shared). An honest denominator matters more than a big
  numerator.

## What we shipped, for the diff

Read these before scanning anyone else's code, so you know what you are comparing against:

- `docs/06-submission-narrative.md` — the full account of what was built and why.
- `docs/01-requirements.md` — the frozen core requirement IDs.
- `docs/05-additional-requirements.md` — AR-1…AR-35.
- `docs/requirements-audit-checklist.md` — done vs. not. **Note its verdicts are pinned to an older
  commit and were not re-audited; only the test count is current.**

Our known gaps, as of 2026-08-16 — measured against our own requirements and the eval kit's rubric,
*not* against other entrants:

- `T-6` / `C-3` — real outbound email unproven on the deployed instance (no verified sender domain).
- `Z-1` — no running Cloudflare deployment. Supported and one plan upgrade away; the demo is on
  Vercel because the bundle is 3.42 MiB gzipped against the free tier's 3 MiB.
- `Z-3`, `N-1c`, `D-5` (token-spend receipts, not collected), `E-8`.
- The comms composer's missing `manual` audience.
- Embed export formats.
- R2 storage and SMS — implemented and tested, never exercised against a paid account.

Also: the eval kit (`sessionboard-eval-kit`, kept outside this repo) enumerates **18 scenarios
across 6 areas**, with `speaker-crm` behind `--includeOptional`. Only its `plan` phase was ever
run. **No scenarios were scored, so rubric coverage is 0%** and there is no headline score — the
kit withholds one below 60% coverage. If you want a defensible self-score, that harness is the way
to get it, and it needs no API key in harness mode.

## Working rules for this repo

- **Never edit the primary checkout.** Create a sibling worktree first:
  `git worktree add ../worktrees/<slug>-<timestamp> -b <branch>` off up-to-date `main`. Run
  `git status --short --branch` to confirm where you are before editing anything.
- Other worktrees you find dirty belong to other sessions. Do not stash, reset, clean, or commit
  them. Surface them once and leave them alone.
- Commits must be SSH-signed; keep one concern per PR.
- Run `bun run lint` and `bun run typecheck` before opening a PR. Docs-only changes cannot break
  the build, but CI runs it anyway.
- Remove only the worktree and branch your session created.
