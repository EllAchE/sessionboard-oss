# Kill My SaaS submission draft: Cicero

> **Draft status:** form answers refreshed against `main` at `1017ca9` on 17 August 2026. The full
> source build, typecheck, and test suite pass; the hosted home page, public agenda, agenda API, and
> refreshed submission Worker return HTTP 200. The hosted application still predates the current
> `/organizer` and demo-first landing revision, so deploy it and repeat the private-browser organizer
> path before submitting.

This document collects the answers for the Kill My SaaS submission form. It complements the
[`short submission summary`](06-submission-summary.md) and
[`full submission narrative`](06-submission-narrative.md), which can become the public build post.

The opening narrative below is the lead of the submission: use it as the process overview answer
and as the opening of any public post. The philosophy and build journey are reproduced here in full
so the copy-ready answers never ship a summarized version of them.

## Philosophy

The title here might have been "Kill My SaaS", but I took it as an opportunity to "Improve My SaaS"; thinking from the ground up about how (without user input) I would expect a product like this to function and designing accordingly.

So what makes an interesting writeup here to me is the philosophy behind my product decisions, the experience/process of building and how that ultimately manifested in Cicero.

### Agent-first, portal-second

The future of all "SaaS" is agent-first. The way I want someone to use this product is by talking to an agent, not by opening a tab.
That is why the landing page leads with an agent quick start instead of a product tour, why the MCP server
is a first-class surface rather than an integration afterthought, and why the REST API is essential.

The portal still has a role under this model: visual review + power user features. Looking at an agenda, reading a proposal, checking what the public page actually renders. Those are judgments a person makes with their eyes, and summarizing them into text is a downgrade. Nearly everything else
— the reading, the reconciling, the drafting, the chasing — is work an agent should be doing on
someone's behalf, and the portal is where they go to confirm it looks right.

The portal complements what you can do with an agent and natural language queries of what you want.
The final form of this is an in-app agent, with that you basically have a full feature set all living within 1 space.
I did not implement the in-app agent because:

1. Was short on time
2. I did not wanna link tokens
3. You expose new attack vectors with a full-access agent

Also, the reality is an app like Session Board is unlikely to dominate your working time, even if you're an organizer. So if your day includes working with other tools as well, you're not going to necessarily want to open a distinct app for each task. A better pattern in that circumstance is to have a central tool like say the Claude or Codex GUI from which you issue requests to all of the different apps you need, in which case an MCP server and/or API is essential; you need them to make the best version possible of the product.

### Power users first

The person to design for is the one who performs an operation five hundred times, not the one who
performs it once. So each design decision gets measured the same way: what is this person spending
the most operations on, and can it be automated away so completely that they never touch it again?

Unfortunately I did not have a chance to actually speak with any users here so I had to make some
speculation about who that would be. But I will walk through 1 example that gives you an idea of
my thought process for this. That example is actually something that did not ship: automatic agenda recalculation (There is a draft PR for it).

The idea is this, as new events are added or moved we automatically recalculate the agenda. An organizer moves one session or a session is
added and the rest of the day settles around it — placements that still
work stay put, the ones that break get recomputed, and the organizer approves a result instead of
dragging fifteen cards behind the one they actually meant to move. To make this work you would have to add
projections in this case, topic metadata to optimize for allowing people with interest in a specific topic to see all speakers
covering that topic rather than booking them concurrently and other custom rules, Attendee, count projections, etcetera. 

Without speaking to users I do not know that it is worth building. It is my guess about where an organizer's hours go. The first
thing I would do with real users is find out whether recalculation saves the afternoon I think it
saves, or whether it solves a problem they have already routed around — or whether the manual drag
is where the judgment actually lives, in which case automating it away makes the product worse. I
owe reviewers and speakers the same conversation. I designed hardest for organizer repetition
because that is the loop I can see from here, not because I have evidence it is the expensive one.

The shipped version of this tenet is the keyboard/hotkey layer - I am a huge fan of the product at Linear
and how quickly I am able to navigate that space using their hotkeys. I believe more SaaS should incorporate
this for their power users. To me, the power users of Sessionboard are the reviewers and they should also
have keyboard first enablement to let them move more quickly when making changes in the app. The keyboard
enablement stops at the organizer workspace on purpose: a speaker visits twice a year and needs an obvious,
forgiving flow rather than a shortcut sheet. If reviewers working a large committee round, or speakers at
an event that keeps them busy, turn out to live in the tool the way an organizer does, the keyboard layer
should follow them there.

### Opinionated over flexible, and subtract before adding

Given the choice between one right answer and a setting that lets each operator pick, I ship the
answer. A configuration surface is a decision handed back to the user along with the obligation to
understand the tradeoff, and most of the time they would rather have the tradeoff made well. My
instinct on a maturing product is to remove features, not to add them.

This submission visibly violates that, and I would rather name it than have a reviewer find it:
Cicero is feature-rich, more so than I would build for a real first release. The breadth is
deliberate — it is how a submission demonstrates that a surface was considered rather than skipped —
but it is not the state I would want to be defending a year in.

So when I say I would talk to users, I do not mean collecting feature requests. I mean consolidating:
which two screens are one screen, which flow loses a click, which action sits furthest from where a
person lands and deserves a hot path straight to it. The work I am describing shrinks the product.

### The line all three sit behind

> Keep the human in control, but remove the clerical work that makes conference operations miserable.

