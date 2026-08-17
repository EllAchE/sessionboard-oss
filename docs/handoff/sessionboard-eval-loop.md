# Approval-gated Sessionboard evaluation cycle

This is the safe replacement for the deleted deadline-night loop. It gives an unattended agent
enough room to finish useful work while the operator is away without turning a mutating hosted
evaluation into an endless timer.

One explicit approval authorizes one cycle. A cycle may resume or complete one existing `sbek` run,
judge it independently, preserve its baseline, remediate its findings, and deploy when the approval
includes deployment. It does **not** authorize creating another run. Silence is not approval.

## Cycle state

```text
approved run -> browse serially -> judge fresh -> score -> archive baseline
                                                        |
                                                        v
                                           fix / verify / deploy
                                                        |
                                                        v
                                              CHECK IN AND STOP
                                                        |
                                               explicit approval
                                                        |
                                                        v
                                                 next sbek plan
```

Reopening an unfinished scenario or checking the current plan does not cross the gate. Creating a
new timestamped run directory does.

## Approved cycle record

The current cycle, recorded per step 1 below. Supersede this section when the operator approves the
next one; do not accumulate a log here, because a stale entry reads as a live authorization.

| Field | Value |
|---|---|
| Approved | 2026-08-17, explicit operator request, attended |
| Run | `runs/2026-08-17T05-46-05` |
| Target | <https://cicero-three.vercel.app> |
| Scope | the 18 required scenarios **and** the 2 optional Speaker CRM scenarios |
| Evaluator ref | `d8fafa4` — the same ref that produced both preserved baselines |
| Product ref at plan time | `1017ca9` |
| Authority | score, archive the baseline, remediate, and open PRs |
| **Withheld** | merging, deploying, and hosted configuration changes |

`ANTHROPIC_API_KEY` stays unset by operator decision, so ABS-14 is expected to score `cannot_judge`
again and coverage is expected to cap near 98%. That is the documented outcome in
[`sessionboard-eval-remediation.md`](sessionboard-eval-remediation.md), not a new finding — judge it
as that file directs rather than as a product gap.

Because merges are not authorized in this cycle, fixes land as open PRs and the hosted target keeps
serving whatever `main` deploys on its own. Record the product ref again when the run finishes: the
repository moves fast enough that the scored deployment will not be the ref above.

## 1. Establish the approved scope

Record the operator's approval in the session handoff before touching the hosted fixture. State:

- the exact target URL and seeded event;
- whether the cycle covers the 18 required scenarios, the two optional Speaker CRM scenarios, or
  both;
- whether product fixes, PR merges, deployment, and fixture writes are authorized;
- the evaluator and product revisions when known.

If a run is already in progress, preserve completed `evidence.json` files and continue it. Do not
replace it merely to obtain a clean run id.

## 2. Browse, judge, and score once

Follow [`sessionboard-eval.md`](sessionboard-eval.md). Browse scenarios serially and in spec order.
Do not let the browsing agent judge its own evidence. Judge areas in fresh contexts, with one
writer per area, then run the score command exactly once.

The optional CRM scenarios may be scored separately after the required run, but they belong in the
same operator-approved cycle when they were included in its scope.

## 3. Preserve the baseline before fixing anything

From the Cicero worktree, archive the scored report:

```bash
bun run eval:archive -- \
  --run /absolute/path/to/sessionboard-eval-kit/runs/<timestamp> \
  --evaluator-ref <evaluator-commit> \
  --product-ref <deployed-product-commit>
```

This writes an immutable, sanitized JSON summary under `docs/evals/sessionboard/`. It includes the
score, coverage, pending manual checks, area results, defects, run identity, revisions, and a SHA-256
digest of the source `report.json`. It deliberately excludes screenshots, scenario transcripts,
rubric reasoning, credentials, and saved browser state. Keep the raw run in the evaluator checkout
until the cycle has been reviewed.

If the raw report no longer exists, add a clearly marked recovered summary instead of fabricating
missing evidence. The recovered August 13 baseline is the example.

## 4. Remediate within the approved cycle

Rank findings by severity and weighted rubric impact. Work in dedicated Cicero worktrees and keep
one concern per PR. Use signed commits and the repository's CI gates. A hosted defect is not fixed
until the relevant code has landed, the authorized deployment has completed, and the affected route
has been checked on the deployed target.

Do not silently broaden authority. If the cycle approval did not include merging or deploying,
leave reviewed PRs ready and report that boundary at check-in. Do not start a new evaluation merely
to compensate for a deployment that has not happened.

Some findings cannot be closed by a PR — a hosted configuration gap, a fixture requirement, or a
judging instruction the next fresh context needs. Record those in
[`sessionboard-eval-remediation.md`](sessionboard-eval-remediation.md) so they survive the cycle,
and read that file before judging a repeat of an item listed there.

## 5. Check in, then stop

Before any new `sbek plan`, report:

- the archived baseline path, overall score, coverage, and manual-pending count;
- area scores and every critical or major defect;
- fixes and PRs produced, what merged, and what remains open;
- the deployed commit and live verification result, if deployment was authorized;
- the exact proposed next-run scope and the fixture mutations it will make.

End with a direct approval request for that next run. Until the operator explicitly approves it,
do not launch a fresh evaluator session, create a new run directory, or manufacture an approval
marker. If the operator is asleep or unavailable, this checkpoint is the successful end of the
overnight cycle—not a reason to rerun automatically.

## Copy-ready session handoff

```text
Run one approved Cicero Sessionboard evaluation cycle. Read AGENTS.md,
docs/handoff/sessionboard-eval.md, and docs/handoff/sessionboard-eval-loop.md completely. Preserve
the current run if one exists; browse serially, judge in fresh context, score once, and archive the
sanitized baseline before product changes. Remediate and deploy only within the authority in this
handoff. At the end, report the baseline, fixes, deployment, and proposed next scope, then stop and
wait for explicit approval before creating another sbek run. The overnight instruction is not
approval to retrigger the eval.
```
