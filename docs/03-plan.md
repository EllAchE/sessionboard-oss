# Delivery plan

Scope, sequencing and verification. [`00-goals.md`](00-goals.md) says what we are building,
[`01-requirements.md`](01-requirements.md) enumerates it, [`02-architecture.md`](02-architecture.md)
says how it is built. This file says in what order, by whom, and how we know it works.

The deadline — **Wednesday, August 12, 22:00 PT** — governs sequencing. The brief's tiebreaker,
whichever entrant made the product judgment calls the team would actually want to use and buy,
governs everything else.

## 1. The spine that must work end to end

Coverage of this beats depth anywhere. A judge hitting a dead end mid-walkthrough is the only
failure mode that matters, and `D-3` requires that judge to work from a cold start with nothing
seeded for them.

```
organizer configures event
  → builds a call-for-speakers form
  → publishes it at a public URL
  → speaker submits cold, account created in the flow
  → speaker lands in portal: bio, headshot, slides
  → organizer scores + accepts
  → accepted session dragged onto the schedule
  → speaker gets templated email + a real calendar invite
  → organizer watches who still owes a task
  → agenda + speaker gallery embed back onto the event website
```

Anything that is not on this line is negotiable. Anything on it is not.

## 2. Scope — the optional and bonus rows ship

The optional and bonus rows are in, tiered by cost. **Tier order is also cut order**: if the clock
forces a decision we cut from Tier 3 upward, and we say so out loud rather than silently dropping a
row and hoping nobody diffs it against the requirements.

### Tier 1 — cheap once the core exists (≤45 min each), folded into their owning workstream

`E-6` multi-event and switcher · `F-13` per-submitter limit · `F-14` multiple drafts ·
`F-15` combined character limits with a live counter · `F-16` admin notification email ·
`S-19` portal-form confirmation email · `S-20` copy tasks from a previous event ·
`V-10` bulk session import · `V-11` bulk file download · `V-12` reviewer workload report ·
`A-9` month view, CEU credits, client ID · `B-6` submission pacing · `B-7` per-form and per-track
breakdowns · `B-8` reports · `G-5` copyable snippet · `G-6` embed admin surface ·
`G-7` per-embed filters and style · `G-8` deep-link by speaker · `C-7` per-task reminder cadence ·
`D-5` token-spend receipts

These are cheap only *because* they sit inside a workstream that already built the surrounding
machinery. Pulled out and scheduled separately they would each cost multiples of the estimate, which
is why none of them has its own owner.

### Tier 2 — 1–3h each, own owner

`E-5` personas and custom field library · `S-11` portal branding · `C-6` branded email themes ·
`V-9` **AI-assisted review** — scores against the scorecard criteria and writes a rationale, never
auto-decides · `A-8` **AI agenda builder** — proposes a conflict-free placement of the unscheduled
queue, which the organizer accepts or edits; the brief asks only to "cover the basics" here ·
`B-4` five prebuilt dashboards · `Z-2` **Airtable** · `Z-3` **Forge mirror**

Both AI rows are advisory by construction. An AI that silently decided an acceptance or committed a
schedule would be a worse product than one that does not, and would be indefensible to a judge who
found it after the fact.

### Tier 3 — expensive, built last

`S-12` multiple portal types · `S-13` group portal access sharing · `B-5` custom dashboard builder
with add-widget · `N-1c` live Accelevents run — credential-dependent, and possibly impossible

### Two rows recommended against

`E-7` exhibitor and sponsor entities, and `N-2` other integrations. The requirements doc marks both
as visible in Sessionboard but never requested by the brief. They score nothing on any judging axis
and each costs 2–3 hours that Tier 2 uses better.

This is a recommendation, not a decision — it needs an explicit call to settle either way.
Everything else on the optional list is in.

### On Airtable (`Z-2`), a judgment call worth stating

The brief gives Airtable a full bonus while Cloudflare gets only a "mild" one, so on the scoring
Airtable is worth more. But Airtable as the *primary store* would make a genuinely bad product: no
transactions, no joins, five requests per second, and the conflict detection in `A-2` becomes
unimplementable.

