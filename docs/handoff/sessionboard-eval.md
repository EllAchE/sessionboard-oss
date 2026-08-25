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

Do not commit `evalconfig.json`, saved auth state, raw evidence, screenshots, or credentials to
Cicero. The sanitized scored summary is the exception: preserve it under
`docs/evals/sessionboard/` with `bun run eval:archive` before starting remediation.

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
4. Declare every substitution before finishing. The evaluator's browse skill tells you to continue
   with whatever data exists when the brief's sample data does not match the app, so runs can end up
   exercising Cicero's seeded demo entities instead of the data the brief specifies — legitimately,
   but never silently. Whenever a scenario proceeds against a seeded entity in place of the brief's
   sample data, or in place of an entity an upstream scenario was supposed to create, record an
   `observe` note naming what the brief specified, what was actually used, and why.
5. Finish with `done`, including an honest `completed`, `blocked`, or `feature_not_found` outcome.
   A `completed` scenario that ran on substituted data must restate the substitution in its
   summary; an undeclared substitution leaves the evidence ambiguous, so the scenario is not
   honestly complete without it.

Run browsing scenarios serially and in spec order. They intentionally share application state: CFP
submissions feed review, accepted submissions feed agenda construction, and the published agenda
feeds public widgets. That chain is why substitutions must be declared per scenario: a screenshot of
a seeded session in the agenda scenario looks identical to one the CFP→review→accept chain produced,
and only the declaration tells a judge which data path the evidence actually proves. The evaluator
also has one shared `.sbek-current-run` pointer and no scenario claim lock, so parallel browser
workers can corrupt the run or race the product state.

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
(the evidence did not reach it). Browsing agents are required to declare, in `observe` notes and
`done` summaries, any scenario that ran against seeded demo entities instead of the brief's sample
data or an upstream scenario's output — those declarations reach you through the rendered evidence,
so read them before crediting a scenario, and state in the judgement when a verdict rests on a
seeded stand-in rather than the scenario's own data path. Evidence showing seeded entities with no
declared substitution is ambiguous: flag it as an evidence defect rather than crediting the flow.
Judge areas may run in parallel because each writes a distinct
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

Starting that new run is a separate approval boundary. Follow
[`sessionboard-eval-loop.md`](sessionboard-eval-loop.md): finish the approved cycle, check in with
the preserved score and the changes made, and wait for an explicit response before creating the
next run.
