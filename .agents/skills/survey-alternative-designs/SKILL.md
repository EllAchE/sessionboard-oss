---
name: survey-alternative-designs
description: Survey other entrants' Sessionboard clones, read their source, and fold each one into the comparative dataset under docs/alternatives/. Use when someone adds a repository to the survey, asks to refresh or rerun the alternative-designs analysis, asks what other teams shipped that Cicero did not, or asks to regenerate the feature matrix, the comparative requirements doc, or the visual grid.
---

# Survey alternative designs

Several teams solved one frozen brief without coordinating. That is a natural experiment, and the
output worth producing is the spread of structural choices — not a scoreboard.

The survey already exists. Adding a project is an incremental edit to a validated dataset, not a
fresh start. Read `docs/alternatives/README.md` and `docs/alternatives/discovery-log.md` before
anything else, so you know what has already been covered and which candidates were deliberately
skipped.

## Hard constraints — read before touching Discord

The Discord access path is a **selfbot using the user's own account token**, which violates
Discord's Terms of Service. The account at risk is the user's. These are not suggestions:

- **Use the alt account, never the main one.** Confirm which account you are acting as before any
  command — every invocation prints `Discord: acting as <name>` to stderr.
- **Read-only. Absolutely.** Never `send`, never join a server, never react, never DM.
- **Keep volume low.** Prefer `search` over paging `read`.
- **Stop on any 429.** Do not retry in a loop. Shrink the query and come back later, or stop.
- **Never paste the Discord token** into chat, a file, a commit, or an agent prompt.
- **Never reproduce another entrant's demo credentials** — not in notes, not in this repo, not in
  chat. If a README or message contains a login, do not copy it forward. Note only that a demo
  exists.

Never record demo credentials, tokens, API keys, or `.env` contents in any file, even redacted.

For public repositories, `git clone` and `gh repo view` are ordinary tooling and carry none of that
risk. Prefer them over Discord for anything obtainable from GitHub directly.

Work in a sibling worktree, never the primary checkout — see `AGENTS.md`. Clone the projects you
are analyzing into the session scratchpad, never into this repo or a sibling of it.

## The data contract

Two hand-maintained files are the only inputs. Everything else is generated.

| File | Hand-edited? | What it is |
|---|---|---|
| `docs/alternatives/data/projects.json` | yes | Every submission found, analyzed or not. The denominator. |
| `docs/alternatives/data/features.json` | yes | Baseline areas, beyond-the-brief features, Cicero capabilities. |
| `docs/alternatives/<slug>.md` | yes | Per-project prose note. One per analyzed project. |
| `docs/alternatives/data/survey.json` | **no** | Derived rollup. |
| `docs/alternatives/feature-matrix.md` | **no** | Derived 71×33 grid. |
| `docs/alternatives/visual/index.html` | **no** | Derived browsable grid. |
| `docs/07-comparative-requirements.md` | partly | Prose is hand-written; `<!-- generated:NAME -->` blocks are not. |

Structured truth lives in JSON, prose lives in markdown, and the two are cross-checked. Do not try
to parse the notes to recover the data — an earlier attempt did, and the notes turned out to carry
two incompatible authoring formats. Update the JSON and the note together.

`bun run alternatives:build` regenerates every derived file. `bun run alternatives:check` fails if
any is stale — run it before opening a PR.

## Phase 1 — find the project

Record every candidate with where you found it, in `docs/alternatives/discovery-log.md`. If the
user handed you a repo URL, that is the whole of this phase.

```bash
bun skills/discord/scripts/discord.ts whoami        # confirm the acting account FIRST
bun skills/discord/scripts/discord.ts search <guild> github.com repo submission demo deployed
```

Discord matches whole tokens, not substrings, so the keyword list *is* the recall ceiling —
`deploy` will not find `deployed`. `--json` carries `permalink`, `channel`, and `author_id`.

A submission that is deployed but has no public source still belongs in `projects.json`, with
status `no-public-source` and a `reason`. Do not fetch or probe the deployment — this survey reads
code. An honest denominator matters more than a big numerator.

## Phase 2 — read the source

```bash
git clone --depth 50 <url> "$SCRATCHPAD/alternatives/<owner>-<repo>"
```