So we ship it as a **one-way mirror**. Submissions, speakers and the agenda push to a configurable
Airtable base on write, with a "sync now" backfill. Their team gets Airtable views over live data,
and we do not cripple the product to claim a bonus. That trade is exactly the kind of call the
brief's tiebreaker rewards, so it goes in the README explicitly rather than being discovered in the
source.

## 3. Workstreams

**W0 blocks everything.** Two tracks run concurrently because they share no files, then both freeze.

### W0 · Foundation (~2.5h)

- **W0a · Design language** — a *separate session* on branch `design-system`, driven entirely by
  [`handoff/design-system.md`](handoff/design-system.md). It scaffolds nothing but its own surface:
  `app/tokens.css`, the `@font-face` wiring, and all 21 components in `components/ui/`. It needs no
  knowledge of conference software, which is exactly why it parallelizes cleanly with W0b.
- **W0b · Contracts and the Cloudflare spike** — in order: the 45-minute Workers/Hyperdrive spike
  ([`02-architecture.md`](02-architecture.md) §1) · Next 15 scaffold, `wrangler.jsonc`,
  `open-next.config.ts` · `db/schema.ts` complete · `lib/services/*` signatures and Zod schemas with
  `throw new Error('TODO')` bodies · `lib/auth.ts` for magic link, session and impersonation ·
  `lib/storage/` and `lib/mail/` interfaces · route shells · `docker-compose.yml` · README
  quickstart · seed skeleton.

**Then both freeze.** `db/schema.ts`, the service signatures and `components/ui/` become read-only
for feature workstreams; changes route through W0's owner. This is the single rule that keeps
concurrent agents from colliding, and it is worth more than any amount of coordination after the
fact — a schema change at hour eight invalidates work in five directories at once.

### Then, in parallel — disjoint directory ownership

| | Workstream | Owns | Requirements |
| --- | --- | --- | --- |
| W1 | Form engine + public CFP | `app/(public)/submit/**`, `app/admin/forms/**`, `lib/services/forms.ts` | `F-*`, `P-*` |
| W2 | Speaker portal, tasks, files, wiki | `app/portal/**`, `lib/services/{tasks,files,portal}.ts` | `S-*` |
| W3 | Review, scoring, rounds | `app/admin/submissions/**`, `lib/services/review.ts` | `V-*` |
| W4 | Agenda + conflict detection | `app/admin/agenda/**`, `lib/services/schedule.ts` | `A-*` |
| W5 | Comms + calendar | `app/admin/comms/**`, `lib/mail/**`, `lib/ics.ts` | `C-*` |
| W6 | Embeds, public pages, dashboard | `app/embed/**`, `app/(public)/**`, `app/admin/page.tsx` | `G-*`, `B-*` |
| W7 | Accelevents + Airtable + public API | `lib/accelevents/**`, `lib/airtable/**`, `app/api/v1/**` | `N-*`, `Z-2`, `Z-5` |
| W8 | Deploy, seed, docs, demo | `wrangler.jsonc`, `docker-compose.yml`, `db/seed.ts`, `README.md` | `T-*`, `D-*`, `Z-1`, `Z-3` |
| W9 | AI review + AI agenda | `lib/ai/**`, mounted into W3 and W4 surfaces | `V-9`, `A-8` |

Ownership is by directory, not by feature, because a directory is checkable and a feature is not.
W5, W7 and W9 are the cleanest splits — they touch almost nothing outside their own tree, so the
calendar and integration backends can proceed without waiting on core UI at all.

Each workstream gets its own worktree and branch, merging to `main` roughly every two hours. No PR
review ceremony: this is a competition entry on a 24-hour clock, not a production repo.

### Rough clock

| | |
| --- | --- |
| T+0 → T+0.75 | Cloudflare spike. **Gate: green, or we fall back to Vercel** |
| T+0.75 → T+2.5 | W0 foundation (the design session runs alongside from T+0) |
| T+2.5 → T+12 | W1–W7 and W9 fan out. Tier 1 optionals land inside their workstream |
| T+12 → T+17 | Integration, first full deploy, Tier 2 optionals |
| T+17 → T+21 | Tier 3, polish, walk the spine end to end repeatedly |
| T+21 → T+24 | README, screenshots, Forge mirror, submit early |

