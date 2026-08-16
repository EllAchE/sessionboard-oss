# External Sessionboard product evaluation

This is the operational handoff for grading Cicero with the competition's external Sessionboard
evaluation kit. It is deliberately separate from `bun run eval`, which only runs this repository's
lint, typecheck, unit-test, and build gates. A green local eval does **not** produce a product-rubric
score.

## Evaluator and target

- Evaluator: [`mkly/killmysaas-evals-coding-agent`](https://github.com/mkly/killmysaas-evals-coding-agent)
- Package name: `sessionboard-eval-kit`
- CLI: `sbek`
- Hosted Cicero target: <https://cicero-three.vercel.app>
- Seeded organizer: `organizer@example.com`

Verify the hosted URL against the root README before every run. The harness mutates its target as it
creates proposals, reviews them, accepts sessions, builds an agenda, and publishes widgets; do not
point it at production data anyone cares about.

The required rubric has 18 scenarios across six areas. Speaker CRM adds two optional scenarios and
is enabled by `includeOptional` in `evalconfig.json` or `--include-optional` on the CLI.

## Why this handoff had to be restored

The first evaluator pointer lived in `docs/handoff/work-loop.md`, added by commit `bad9bed` for an
unattended deadline-night session. Commit `2f28e86` removed that entire handoff because its machine,
Cloudflare deployment URL, deadline instructions, direct-to-`main` pushes, and overnight runner were
obsolete. Removing the stale runner was correct; removing the only discoverable evaluator pointer
with it was not. This file restores the durable evaluator contract without reviving those obsolete
operating instructions.

## Set up an isolated evaluator checkout

Keep the evaluator outside this repository and outside any active Cicero worktree. The evaluator is
a `pnpm` project even though Cicero itself uses Bun.

```bash
git clone https://github.com/mkly/killmysaas-evals-coding-agent.git sessionboard-eval-kit
cd sessionboard-eval-kit
pnpm install
pnpm run typecheck
pnpm run smoke
cp evalconfig.example.json evalconfig.json
```

Set `url` in `evalconfig.json` to the hosted target. Keep `areas` empty for all required areas and
leave `includeOptional` false for the required baseline. `submissionNotes` should name the seeded
organizer and explain that the hosted demo exposes on-screen magic links for reserved demo
addresses, so harness mode needs neither an Anthropic key nor a real inbox.

Do not commit `evalconfig.json`, saved auth state, run artifacts, or credentials to Cicero.

## Run the no-key harness path

Read the evaluator's `AGENTS.md` and both skills in full before starting:

- `.agents/skills/sbek-browse/SKILL.md`
- `.agents/skills/sbek-judge/SKILL.md`

Create the run:

```bash
pnpm run sbek -- plan --url https://cicero-three.vercel.app
```

The command creates `runs/<timestamp>/`, records it in `.sbek-current-run`, and prints the scenario
checklist. Register the evaluator's MCP server over stdio from the evaluator checkout:

```text
command: pnpm
args:    ["--silent", "exec", "tsx", "src/mcp.ts"]
```

For every unfinished scenario:

1. Call `start_scenario` with its scenario id and follow the returned brief as the source of truth.
2. Drive the hosted product with `snapshot`, `click`, `fill`, `select`, `press`, `scroll`, `drag`,
   and `upload` as needed.
3. Save screenshots at meaningful states and record factual findings with `observe`.
4. Finish with `done`, including an honest `completed`, `blocked`, or `feature_not_found` outcome.

Run browsing scenarios serially and in spec order. They intentionally share application state: CFP
submissions feed review, accepted submissions feed agenda construction, and the published agenda
feeds public widgets. The evaluator also has one shared `.sbek-current-run` pointer and no scenario
claim lock, so parallel browser workers can corrupt the run or race the product state.

Re-run `plan` to see remaining coverage. Resume an interrupted API-path run with the command printed
at the end of `run.log`; in harness mode, completed `evidence.json` files remain valid and only the
unfinished scenario should be rerun.

## Judge in fresh context, then score once

The browsing agent must not judge its own work. Start fresh judge sessions, optionally one per area,
after all browsing evidence is complete:

```bash
pnpm run sbek -- judge-brief --area call-for-papers
```

Read every selected screenshot and write the area judgement under
`runs/<timestamp>/judgements/`. Distinguish `not_found` (the product lacks it) from `cannot_judge`
(the evidence did not reach it). Judge areas may run in parallel because each writes a distinct
file; scoring must have exactly one writer:

```bash
pnpm run sbek -- score
```

The outputs are:

- `report.html` — human-readable report with evidence
- `report.json` — score, coverage, rubric verdicts, and defects
- `manual-checklist.md` / `manual-results.json` — email, calendar, and other human verification
- `<scenario-id>/evidence.json` and screenshots — the evidence record

Below 60% rubric coverage the kit correctly withholds the headline score. Do not describe an
unscored plan or partial run as 0% product completion, and do not claim 100% from Cicero's own test
suite. Fix product findings only after preserving the baseline report, then start a new run against
the updated deployment so the before/after comparison remains auditable.