Answer these **from the code**, not from the README. A README saying "full conflict detection" is a
claim, not a fact.

- **Stack** — language, framework, datastore, data access, hosting, auth.
- **Scale** — lines, files, commits, authors, first and last commit date. If `git rev-parse
  --is-shallow-repository` says true, the commit count is a floor: set `commitsAreLowerBound`.
- **Coverage of the 15 baseline areas** — the `id`s in `features.json`. Cite the file or symbol that
  proves each one.
- **Structural choices worth recording** — where domain logic lives, one table or several, form
  engine or hardcoded forms, AI advisory or decisive.
- **What they shipped that Cicero did not.** This is the headline output. Be specific and concrete.
- **What Cicero shipped that they did not.** Equally interesting; do not skip it.

Coverage vocabulary, used consistently:

| Value | Symbol | Means |
|---|---|---|
| `full` | ✓ | The capability works end to end in source. |
| `partial` | ~ | Real but incomplete — schema with no queries, UI with no server action. |
| `absent` | ✗ | Looked for it, did not find it. |
| `unknown` | ? | Could not determine. |

Describe, do not grade. These are other people's hackathon-window projects; the notes stay factual
and neutral, and nothing here is a quality judgment.

## Phase 3 — write the note

One file per project at `docs/alternatives/<slug>.md`, where `<slug>` is `<owner>-<repo>`. Follow
the shape of `docs/alternatives/M31-Labs-rostrum.md` exactly:

```
# owner/repo

**Source:** <url> · **Live:** <url>
**Found via:** <where>
**Analyzed:** <YYYY-MM-DD> at commit `<sha>`

## Stack
## Scale
## Feature coverage          (table: Area | Coverage | Code evidence)
## Structural choices worth recording
## Shipped that Cicero did not
## Cicero shipped that this did not
## Notes
```

The **Analyzed at commit** line is what makes a claim checkable later. Never omit it.

## Phase 4 — fold it into the dataset

1. **`projects.json`** — add the entry. `slug`, `project`, `status`, `source`, `live`, `foundVia`,
   `analyzedOn`, `commit`, `stack`, `stackProse`, `scale`, and `coverage` naming all 15 areas.
2. **`features.json`** — for each capability in the note's "Shipped that Cicero did not":
   - If it matches an existing `AD-n`, append the slug to that entry's `projects` and bump
     `convergence` to match. **Reuse before adding** — convergence is the whole signal, and a
     near-duplicate row silently splits it.
   - Only if genuinely new, append the next `AD-n` with a title, description, `tier`, `projects`,
     and `convergence`.
   - `tier` is a function of convergence. Re-sort the tiers if a capability crosses a boundary.
   - Recount `ciceroDifferentiators[].of` — it is the analyzed-project count and every entry moves
     when a project is added.
3. **Regenerate and verify:**

```bash
bun run alternatives:build
bun run lint && bun run typecheck && bun run test
```

`validate()` in `scripts/alternatives/survey.ts` enforces the invariants: unique slugs, a reason for
every non-analyzed project, a note on disk for every analyzed one and an entry for every note,
coverage naming exactly the 15 areas with valid values, `convergence === projects.length`, every
attributed slug resolving to an analyzed project, and `of` equal to the analyzed count. It fails
the build rather than warning. Fix the data, never the assertion.

Cross-check by hand once: the total attributions across all `AD-n` entries must equal the total
number of "Shipped that Cicero did not" bullets across all notes. That catches a capability recorded
in prose but never folded into the dataset.

## Reading the output honestly

Two asymmetries are real, are stated in the generated files, and must not be quietly dropped:

- **Attribution is positive-only.** A blank cell in the beyond-the-brief band means the capability
  was not recorded for that project — not that it was verified missing there. The rows were built by
  reading what each project *added*, not by checking all 48 against all 32.
- **Cicero capabilities are field-wide counts.** Only the entries carrying `derivedFromArea` have
  real per-project values; the rest render as unknown.

Convergence is the ranking signal, and the only one. A capability several teams reached
independently from the same brief is evidence the brief implies it. One team's clever idea is
evidence of nothing except that they thought of it.

## Finishing

Push the branch and open a PR; report the URL and review state. Remove only the worktree and branch
this session created — dirty state you find elsewhere belongs to another session, so surface it once
and leave it alone.