Submitting early is a scheduled item, not a hope. The last block contains no feature work.

## 4. Judgment calls worth making loudly

The brief's tiebreaker rewards these. Each is a deliberate divergence from the incumbent, and each
should be visible in the demo rather than buried in a changelog.

- **`B-1` — the outstanding-task dashboard.** Sessionboard's own FAQ says it has no central
  task-completion report. This is the one required row where we supply something *missing* rather
  than clone something present. **Lead the demo with it.**
- **`T-4a` — magic links for every role, no passwords anywhere.** Sessionboard makes participants
  use passwords. A speaker returns monthly and has forgotten theirs; the password is pure friction
  on a login nobody performs often enough to remember.
- **`S-10` — full impersonation, not preview.** The admin's session cookie carries
  `impersonated_by`; every write goes through as the speaker and stays attributable. Sessionboard's
  "View portal as…" is read-only, which makes it useless for support and useless for judging. Ours
  lets an organizer complete a stuck speaker's task, and lets a judge reach a speaker portal in one
  click without an inbox (`T-7a`).
- **`C-3` — a real `.ics` `METHOD:REQUEST` that updates in place on reschedule.** This appears to be
  a capability the incumbent lacks. `C-3a`, a plain add-to-calendar link, ships alongside it so the
  weaker reading of the brief is covered even if the push path slips.
- **`A-7` — speaker double-booking detection.** The brief asks only for room and track conflicts. A
  room clash is a spreadsheet error someone catches; a speaker booked in two places at once fails
  publicly, on the day, in front of an audience.
- **Airtable as a mirror, not a store** (§2) — claims the bonus without crippling the product.

## 5. Verification

The walkthrough *is* the test suite. Automated tests cover only the places where a silent bug is
unrecoverable — where nothing on screen tells you it happened.

### Cold-path rehearsal

On the deployed Cloudflare instance, in a fresh browser profile, at least three times before
submitting. Fresh profile is load-bearing: it is the only way to catch a dead end that an
already-authenticated session hides.

1. Sign up as an organizer, create an event, add 2 tracks, 2 rooms, 3 formats
2. Build a CFP form with a conditional question and one custom field; publish it
3. In an incognito window, submit a talk cold → account created → redirected into the portal
4. In the portal: bio, headshot, slides, complete a task
5. Back as organizer: score it, accept it, confirm the acceptance email in `/admin/mail`
6. Drag it onto the agenda; force a room clash and a speaker double-booking; confirm both surface
7. Open the `.ics` from the email in a real calendar client; reschedule; confirm the existing event
   **updates in place** rather than duplicating
8. Load `/embed/:slug/agenda` in a bare HTML file on a different origin; change a session; reload
9. Impersonate the speaker from admin; complete a task as them; return to admin mode
10. Create a *second* event as a different user; confirm it and the seeded demo cannot see each
    other

### Automated (`vitest`)

- `lib/ics.ts` — golden files for the initial `REQUEST`, a `SEQUENCE`-bumped update, and a `CANCEL`.
  The requirement most likely to be silently wrong: a malformed VCALENDAR renders as a plausible
  invite and fails only inside someone else's calendar client.
- `lib/services/schedule.ts` — room overlap, track overlap, speaker double-booking, and the boundary
  case of back-to-back sessions that must *not* conflict.
- `lib/services/forms.ts` — the built-in/`answers` split, one-hop `showIf` evaluation, and that
  hidden fields clear on submit.
- `lib/accelevents/` — the client against recorded fixtures (`N-1b`), since the live API may never
  be reachable.

### Self-host verification, on a clean machine

```bash
docker compose up      # must reach a working first-run setup screen with no other config
```

`T-3` is only satisfied if that is true on a machine that has never built this repo. Verifying it on
a developer machine with a warm cache proves nothing.

## 6. v1 follow-ups — current status

Three items the brief could plausibly want were tracked here rather than declared permanent
non-goals. Shipped rows remain in the table as the decision record; outstanding rows stay the v1
to-do.