Agent-first is not agent-autonomous. AI proposes review notes and agenda placements but does not
accept a talk or publish a schedule. Cicero drafts a targeted task reminder but does not silently
send it. External programme updates can be previewed and replayed idempotently before they are
applied. The product helps a person move faster without pretending it understands the political,
commercial, and interpersonal context that makes conference work difficult.

## The Journey & The Tools

I've spent a decent amount of time vibe coding so I've built up a good stable of tools, skills, tricks and process for shipping quickly. However still learned so much doing this. Here's my process and learnings. A TLDR first

- Establish an efficient working environment first
- Build eval loops and run them autonomously
- Figure out a way to codify "taste"

I started by creating a new cicero/sessionboard-oss repo, but I was still launching agents from the working directory of my primary codebase rather than from the new clone. The reasoning behind this was that I built a lot of tooling centered around that repo. It worked decently for a while, but ultimately I decided that the setup time was worth it for the performance benefits I would get from running everything from the root repo. From there, super smooth sailing. Takeaway - Establish an efficient working environment first

The next learning I need to give credit to the Smol team for. They built a great eval tool set that I was able to run to assess the coverage of my own product. I ran it multiple times and even attempted to set it to run overnight in a remote dev box one night. I saw massive massive value in codifying outcomes and giving a verification step. You move so much faster, because you can just let an agent keep trying and verifying until it reaches its goal.

I've laid this philosophy out before at String, but without going deeply into it, there's an order of magnitude greater efficiency that you can achieve with a well structured eval loop and when you're still directing each action/agentic session. Building for verification loops is the next paradigm in agentic coding; if you aren't already doing it you're falling behind the frontier. The trade off of letting an agent run like this is that your agent can drift quite far from the original requirements. The best way to mitigate that is strong verification, simplicity and tests.

The last point is less a learning and more an unsolved problem - in this project the biggest challenge came in the final stage, when I needed to incorporate taste. What that meant - baking in all the lifetime learnings I've had about good product design, good UI and good UX in a way that an agent could follow; not just in places where I saw bad design but app wide. I have yet to succeed in getting an agent to generalize good UX/UI/product design beyond any 1 place in which I call out a bad design decision. I have seen so many skills promise this but have yet to see one deliver on that promise. Would love to change that though!

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
> Current source also seeds the Cicero Forum at three comparable scales: `/demo-small` has 18
> submissions and eight speakers, the default `/demo` has 96 submissions and 45 speakers, and
> `/demo-large` has 384 submissions and 180 speakers. Those new fixtures await the next application
> deployment; they are useful for checking pagination, queue density, and agenda legibility locally.
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

Copy/paste the [`Philosophy`](#philosophy) and
[`The Journey & The Tools`](#the-journey--the-tools) sections above in full and unabridged. They
replace the older generated process answer; stop before **Form answers**.

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
> The final polish also makes scale and failure behavior inspectable: the same demo conference ships
> at small, medium, and large sizes; dense table cells truncate consistently; scores retain their
> visible scale; recording changes update in place; the acting user is resolved once per request;
> bad caller input or a database outage no longer collapses into an undifferentiated 500; and the
> landing page no longer repeats API, embed, and agent claims that its neighboring sections prove.
>
> The important omissions are explicit. The live Vercel demo is healthy but still on the older
> `/admin` and landing-page revision, so the new event-duplication, attendee-schedule, live-embed,
> Actions, and API-reference work is proven from current source rather than misrepresented as live.
> The standalone submission write-up has been refreshed and deployed separately. The maintained
> application Worker build is 3.42 MiB gzipped, about 14% over the free plan's 3 MiB limit, while the $5 paid plan
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

1. **The philosophy:** the [`Philosophy`](#philosophy) section above, reproduced in full rather than
   condensed — agent-first/portal-second, power users first, opinionated over flexible, and the line
   all three sit behind.
2. **The build journey:** [`The Journey & The Tools`](#the-journey--the-tools) above, reproduced in
   full — establish an efficient working environment, run autonomous eval loops, and keep
   working on how to codify product taste.
3. **The thesis:** replace the conference-programme workflow, not every screen in a mature SaaS.
4. **The spine:** CFP → speaker portal → review → agenda → communications → public programme.
5. **The product calls:** outstanding-task dashboard, no passwords, safe event duplication, private
   draft previews, speaker availability/conflicts, attendee schedules, and stable calendar updates.
6. **What failed honestly:** agent drift, parallel-work collisions, docs/deployment drift, the
   Workers free-tier ceiling, and outbound-email configuration.
7. **What shipped:** a seeded app, Docker self-host, 1,983 tests, public/embedded/portable programme
   output, API/OpenAPI/MCP, and explicit deployment gaps.

Use [`06-submission-narrative.md`](06-submission-narrative.md) as the source for that post rather
than expanding the form copy into a second competing architecture document. The narrative in turn
draws on [`decisions-long-form.md`](decisions-long-form.md) for the deeper design record.

## Before submitting

- [x] Recheck the live home page, public agenda, agenda API, and submission Worker.
- [x] Deploy the refreshed submission Worker and repeat its public evidence checklist.
- [ ] Deploy current application `main` and repeat the authenticated demo evidence checklist.
- [ ] Verify organizer sign-in once more in a fresh/private browser after that deploy.
- [ ] Confirm the shared demo has not been left in a confusing mutated state.
- [ ] Capture subscription receipts if requesting reimbursement.
- [ ] Decide whether to list `codex-auto-review` as “Other” or use the nearest form option.
- [ ] Copy answers into the form and save a screenshot/PDF of the submitted response.
