# Sessionboard evaluation remediation notes

Findings that outlive a single cycle live here. A finding belongs in this file when the next
evaluation run would hit it again and the fix is not a code change a PR can carry — a hosted
configuration gap, a fixture requirement, or a judging instruction that needs to survive into a
fresh context.

Rank and fix code defects the normal way; see step 4 of
[`sessionboard-eval-loop.md`](sessionboard-eval-loop.md). Entries here are the residue: what an
operator has to do outside the repository before the next `sbek` run can score the item at all.

## ABS-14 — AI review scored `cannot_judge` because the hosted deployment has no model key

Baseline: `docs/evals/sessionboard/2026-08-16T20-25-39.json` (overall 84.6%, coverage 98.3%).
ABS-14 is the only item in that run that cost coverage rather than score; it is the entire
difference between 98.3% and 100%.

The judge's reasoning was that the app claims AI-assisted review and displayed a clearly separated
rule-based heuristic instead, because no hosted model key was configured, so the evidence could not
show whether the configured evaluator produces the required numeric score and rationale or exposes
a persistent human override.

**This is a deployment configuration gap, not a product gap.** Every capability the rubric asks for
is implemented:

- `generateAiReview` in `lib/ai/review.ts` sends the scorecard and submission to the Messages API and
  requires per-criterion numeric scores plus a 2–4 sentence markdown rationale. The result is
  persisted by `saveAiReview` in `lib/services/review.ts` into the `ai_review` table
  (`db/schema.ts`), which stores `model`, `rationale_markdown`, and `criterion_scores`.
- The results view separates the two. `ReviewDetail.tsx` renders the AI opinion in its own card
  behind a `Sparkles` "AI suggestion" label with the model name and timestamp, distinct from "Your
  scorecard" and the human "Aggregate" card, and `SubmissionQueue.tsx` marks rows that have one.
  `ai_review` is never read by the human score averages, by construction.
- An organizer overrides the AI by copying its values into their own scorecard and editing them.
  The human values persist to the `score` table through `saveScorecardAction` and survive reload,
  while the `ai_review` row keeps the AI's original numbers, so the two stay distinguishable.

### What an operator must set

One variable, on the Vercel project behind `https://cicero-three.vercel.app`:

```text
ANTHROPIC_API_KEY
```

`lib/env.ts` reads it through `env()` and exposes it as `features.ai()`; `lib/ai/notice.ts` names
it in the UI when it is missing. Nothing else is required — there is no model, region, or endpoint
setting to accompany it. It is absent from every env file in this repository and from `vercel.json`,
and the heuristic fallback the judge observed on the deployed site is the evidence that it is unset
in production.

Setting it is safe. The AI opinion is advisory by construction: it writes only to `ai_review`, never
to `submission.status` or to any human score, and prompts wrap speaker input in delimiters and warn
the model that the content is untrusted. Removing the variable later restores the heuristic path
rather than breaking the route.

Cost is negligible. `AI_REVIEW_MODEL` is `claude-sonnet-5` at $3.00/MTok input and $15.00/MTok
output, currently discounted to $2.00/$10.00 through 2026-08-31. Each review sends an
abstract-sized prompt under a `max_tokens: 1500` cap, so a full evaluation cycle's worth of reviews
costs well under a dollar.

### Read this before concluding the feature is broken

`claude-sonnet-5` runs adaptive thinking by default when the request omits `thinking`, and
`max_tokens` caps thinking and response text together. The call in `lib/ai/review.ts` passes
`max_tokens: 1500` with no `thinking` field, so a long thinking pass can consume the budget and
truncate the JSON body. The failure is graceful — the parse fails and the action surfaces "The AI
reviewer returned an unusable response. Try again." — but it looks like a broken feature to whoever
sets the key first.

If that happens on the first run after enabling the key, it is a real defect to fix in product code:
raise `max_tokens`, or pass `thinking: { type: 'disabled' }`. Do not conclude ABS-14 is a product
gap without checking which of the two failures you are looking at.

### Judging ABS-14 next cycle

With the key set, the item is scorable end to end from the organizer submission detail route:
generate a review, confirm the numeric per-criterion values and rationale are attributed to the
model rather than to a reviewer, copy them into a scorecard, change one value, save, and reload.
If the key is still unset, the correct verdict remains `cannot_judge` — the heuristic fallback names
the missing variable and calls itself a completeness check, so it does not mislead a user into
thinking it is the model, and its presence is not a product defect.