| Item | Status | Notes |
| --- | --- | --- |
| Agent mail | **Shipped — bounded MCP slice** | The event MCP server can list effective templates and redacted delivery metadata, preview one recipient-resolved email, and send it through the existing audited mail boundary. It is deliberately not an agent-owned arbitrary mailbox: the target must be an existing participant on the API key's event, SMS and calendar sends stay out, email preference is rechecked at dispatch, and a write key must echo the preview's literal target confirmation plus its content-bound digest. Template, recipient or copy changes invalidate the preview. See `lib/services/agent-mail.ts` and `lib/mcp/server.ts`. |
| Video uploads / post-conference assets | **Shipped** | `session_recording` holds one deliberately draft/published source per scheduled session. **Admin → Recordings** can upload a bounded 25 MB video through the existing event-scoped storage path, associate an existing event video, or validate an external HTTPS streaming URL. A recording cannot publish before its public session ends (the past event end is the fallback for historical imports), and changing its source returns it to draft. Published recordings alone add **Watch recording** to the public session list, home/program cards, agenda detail, itinerary, speaker-session lists, and embeds; stored bytes are streamed through a publication-gated route. |
| Full agent guide | Not started; quick start is the v1 slice | The home page should offer a copyable **Agent quick start** prompt. The full version resumes a stateful onboarding conversation; the version worth building now only *describes* what an agent can do. See §6.1. |

### 6.1 Agent quick start, and the full agent guide behind it

**The surface.** `app/page.tsx` gets one more section: a copy-to-clipboard block holding an
**Agent quick start** prompt. You copy it, paste it into whatever agent you already use (Codex,
Claude Code, anything that can read a URL and call an HTTP API), and it takes over from there. The
copy affordance is the whole product — there is no Cicero-hosted agent, no chat panel, and nothing
to sign in to before you can use it.

**What the full guide would be.** The end state is a *guide*, not a script: pasted into an agent,
it first works out how far along you already are before instructing anything. Roughly, in order:

- Do you have a Cicero account yet, or are you starting from a bare repo?
- Are you self-hosting, or pointing at a deployment someone else runs? What is the base URL?
- Which event do you care about — an existing slug, or one to be created?
- Do you have an organizer API key (**Admin → Integrations**), or is this read-only for now?

Only then does it walk the remaining setup: deploy or `docker compose up`, sign up, create the
event, open the CFP, review and accept, build the program, publish, mint an API key, and hand off
to the existing `manage-cicero-event` skill (`.agents/skills/manage-cicero-event/SKILL.md`) for
ongoing compare → preview → confirm → apply → verify runs.

**It has to remember.** Each answer is written to a small local state file in the user's working
directory — base URL, event slug, account status, how far the walkthrough got. A second invocation
reads that file and resumes instead of re-interrogating you; saying "the event I care about is
`first-settlement`" once should be enough, forever. That local store is the only part of this that
is genuinely stateful, and it is what turns a prompt into a guide.

**Why the v1 slice is smaller.** Building all of the above out of the gate is overkill for this
submission. What ships first is the *concept* plus a quick start that **describes** what an agent
can do against Cicero — the OpenAPI contract (`docs/openapi.json`), the reconcile operation, the
`manage-cicero-event` skill, where keys come from — and points at those. It does not actually walk
you through every step, does not branch on your progress, and writes no local state.

**Explicit non-goal, so this does not sprawl.** There is no comprehensive agent parallel to the
product: we are not mirroring every organizer action in the UI with an equivalent agent workflow,
and the guide is not a second front end. It gets you set up and then hands off to the API and the
one skill that already exists. Anything beyond that is a separate decision, not an implied part of
this item.

The agent-mail and recording rows closed on 2026-08-13. The MCP mail slice reaches the ordinary
`lib/mail` boundary only through an event-scoped preview → literal confirmation → send flow; it does
not create a general mailbox or relax the advisory stance in §2. Recordings have a scoped source,
publication gate, organizer workflow, and public playback affordance.

Not on this list: Speaker CRM. It shipped — a full CRM at `app/crm/*` above the event layer, as
`docs/decisions-long-form.md` records ("The largest functional expansion is the speaker CRM"). The
stale `[EXCLUDED]` line this section used to flag has now been **corrected**: `01-requirements.md`
§14 marks that row **BUILT ‡**, along with the sponsor/exhibitor row it always contradicted `E-7`
over. No follow-up remains.
