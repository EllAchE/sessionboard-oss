# Kill My SaaS submission draft: Cicero

> **Draft status:** form answers refreshed against `main` at `d9231a4` on 17 August 2026. The full
> source build, typecheck, and test suite pass; the hosted home page, public agenda, agenda API, and
> submission Worker return HTTP 200. The hosted application still predates the current `/organizer`
> and demo-first landing revision, so deploy it and repeat the private-browser organizer path before
> submitting.

This document collects the answers for the Kill My SaaS submission form. It complements the
[`short submission summary`](06-submission-summary.md) and
[`full submission narrative`](06-submission-narrative.md), which can become the public build post.

## Form answers

### Email

The Google form records the signed-in address automatically; no separate text answer is needed.

### Project URL

<https://cicero-three.vercel.app>

Source: <https://github.com/EllAchE/sessionboard-oss>

Readable write-up: <https://cicero-submission.elehche.workers.dev/>

### Optional instructions for testing

Copy/paste answer:

> The site is deployed and seeded. For the organizer path, sign in as `organizer@example.com`. This
> is an IANA-reserved demo identity, so there is no inbox or password: the sign-in page returns a
> narrowly gated on-screen magic link. The organizer dashboard opens on accepted speakers with
> outstanding tasks. From there I suggest visiting the review queue, dragging a session on the agenda
> to see conflict warnings, opening a speaker and choosing **View portal as**, and checking the
> captured mail. The hosted revision still uses `/admin`; current source and the next deployment use
> `/organizer`.
>
> The public path needs no account: `/demo`, `/demo/agenda`, `/submit/demo/speak`,
> `/embed/demo/agenda`, and `/api/v1/events/demo/agenda` are all live. For a richer seeded programme,
> use `/first-settlement`, its agenda, speakers, itinerary, CFP, and embeds. The public agenda and
> API were rechecked on 17 August and returned five published sessions across three rooms.
>
> You can also enter your own email on the sign-in page. Cicero creates the account, emails a magic
> link, and takes you to an isolated new event. The hosted demo currently captures seeded-recipient
> email in its dev mailbox; see the omissions note below for the real-delivery boundary.

Useful direct links:

