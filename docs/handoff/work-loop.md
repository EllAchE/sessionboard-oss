# Cicero — overnight work brief

You are working alone, unattended, overnight. Logan is asleep. Nobody will answer a question, so
**never stop to ask one** — make the call, write down what you decided and why, and keep going.

## What this is

Cicero is an open-source replacement for Sessionboard (conference / call-for-papers management),
built as an entry to the **"$10,000 Kill My SaaS"** competition run by swyx and the AI Engineer team.

**Hard deadline: Wednesday 12 August 2026, 22:00 America/Los_Angeles.** Everything you do is in
service of the entry scoring well at that moment. If a change would be risky and unfinished at the
deadline, don't start it.

Judging tiebreaker, verbatim from the brief: *"whoever made the subjective judgment calls for the
product we would actually use/buy."* That sentence should decide every close call you face.

- Repo: `~/cicero` (`git@github.com:EllAchE/sessionboard-oss.git`), branch `main`
- Live deployment: **https://cicero.lhar8771.workers.dev** — Cloudflare Workers, Neon Postgres via
  Hyperdrive, already migrated and seeded with a demo event at `/demo`
- Eval kit: `~/kms-evals` (`mkly/killmysaas-evals-coding-agent`), deps installed, Chromium installed

## State when you start

Green: 305/305 vitest tests, 0 TypeScript errors, `next build` and `bun run cf:build` both pass, the
site is deployed and serving the seeded demo. All 98 eval-kit rubric items are *implemented*, but
coverage has never been measured against a running instance. That measurement is job three.

## The three jobs, in priority order

### 1. Build a real landing page

`app/page.tsx` is currently a competent router — wordmark, tagline, role-aware buttons, event lists
— and nothing else. A judge landing cold learns nothing about what the product does or why it is
better than the incumbent. That is the single weakest surface in the entry.

Replace it with a landing page that sells the product, **while keeping the existing signed-in
routing behaviour intact** — an organizer with events must still land on their events, a speaker on
their portal, a reviewer on their queue. Do not regress that; it answers four audiences at once and
it works.

What the page needs:

- A hero that says what Cicero is in one sentence a conference organizer would recognise.
- **An obvious path into the demo.** A judge must reach a populated event in one click. Say plainly
  that sign-in is by emailed link and that on this deployment the link appears on screen, so nobody
  goes hunting for an inbox that does not exist.
- The differentiators, stated as claims a skeptical buyer would test. These are the deliberate
  divergences from Sessionboard and they are what the tiebreaker rewards:
  - **The outstanding-task dashboard.** Sessionboard's own FAQ admits it has no central
    task-completion report. This is the one place we supply something missing rather than clone
    something present. **Lead with it.**
  - **Magic links for every role, no passwords anywhere.** Sessionboard makes speakers keep a
    password they have forgotten by the time they return.
  - **Real impersonation, not read-only preview.** An organizer can complete a stuck speaker's task
    as them, and it stays attributable via `impersonated_by`.
  - **Calendar invites that update in place** on reschedule — a genuine `METHOD:REQUEST` with
    `SEQUENCE` bumping, not an add-to-calendar link.
  - **Speaker double-booking detection**, not just room clashes. A room clash is a spreadsheet
    error; a speaker booked twice fails publicly, on the day.
  - **Airtable as a one-way mirror, not the store.** Explain the trade honestly: Airtable as the
    primary store has no transactions, no joins, and a 5 req/s ceiling that makes conflict detection
    unimplementable, so we mirror to it instead of crippling the product to claim a bonus.
- Self-hosting in one command (`docker compose up`), and that it is MIT and runs on your own
  Postgres.
- Links that all resolve. Check every one.

Use the existing Cicero design system — tokens in `app/tokens.css`, components in `components/ui/`.
Do not introduce Tailwind, shadcn, Radix, or a new component library; the design system uses none of
them and fighting it will cost you the night. Dark mode is `[data-theme="dark"]` on the root and
must work.

### 2. Humanize every piece of user-facing copy

Load the `humanizer` skill (`~/.claude/skills/humanizer`) and run its standard over **all copy a
user reads**: the new landing page, empty states, button labels, form help text, error messages,
email templates in `lib/mail/` and the comms templates, dialog descriptions, onboarding text.

Strip the AI tells the skill enumerates — rule-of-three triads, "it's not just X, it's Y", em-dash
pile-ups, corporate throat-clearing, reflexive hedging, significance inflation. Aim for tight
engineer-to-engineer prose. Cicero's existing voice is dry, specific and a little opinionated
(see the tagline and the code comments) — match it, don't flatten it into marketing.