- [Organizer sign-in](https://cicero-three.vercel.app/signin?email=organizer%40example.com&next=/admin)
- [Captured demo mail](https://cicero-three.vercel.app/admin/mail)
- [Public demo](https://cicero-three.vercel.app/demo)
- [Public agenda](https://cicero-three.vercel.app/demo/agenda)
- [Open CFP](https://cicero-three.vercel.app/submit/demo/speak)
- [Agenda embed](https://cicero-three.vercel.app/embed/demo/agenda)
- [Public agenda API](https://cicero-three.vercel.app/api/v1/events/demo/agenda)
- [OpenAPI document](https://cicero-three.vercel.app/api/v1/openapi.json)
- [First Settlement demo](https://cicero-three.vercel.app/first-settlement)
- [Readable submission](https://cicero-submission.elehche.workers.dev/)
- [Source-verified field survey](https://cicero-field-survey.elehche.workers.dev/)

The full presenter path, fallbacks, and reset notes are in the
[`demo runbook`](04-demo-runbook.md).

### Coding agents used

Suggested grid selections:

| Activity | Primary answer | Note |
| --- | --- | --- |
| Planning | Claude Code | The requirements normalization, architecture, and parallel workstream plan were primarily Claude-driven. |
| Computer Use | Codex | Limited use; most verification was through the CLI and HTTP rather than literal GUI automation. Leave blank if the form permits. |
| Normal Coding | Claude Code | Primary implementation agent. |
| Review | Codex | Used as an independent review and audit pass, including automated review sessions. |
| Bugfixing | Codex | Primary late-stage repair and documentation-correction pass; Claude also fixed bounded issues. |
| Other | Claude Code | Parallel, worktree-isolated implementation and integration work. |

Copy/paste comments on agent choice/performance:

> Claude Code was the primary builder and Codex was the independent reviewer and late-stage repair
> system. Claude Code was particularly effective at turning a large, inconsistent brief into a
> requirements ledger, architecture, and parallel directory-owned workstreams, then carrying those
> contracts through a broad implementation. Codex was strongest as a second set of eyes: repo-wide
> audits, targeted fixes, deployment verification, PR cleanup, and catching places where the prose
> had moved ahead of the code or the live deployment.
>
> The main failure mode was coordination at this scale. Parallel agents could collide when work was
> not isolated, and a confident implementation or documentation claim still needed independent
> evidence. The workflow improved once every task used its own branch and worktree, the shared schema
> and service contracts were frozen, and review treated tests, current source, and the deployed app
> as separate things that all had to agree.

### Models used

Suggested grid selections:

| Activity | Primary answer | Note |
| --- | --- | --- |
| Planning | Claude Opus | Primary architecture and product-reasoning model. |
| Computer Use | GPT 5.6 Sol | Limited verification/tool-use work; leave blank if the form permits. |
| Normal Coding | Claude Opus | Primary implementation model; Claude Sonnet handled smaller bounded tasks. |
| Review | Other: Codex auto-review | This is the exact model label in 28 local Codex review sessions; do not relabel it as Sol without confirmation. |
| Bugfixing | GPT 5.6 Sol | Primary Codex model in the local project sessions; Terra appeared in a small minority. |
| Other | Claude Sonnet/Haiku | Claude Sonnet 5 was used for bounded parallel implementation and fixes. |

Copy/paste comments on model choice/performance:

> Claude Opus was the primary model for product planning and normal coding because the task rewarded
> long-context consistency across the brief, schema, service boundaries, UI, and documentation.
> Claude Sonnet was useful for smaller workstreams with a clear ownership boundary. GPT 5.6 Sol was
> the primary Codex model for independent review, debugging, and follow-up implementation, with a
> small amount of Terra use and a separate Codex auto-review model for review passes.
>
> Opus was strongest at maintaining the overall product and architecture narrative while building a
> wide surface quickly. Sol was a useful counterweight: it was effective at source-backed audits,
> finding contradictions, and driving focused repairs. Both still benefited from explicit scopes,
> frozen interfaces, tests, and live checks. Long-running agent loops also produced extremely high
> cached-context counts, so raw token totals need to distinguish cache reads from newly processed
> input.

Commit metadata at the current baseline provides a second, deliberately limited signal: parseable
`Co-Authored-By` trailers include 101 Claude Opus 5 entries and one Claude Sonnet 5 entry. Codex work
is usually described in commit subjects/bodies or lives in review sessions rather than co-author
trailers, so commit metadata supports the primary-builder answer but is not an authorship ledger.

### Estimated spend or token usage

The quantitative answer below is the last recoverable cross-agent snapshot, not an end-of-project
counter. It is explicitly dated and was not recomputed during this documentation refresh because no
repository-backed historical token-audit workflow was available. Recompute it before pasting if the
form requires a final total; otherwise keep the timestamp and caveat intact.

Copy/paste answer:

> I used subscription-backed Claude Code and Codex rather than tracking this as direct API spend.
> In a snapshot taken at 2026-08-16 12:29 EDT, the project-scoped local transcripts account for
> approximately **581.5 million raw tokens**. Most of that number is repeated or cached context:
> **555.5M cached-input reads**, approximately **23.1M non-cached/cache-write input tokens**, and
> **2.86M output tokens**.
>
> Claude Code accounts for about **344.4M** transcript tokens: 328.5M cache reads, 13.8M cache
> creation, 38K ordinary input, and 2.06M output across 67 root/subagent transcript files. Codex
> accounts for about **237.1M** tokens: 227.0M cached input, 9.30M non-cached input, and 796K output
> across 56 project-linked sessions. Codex reasoning output was about 290K tokens and is already
> included in its output/total rather than added twice.
>
> Financially, the cost basis was **two existing subscriptions: Claude Code and Codex Pro**. I did
> not add or upgrade any subscription for this project, so the net-new project spend was **$0**. The
> local transcript totals are a best-effort project attribution, not a provider invoice; sessions
> launched from an unrelated working directory could be missed, and subscription usage does not
> translate cleanly to equivalent API cost.

Recovered local-usage detail:

| Source | Files/sessions counted | Input/cache detail | Output | Raw total |
| --- | ---: | ---: | ---: | ---: |
| Claude Code | 67 transcript files | 328,475,744 cache read + 13,807,533 cache creation + 37,689 ordinary input | 2,063,864 | 344,384,830 |
| Codex | 56 project-linked sessions | 226,995,712 cached + 9,300,976 non-cached input | 795,927 | 237,092,615 |
| **Combined** | — | **555,471,456 cached reads + 23,146,198 new/cache-write input** | **2,859,791** | **581,477,445** |

Model evidence in those logs:

- Claude transcripts: 36 include `claude-opus-5`, 27 include `claude-sonnet-5`, one includes
  `claude-opus-4-8`, and three are synthetic/system transcripts.
- Codex model appearances: 26 `gpt-5.6-sol`, 4 `gpt-5.6-terra`, and 30 `codex-auto-review` across
  56 sessions. A session can change models, so model appearances are not mutually exclusive.
- Codex logs identify the plan as `pro`. The Claude billing tier is not recoverable from the
  transcript metadata and must be confirmed from the billing receipt.

#### Suggested proof-of-usage upload

If requesting reimbursement, upload one PDF or image containing:

1. the Claude subscription receipt or billing page, including plan, date, and amount;
2. the OpenAI/Codex subscription receipt or billing page, including plan, date, and amount; and
3. optionally, a screenshot of the redacted aggregate table above.

Do not upload raw session JSONL files: they contain prompts, filesystem paths, tool calls, and other
unnecessary private context.

### Process overview

Copy/paste answer:

> I began by converting the brief and screenshots into a tagged requirements ledger instead of
> coding directly from an inconsistent prose document. I separated required, important, optional,
> excluded, and competition-bonus items, then used a separate Sessionboard product survey only as a
> coverage check. That produced one end-to-end spine: organizer creates an event and CFP; a cold
> speaker submits; reviewers score; the organizer decides and schedules; speakers finish profiles
> and deliverables; communications and calendar updates go out; outstanding work is visible; and the
> public programme is published as pages, embeds, and an API.
>
> I designed the shared kernel next: event-scoped Postgres schema, Zod/service contracts, magic-link
> authentication, storage and mail interfaces, and the design system. Those boundaries were frozen
> before parallel implementation. Work was divided by directory into forms, speaker portal, review,
> agenda, communications, publishing/dashboard, integrations/API, deployment/demo, and AI features,
> with each task isolated in its own worktree and branch.
>
> Verification was iterative rather than a final ceremony. I used focused unit and integration
> tests, a requirements audit, adversarial/security passes, generated OpenAPI/MCP contracts, seeded
> demos, live HTTP checks, performance measurements, and a presenter runbook. The current tree's
> automated suite passes 1,927 tests across 179 files and carries two squashed SQL migrations.
> Later passes corrected authentication leaks, scoping mistakes, configuration drift, incomplete
> requirements, and claims that no longer matched production.
>
> Cloudflare Workers was intentionally reversible. When the built Worker measured 3.42 MiB gzipped
> against the free plan's 3 MiB ceiling, I moved the hosted demo to Vercel rather than pay for a mild
> competition bonus. The Worker/Hyperdrive deployment path remains maintained, and the same app also
> runs through Docker Compose with Postgres and MinIO. That fallback let deployment fail without
> forcing an application rewrite.

### Notable additions or omissions

Copy/paste answer:

> The feature I would lead with is the outstanding-speaker-task dashboard. Sessionboard's own FAQ
> says it lacks a central completion report, so Cicero opens on the operational question organizers
> actually have: who still owes what? Other deliberate additions include safe whole-event
> duplication without people or credentials; speaker availability and double-booking detection;
> time-limited draft-programme share links; restorable content revisions; attendee agenda starring
> and a browser-local itinerary; seven embeds with JSON, XML, and subscribable calendar output;
> calendar invites with stable UIDs and sequence bumps; a cross-event speaker CRM;
> sponsor/exhibitor and recording publication; readable OpenAPI/Scalar references, an event-scoped
> MCP server, signed webhooks, role-scoped agent workflows, and one-command self-hosting. Airtable is
> a one-way mirror rather than the source of truth so it cannot weaken transactions or agenda
> conflict detection.
>
> The important omissions are explicit. The live Vercel demo is healthy but still on the older
> `/admin` and landing-page revision, so the new event-duplication, attendee-schedule, live-embed,
> Actions, and API-reference work is proven from current source rather than misrepresented as live.
> The maintained
> Worker build is 3.42 MiB gzipped, about 14% over the free plan's 3 MiB limit, while the $5 paid plan
> would fit it without code changes. Real outbound email is implemented through Resend and SMTP but
> is not configured on the hosted demo because there is no verified sender domain/key; seeded mail
> is captured at `/admin/mail`, and calendar files are generated and downloadable, but provider
> delivery is not being claimed. The verified live Accelevents surface supports speaker create/list;
> full programme reconciliation is demonstrated deterministically against an Accelevents-shaped
> fixture, not misrepresented as verified live API coverage. I also did not mirror the repo to Forge,
> and I am not claiming the speed bonus: the documented pre-cache-fix public-page benchmark was above
> the Workers free CPU budget and has not been re-measured on Linux after the fix. The R2 and Twilio
> paths are implemented and tested but have not been exercised against paid production accounts; the
> hosted demo uses Postgres file storage and the log SMS transport.
>
> I consciously excluded the event-team permission matrix, payments/fees, and AI-generated custom
> dashboards because the brief excluded them. Token receipts and a real Accelevents end-to-end run
> remain external evidence tasks rather than missing product code.

### Contact socials/email

Same as the email recorded automatically by the Google response.

X: [@myhandleisbest](https://x.com/myhandleisbest)

### Interest in full-time opportunities at AIE

Select **“Yes, please contact me.”** My preference is a potentially part-time role, and I would be
happy to discuss what that could look like.

## Short public-post outline

The form answers can become a public post with this shorter structure:

1. **The thesis:** replace the conference-programme workflow, not every screen in a mature SaaS.
2. **The spine:** CFP → speaker portal → review → agenda → communications → public programme.
3. **The product calls:** outstanding-task dashboard, no passwords, safe event duplication, private
   draft previews, speaker availability/conflicts, attendee schedules, and stable calendar updates.
4. **How it was built:** freeze the kernel, divide work by directory, run Claude Code as the primary
   builder and Codex as the independent reviewer.
5. **What failed honestly:** parallel-work collisions, docs/deployment drift, the Workers free-tier
   ceiling, and outbound-email configuration.
6. **What shipped:** a seeded app, Docker self-host, 1,927 tests, public/embedded/portable programme
   output, API/OpenAPI/MCP, and explicit deployment gaps.

Use [`06-submission-narrative.md`](06-submission-narrative.md) as the source for that post rather
than expanding the form copy into a second competing architecture document. The narrative in turn
draws on [`decisions-long-form.md`](decisions-long-form.md) for the deeper design record.

## Before submitting

- [x] Recheck the live home page, public agenda, agenda API, and submission Worker.
- [ ] Deploy current `main` and the refreshed submission Worker, then repeat the evidence checklist.
- [ ] Verify organizer sign-in once more in a fresh/private browser after that deploy.
- [ ] Confirm the shared demo has not been left in a confusing mutated state.
- [ ] Capture subscription receipts if requesting reimbursement.
- [ ] Decide whether to list `codex-auto-review` as “Other” or use the nearest form option.
- [ ] Copy answers into the form and save a screenshot/PDF of the submitted response.