**Do not touch code comments or docs**, only strings a user sees. And do not rewrite Logan's words
where they appear verbatim.

### 3. Run the eval loop

The kit at `~/kms-evals` grades the submission against **98 rubric items across 20 scenarios and 7
areas**. Area weights: call-for-papers 20, abstract-management 20, public-widgets 20,
speaker-management 15, content-management 15, ai-agenda 10, speaker-crm 10.

Two things to know. **Below 60% coverage the headline score is withheld entirely**, so breadth beats
depth — a scenario you never ran hurts more than one you ran and half-passed. And the `rule` and
`scoping` rubric types (a stated constraint actually enforced; a role seeing exactly what it should
and no more) are the strongest signal in the whole rubric — `exists` and `crud` barely discriminate.

Use the **harness path**, not `sbek run` — there is no `ANTHROPIC_API_KEY` on this box and you do not
need one. Read `~/kms-evals/README.md` and the skills in `~/kms-evals/.agents/skills/`
(`sbek-browse`, `sbek-judge`). In outline:

```bash
cd ~/kms-evals
cp evalconfig.example.json evalconfig.json    # set "url" to the live deployment
bun run sbek -- plan --url https://cicero.lhar8771.workers.dev
```

Then drive the `sbek` MCP server yourself: `start_scenario`, `snapshot` / `click` / `fill` /
`select` / `press` / `upload`, `screenshot`, `observe`, `done`. Repeat until `plan` shows every
scenario `[done]`. **Judge in a subagent, never in the session that browsed** — an agent that just
drove the app grades what it meant to do rather than what it did, and that bias is the whole reason
the kit separates the two roles. Then `bun run sbek -- score`.

Read `report.json`. Fix the lowest-scoring items, weighted by area. Redeploy. Re-run. Keep looping
until morning or until you run out of things worth fixing.

## The loop protocol

Each iteration:

1. `git pull` and re-read `PROGRESS.md` (below) so you know what past iterations did.
2. Do the highest-value remaining work.
3. `bunx tsc --noEmit` and `bun run test` — **both must pass before you commit.** If you cannot get
   them green, revert your change rather than committing something broken. A working site scores;
   a broken one scores zero.
4. Commit with a signed commit and a message explaining *why*, not what.
5. `bun run cf:build && ./node_modules/.bin/wrangler deploy`
6. Verify the deploy actually serves — fetch the landing page and `/demo` and confirm they render.
   **A deploy you did not verify is not a deploy.**
7. Append to `PROGRESS.md`: what you changed, what the eval said, what you would do next.

`PROGRESS.md` lives at `~/cicero-loop/PROGRESS.md`, outside the repo. Never commit it.

## Rules you must not break

- **Use `bun`, never `npm`.** The lockfile is `bun.lock`. `npm install` fails outright on a fresh
  clone: `wrangler@^3.99.0` conflicts with `@opennextjs/cloudflare`'s `wrangler@^4.86.0` peer. Bun
  resolves it. If you have spare time near the end, fixing that conflict so `npm install` also works
  is worth doing — a judge cloning the repo will reach for npm — but only with tests green after.
- **Never run schema migrations or DDL.** The database is already migrated. If you believe a
  migration is needed, write the exact command into `PROGRESS.md` and move on. Do not run it.
- **Never run bare `npx prettier` in this repo.** There is no `.prettierrc` and no `prettier` key in
  `package.json`, so it falls back to defaults and rewrites the entire codebase. If you format, use:
  `--single-quote --print-width 100 --trailing-comma all --arrow-parens always --semi`
- Commits must be signed; the signing key is configured. Verify with
  `git cat-file commit HEAD | grep -c gpgsig` returning `1` — `git log --format='%G?'` reports `N`
  here because of an unrelated `allowedSignersFile` gap, so don't trust it.
- Push to `main` directly. No PR ceremony — this is a competition entry on a deadline.
- Do not touch `~/cicero/.env` or `~/.wrangler/config/default.toml`, and never print their contents
  or paste a credential into a commit, a log, or `PROGRESS.md`.
- Do not change the database, the hosting target, or the design system. Those are settled.
- Do not flip repo visibility and do not submit the entry. Logan is handling both himself.

## What "done" looks like

By morning Logan should find: a landing page that makes the case for the product, copy throughout
that does not read as machine-written, a measured eval score with the gaps that remain named
honestly, and a deployed site that still works. **A deployed site that still works is the floor** —
never trade it for an unfinished improvement.

If you break something and cannot fix it, revert to the last commit that deployed cleanly, redeploy,
and say so plainly at the top of `PROGRESS.md`. An honest report of a bad night is worth far more
than a hopeful one.
