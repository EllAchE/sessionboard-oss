# Cicero

An open-source replacement for Sessionboard.

Live: <https://cicero-three.vercel.app> · Source: `EllAchE/sessionboard-oss`, MIT.

This is the full submission narrative. For the condensed version sized to a form field, see
[`06-submission-summary.md`](06-submission-summary.md).

---

## 1. What this is

Cicero is the software a conference runs on between "we should do a call for papers" and "the
agenda is live on our website." An organizer creates an event, builds a call-for-speakers form and
publishes it at a public URL. Speakers submit proposals cold — no account beforehand — and land in a
portal where they fill in a bio, a headshot, slides, and whatever else the organizer asked for. A
review committee scores the proposals in rounds; the organizer accepts or declines; accepted talks
get dragged onto a schedule that shouts when two sessions collide or one speaker is booked in two
rooms at once. Speakers get templated email and calendar invites that update in place when a talk
moves. The finished programme goes back out as public pages, embeddable widgets, and a REST API.

The whole path works end to end on the deployed instance today, from a cold browser with no account.

It is Bun + Next.js 15 (App Router), React 19, TypeScript, Drizzle over Postgres, Zod as the API
contract, plain CSS Modules over a hand-built design system. `docker compose up` brings up the app,
Postgres and MinIO in one command with no API key from anyone.

---

## 2. The point of view

The competition brief said two things that decided the shape of this build:

> "We do NOT expect to use everything ... Which makes it easier for you to clone and makes less
> sense for us to pay."

> "Cloning the exact design is not a requirement; the point is to make a good-enough open source
> alternative."

So this is not a feature-parity clone. Sessionboard has accumulated awards, marketing, studio, and
content-remix modules; the AI Engineer team pays >$40k/year and uses a narrow slice. Cloning the
accumulation would have been the wrong work. The scoping rule was: **coverage of the workflow beats
depth on any one feature.** A judge walking the speaker journey and hitting a dead end is the only
failure mode that matters. A plain screen that completes the path is worth more than a polished
screen that ends halfway through the job.

The product thesis underneath that, stated in `docs/decisions-long-form.md` and visible in the code:

> Keep the human in control, but remove the clerical work that makes conference operations
> miserable.

That is one sentence, and it is falsifiable. It rules things in and out:

- The system **can propose a schedule but cannot publish one** behind the organizer's back.
- It **can read a proposal but cannot accept or reject it.** `lib/ai/review.ts` writes to `ai_review`,
  a table the human score averages never read.
- It **can push an accepted speaker into Accelevents, but that platform never becomes the source of
  truth** for the programme — the sync is one-way and never reconciles remote edits back.
- It **can draft a chase email, but a named human reads and sends it.**

That last one is the clearest example of a judgment call a generic CRUD clone would not make. The
required dashboard row (`B-1`) is "accepted speakers with outstanding tasks" — and Sessionboard's own
FAQ says it has no central task-completion report, so this is the one place Cicero supplies something
*missing* rather than clones something *present*. But a report that names who is blocking your event
and then abandons you to your inbox is only half the feature. The obvious completion is an
autosender. It was deliberately not built.

The reason is evidence, not taste. Before building it, I had an agent read the Slack channel where a
conference's event coordinator has run speaker logistics for thirteen years — about 13,488 messages
— and report what actually happens when someone is late. The finding: **in thirteen years of archive
there is no instance of a tool successfully sending a reminder on the committee's behalf.** The same "it went to spam, I'm
sending a personal email" incident appears in 2023 and again in 2025. Escalation runs *by medium* —
the tool's email, then the coordinator's own address, then a cc, then a text, then a phone call —
because each step up is a deliberate signal.

So Cicero ships **assisted chasing** (`AR-30`–`AR-34`): every outstanding-task row has a "Draft a
nudge" control that opens a composer prefilled with copy specific to that person and that task. The
composer is two-step — edit, render, send — enforced on the *server*, not the client: `sendTaskNudge`
requires the reviewed subject, body and recipient back, and `sendParticipantEmail` re-resolves the
recipient and re-renders the message and refuses if either moved. There is no bulk action, no
"remind all", and no code path from a table row to an outbound message that skips the render. And
because escalation is by medium, the rendered draft offers *Copy* and *Send from my own email*
(`mailto:`) beside *Send from Cicero* — handing the same reviewed text to the human instead of the
transport. That is the one thing an autosender structurally cannot do.

Autonomous chasing from that surface is recorded as `AR-34`, **[EXCLUDED]**, with the reasoning in
the row. Cicero keeps its opt-in `task.reminder` cron flow, which is a different act: a template an
organizer configured in advance for a whole event, versus one person, one task, one message, sent by
a named human.

---

## 3. Architecture, and why

### The service layer, and the rule that "the UI never calls its own HTTP API"

Three layers, strictly:

```
app/api/v1/**      REST handlers — thin, Zod-validated, API-key auth
app/**             Server Components read; Server Actions write — thin
lib/services/**    ALL domain logic. Pure TS. No HTTP, no React, no Next imports
db/**              Drizzle schema, migrations, seed
```

The rule is that **both entry points call the same service function.** A Server Action does not POST
to `/api/v1`; a REST handler does not import a React component. There is no `fetch()` to Cicero's own
API anywhere in `app/`.

The reason is not architectural taste. It is that there is exactly one implementation of every rule,
so the REST surface and the admin screens cannot drift. If an organizer cannot schedule a session
into an occupied room through the UI, they cannot do it through the API either, because it is the
same `lib/services/schedule.ts` call. The alternative — the UI as a client of its own API — gives you
two enforcement points and a slow, quiet divergence between them, and the divergence always shows up
first as an authz hole.

It also made the MCP server nearly free. `/api/v1/events/{slug}/mcp` calls the same
`lib/services/public-api.ts` reads and `lib/services/program-reconcile.ts` writes that REST calls.
The MCP route never calls Cicero over HTTP.

There are two honest exceptions to "no Next imports in services," and I would rather name them than
have someone find them: `lib/services/events.ts` imports `cookies` from `next/headers` for the
current-event selection, and `lib/services/submissions.ts` imports React's `cache()` — the latter as
a deliberate per-request memoization fix for duplicate reads. Nothing else in 50-odd service modules
touches Next or React.

### What that rule buys: the enforcement lives in one place

The reason to care about the service layer is not tidiness, it is that the interesting parts of this
domain are *rules*, and rules are where clones quietly fail. Four concrete ones, all in the service
layer, all reachable from every entry point:

**A deadline changes behavior, in more than one direction.** `isAcceptingSubmissions` is nine lines
and is the only definition of "can this form take an answer right now": status is `open`, the open
date has passed, the close date has not. Five entry points call it — the public form page, the submit
Server Action, the file-upload route, the REST form GET, and the REST submission POST — so a closed
form is closed through the API too, not just visually. Editing is a separate lock with its own copy,
because the two failure states read differently to a speaker: a session that can no longer be edited
from the portal while the form is still open says so and points at the organizers; a form that has
since closed names the date it closed, and an unsent draft on a closed form offers to discard rather
than pretending it can still be sent.

**Anonymized review redacts before it filters.** `lib/services/review.ts` carries the comment
"Redacted before the filter runs, so a blind reviewer cannot recover a name by searching for it."
Hiding a name in the rendered output and then running search over the unredacted row is the obvious
implementation and it leaks: type the author's name into the filter box and the anonymized card is
the one that comes back. Blindness is also resolved per viewer, not per round — an organizer who can
decide always sees the author, because the round setting is about who is scoring, not about the data.

**A decision is staged, then committed, and only a real transition mails.** `decideSubmissions` is
deliberately the only path that writes `accepted` / `waitlisted` / `declined`, and bulk and single
share it, "because a bulk decision that behaved differently from twenty individual ones would be a
bug nobody notices until the agenda is wrong." Re-accepting an already-accepted talk writes the row
but sends nothing. `reset` sends nothing at all — "taking a decision back is a conversation an
organizer has in their own words, not a form letter." And the notice is sent *after* the status has
committed, best-effort, so a mail server refusing recipient nineteen of a bulk accept does not unmake
the decision; the organizer sees a failed count and resends from the campaign screen.

**Public reads default to published.** `listSessions` defaults `status` to `published`, and asking
for anything else requires an `includeUnpublished` flag that only key-scoped callers pass. Draft
sessions are not in the embeds, not in the public agenda, and not in an unauthenticated API response,
by default rather than by a filter someone remembered to add. The five widgets — sessions list,
speakers list, agenda grid, itinerary, speaker gallery — are deliberately **one route** that loads
one bundle and differs only in layout, "so a fix to the published-only filter cannot land on four of
them and miss the fifth." They are also genuinely public: no login, no token, `frame-ancestors *`,
and a `/embed.js` snippet that auto-resizes the iframe. An embed behind an auth wall is not an embed.

Every one of those is the kind of thing that is invisible on a screenshot and decides whether the
software is actually usable.

### The freeze: `db/schema.ts`, service signatures, `components/ui/`

This build ran as nine concurrent workstreams. Before any of them started, one foundation pass wrote
`db/schema.ts` complete, the `lib/services/*` signatures and Zod schemas with `throw new
Error('TODO')` bodies, and the design-system primitives in `components/ui/`. Then all three were
**frozen** — read-only to feature workstreams, with changes routed back through the foundation owner.

That single rule is what makes parallelism possible. Two agents touching submissions never need to
agree on anything at runtime; they need to agree on a signature that was fixed before either started.
A schema change at hour eight invalidates work in five directories at once, and a coordination
protocol invented after the fact does not recover it. Ownership is by *directory*, not by feature,
because a directory is checkable and a feature is not.

The `components/ui/` half of the freeze is the same argument applied to design: if the primitives are
not frozen before eight agents start, you get eight different buttons. Any workstream that wanted a
new primitive routed the request rather than adding one. There is no Tailwind, no shadcn, no Radix,
no CSS-in-JS anywhere in the tree — introducing any of them would mean fighting the design system
rather than using it.

The current tree has 23 modules in `components/ui/` and 20 migrations, and the layering held.

### The database: one hybrid table, and event scoping from day one

`submission` is the table to get right. Title, description, format, track, level and status are
**real Postgres columns** — not JSON, not an EAV side table. The review queue sorts on them, the
agenda joins on them, conflict detection compares them, the embeds filter on them. Every one of those
becomes slow, untyped, or unwritable if the value lives inside a blob. Everything a form adds beyond
those built-ins lands in an `answers` JSONB column, where it is only ever read back whole, per
submission, on a detail screen or a CSV export — which is the access pattern JSONB is good at.

That split is also why no off-the-shelf form engine survived the survey (SurveyJS, form.io, `@rjsf/core`,
JSONForms, Formily, HeyForm, OpnForm, Formbricks, `@bpmn-io/form-js`, `@react-form-builder`). The
license problems were real — SurveyJS's *builder* is a commercial per-developer seat, which would mean
everyone who clones an MIT repo needs a license; HeyForm/OpnForm/Formbricks are AGPL — but the decisive
point is license-independent: **every engine assumes it owns the whole schema and emits one blob.** We
would still have hand-written the locked-column enforcement, the builder-UI locking, and the theme,
while carrying 300KB–1MB of someone else's runtime. The only thing genuinely rentable is the
schema-walking loop, which is about eighty lines.

**Every table is event-scoped from the first migration.** Multi-event (`E-6`) is tagged OPTIONAL, but
the scoping underneath it is not: the deployed demo has to coexist with a judge's cold-created event
without either seeing the other. Retrofitting `event_id` across a live schema is a rewrite; adding it
on day one is a column. The event switcher then came nearly free on top of scoping that was needed
regardless.

One deliberate limit worth naming, because it looks like a gap until you read the reasoning: form
conditional logic (`showIf`) may reference **only an earlier field, one hop, no chaining**, and hidden
fields' values are cleared at submit. Arbitrary conditional graphs bring cycles, cascading
re-evaluation order, and fields visible by one path and hidden by another — a bug class that is
expensive to find and much worse to find during judging. One backward hop removes all of it by
construction rather than by testing.

### AI stays advisory, never decides

Two AI features shipped: AI-assisted review (`V-9`) and an AI agenda builder (`A-8`). Both are
advisory **by construction**, and the constraint is in the code rather than in a policy document.

`lib/ai/review.ts`: "produces a suggestion an organizer reads beside their own scorecard. It writes
no rows and never touches `submission.status` — persistence goes through `saveAiReview` into
`ai_review`, a table the human score averages never read."

`lib/ai/agenda.ts`: "Proposes where the unscheduled queue could go, and stops there. It never writes.
The organizer reviews the placements on the board, edits any of them, and accepts or discards."

The reason it is a boundary and not a default: an AI that silently decided an acceptance or committed
a schedule would be a worse product than one that does not, and it would be indefensible to a judge
who found it after the fact. It is also correct on the merits — a model cannot see the sponsor who
must not follow the keynote, or the speaker whose flight lands at noon. The organizer can.

Both features stay **on screen** with no `ANTHROPIC_API_KEY` set, and say so. Review falls back to a
rule-based reader; the agenda falls back to a deterministic earliest-free-slot planner. Hiding an
unconfigured feature hides the shape of it, and the shape — *they propose, they never decide* — is the
part worth judging. The deployed demo runs with no key.

The same boundary governs the MCP agent-mail slice, which is the one place an agent can cause egress.
It is deliberately not an agent-owned mailbox: the target must be an existing participant on the API
key's event, the key must have `write` scope, SMS and calendar sends are excluded, email preference is
rechecked at dispatch, and the send must echo back the preview's literal target confirmation *plus* a
content-bound digest. Changing the template, recipient or copy invalidates the preview.

### Magic-link-only auth (`T-4a`)

No passwords anywhere. No password column, no password check, no reset flow, no lockout policy, no
credential-stuffing surface. Every role — organizer, reviewer, speaker — signs in the same way:
tokens are stored only as a hash, expire in 30 minutes, are single-use on redemption, and are
exchanged for a 30-day httpOnly session cookie.

Sessionboard does the opposite for the persona that matters most: participants keep a password for a
site they visit twice a year. They forget it, and the organizer becomes a help desk. (Sessionboard
*does* use magic links — for reviewers, AV crew, and advocates. The inconsistency is theirs.)

The real cost of this choice is deliberate and worth stating: **if email does not arrive, nobody gets
in.** Cicero pays that cost three ways.

1. **`email_log` doubles as the dev mailbox.** Every send is recorded and rendered at `/organizer/mail`,
   sign-in links included, under any transport. A judge who never receives a message can still read
   it. That single choice removes email deliverability as a single point of failure during judging.
2. **Reserved recipients are undeliverable by construction.** The seeds are built entirely from
   IANA-reserved domains (`organizer@example.com`, the senate at `@first-settlement.example`), and
   `sendMail` routes *any* recipient at a reserved domain to the log transport whatever else is
   configured. Real addresses in the same run still get real mail, and no provider is ever asked to
   bounce a roomful of fictional senators.
3. **On-screen magic links are gated by four conditions, in one place.** `lib/demo-access.ts` carries
   the whole threat model: an explicit default-off deployment flag, the reserved-domain test, an
   existing account holding seeded-demo membership, and no membership on any event outside the demo
   it does not own. Every real organizer, reviewer and speaker fails the domain test, so no real
   account is reachable through it at any setting.

One thing is explicitly *not* a condition: **a failed send.** Revealing the link whenever a provider
says no would be an authentication bypass triggerable by a stranger with a bounce. An earlier version
of the reviewer-invite path did exactly that; it was found in the audit and fixed, and the reasoning
now lives in the code so it does not come back.

The related judgment call is **impersonation, not preview** (`S-10`). The organizer's session cookie
carries `impersonated_by`; every write goes through *as the speaker* while that organizer identity is
available to the service handling it.
Sessionboard's "View portal as…" is read-only, which makes it useless for support — the point is to
finish the stuck speaker's task for them — and useless for judging. Ours lets a judge reach a speaker
portal in one click without an inbox. The shortcut and its incomplete durable attribution are called
out below rather than presented as the final production model.

---

## 4. Deployment: Cloudflare is supported; the demo runs on Vercel for $5

This is the part of the story most likely to be misread, so here it is straight.

**Cloudflare Workers is a fully supported, first-class deployment target and works today.** It is
what the architecture was designed against. `bun run cf:build` and `bun run cf:deploy` are real
scripts. `wrangler.jsonc` is live and complete: Hyperdrive binding, hourly Cron Trigger
(`0 * * * *`), assets binding, observability, and a commented R2 block that is two uncommented
blocks away from turning on. `custom-worker.ts` preserves OpenNext's generated `fetch` handler and
adds Cloudflare's module-format `scheduled` handler, which calls `/api/cron` **in-process** so
OpenNext's request-local Hyperdrive context exists without a public loopback request. None of this is
vestigial and none of it is broken.

**The demo runs on Vercel because of one number.** Measured just now with
`npx wrangler deploy --dry-run` against the current `.open-next` build:

```
Total Upload: 19499.98 KiB / gzip: 3499.68 KiB
```

**3.42 MiB gzipped.** Cloudflare's size limits are on the compressed artifact:

| Plan | Ceiling | This bundle |
|---|---|---|
| Workers Free | 3 MiB | **~14% over** |
| Workers Paid ($5/mo) | 10 MiB | **~3× under** |

So the bundle clears the paid ceiling with room to spare and misses the free ceiling by about
fourteen percent. The fix is a $5/month subscription and no code change at all. I declined it,
because the Cloudflare bonus is a **"mild"** bonus by the brief's own wording, and paying a
subscription to keep a mild bonus is the wrong trade for a project whose README asks a stranger to
clone and run it. Anyone who wants that deployment should upgrade the plan; nothing in this repo has
to change to take that path.

**This number was wrong in the repo until the last day of the build, and the way it was wrong is
worth stating.** `docs/02-architecture.md` §1, `README.md`, `wrangler.jsonc` and the audit checklist
all compared the **13.4 MiB uncompressed** `handler.mjs` against the **3 MiB compressed** ceiling,
and `02-architecture.md` drew a further conclusion from it — that "Workers Paid's 10 MiB ceiling
would not have fit it either without splitting the bundle." That is an uncompressed size measured
against a compressed limit, and the conclusion it produced was false: Paid fits this bundle three
times over.

The error surfaced because two docs disagreed. The architecture doc said Paid would not have helped;
the audit checklist said Paid "would likely close this." Rather than pick the more convenient one, I
ran `wrangler deploy --dry-run` and measured. All four files now carry the corrected figure, each
marked as a dated correction with the original claim quoted rather than silently overwritten — the
same convention the repo uses everywhere else it reverses itself.

**What the host change actually cost**, stated in full:

- **Hyperdrive is gone**, so Postgres connections are no longer pooled at the edge. `db/client.ts`
  falls through to its `DATABASE_URL` branch with a module-scoped pool — correct for Node, and the
  reason no code changed. The deployment uses a Neon *pooled* connection string.
- **Cron parity degrades.** Vercel's Hobby plan rejects any schedule running more than once a day *at
  deploy time* — an hourly `0 * * * *` fails the build outright. `vercel.json` therefore schedules
  `0 8 * * *`. Reminder jobs carry durable idempotency guards and evaluate their own due times, so a
  coarser tick **delays delivery rather than corrupting it**. Restoring hourly is Vercel Pro or any
  external scheduler hitting `GET /api/cron` with a bearer `CRON_SECRET`.
- The Cloudflare bonus (`Z-1`) is not met by the *deployed instance*.

**What did not change: any application code.** `db/client.ts`, `lib/env.ts` and `lib/storage` each
already had a non-Cloudflare branch, reached by catching the throw from `getCloudflareContext()`
(Workers puts bindings on a request-scoped context, not `globalThis`, and that call throws when there
is no request — under `next start`, `tsx`, and vitest). The only repo changes were `vercel.json`,
moving `@opennextjs/cloudflare` from `devDependencies` to `dependencies` so Vercel's file tracing sees
it, and a docs section.

That is the payoff of a decision made on day one and argued for in writing before it was needed:
**Postgres, S3-compatible storage and HTTP email are all host-agnostic, so the host is reversible.**
The rejected alternative makes it concrete — SQLite plus `better-sqlite3` plus local disk would have
been faster to stand up and would have turned this same fallback into a rewrite: different driver,
different storage story, every query migrated. The escape hatch was worth more than the head start,
and it got used.

Two smaller deployment decisions in the same spirit:

- **File storage defaults to the database, not R2.** `lib/storage` resolves R2 binding → `S3_BUCKET`
  → a `file_blob` row. R2 is the better store and costs ~$0/month at conference scale, but Cloudflare
  requires completing a subscription checkout to enable it, widely reported to need a card. An
  open-source project that demands a credit card before it will run is a worse product than one that
  keeps a few headshots in Postgres. The binding always wins where it exists, so turning R2 on
  changes no code. The bound is made visible rather than hidden: one upload caps at 25 MiB, the admin
  Files screen warns at 250 MiB of deployment-wide blobs, and 500 MiB is named as the handoff point.
- **Self-host is a real target, not a README paragraph.** `docker compose up` starts app + Postgres +
  MinIO, migrates before serving, and creates the bucket. `MAIL_TRANSPORT` defaults to `log`, so a
  fresh clone needs no API key from anyone and every message — sign-in links included — is readable
  at `/organizer/mail`.

---

## 5. What is done, what is partial, what is not built

The repository carries `docs/requirements-audit-checklist.md`, which audits every requirement ID
against a pinned revision as COMPLETE / PARTIAL / OUTSTANDING. Its own headline count, at revision
`416101e`:

| Priority | Complete | Partial | Outstanding | Excluded | Total |
|---|---:|---:|---:|---:|---:|
| Required | 54 | 2 | 2 | — | 58 |
| Important | 27 | 0 | 0 | — | 27 |
| Optional | 29 | 0 | 2 | — | 31 |
| Bonus | 3 | 1 | 1 | — | 5 |
| Excluded | — | — | — | 3 | 3 |
| **Total** | **113** | **3** | **5** | **3** | **124** |

**Read that table with its caveat attached.** It is a dated snapshot: audited 2026-08-13 against
`416101e`, and the row-by-row verdicts were **not** re-audited when production moved on 2026-08-15.
Two of its statements were corrected in a superseding note (the Workers host, and First Settlement
being seeded — that route now returns 200). Anyone using it should treat it as evidence with a
timestamp, not a live status board.

### Genuinely done, and verifiable in a browser

The full spine: event configuration with tracks/rooms/tags/formats, a drag-and-drop CFP form builder
over the hybrid schema with conditional logic and multi-step public runtime, cold submission with
in-flow account creation, the speaker portal (profile, headshot, versioned deliverable uploads,
tasks, custom portal pages, group access), review rounds with weighted scorecards, auto-distribution,
blind-until-close and author-anonymized modes, recusal and workload reporting, drag-and-drop agenda
with room/track/speaker-double-booking conflict detection, five agenda views plus month, templated
comms with a send log and a real `.ics` `METHOD:REQUEST`, the outstanding-task dashboard plus five
prebuilt dashboards and a custom board builder, public pages and five embeddable widgets, and a versioned REST
API with generated OpenAPI.

Beyond the brief: a full speaker CRM above the event layer (`app/crm/*`) with custom fields, import,
reversible merges, dynamic and curated segments and a sourcing pipeline; sponsor/exhibitor entities
with a published-only public wall; post-conference recordings behind two publication gates; SMS as a
second channel with consent, E.164 normalization, OTP verification and quiet hours; per-notification
opt-out with tokenized no-login unsubscribe; signed outbound webhooks; a Streamable-HTTP MCP server
with a generated manifest; and four role-scoped agent skills.

Verified by me on the current tree, not quoted:

- `bun run test` — **129 test files, 1371 tests, all passing.**
- Live routes returning 200: `/`, `/demo/agenda`, `/api/v1/events/demo/agenda`, `/embed/demo/agenda`,
  `/first-settlement`.
- No `fetch()` from `app/` to Cicero's own `/api/v1`.
- 28 API route handlers, 20 migrations, 23 UI primitives, MIT license.

### Partial — the accurate word is partial

- **Organizer-assisted action attribution.** Full impersonation works, but it is broader than the
  task-support use case: it includes the speaker's settings, and task, upload and comment mutations
  do not all retain the organizer as the actor after the impersonated session ends. The useful
  capability is an organizer making an edit on a speaker's behalf; the missing production boundary
  is to scope that access and persist both identities on every such action.
- **`T-6` — real outbound transactional email on the deployed instance.** The code is finished: three
  transports (`log`, `smtp`, `resend`) behind an `auto` resolver that degrades to `log` and warns
  rather than failing silently. What is missing is deployment configuration — a verified Resend
  sender domain, an API key secret, and a `MAIL_FROM` that is not Resend's shared test sender. The
  demo therefore delivers nothing externally; everything is readable at `/organizer/mail`. This is a
  choice with a cost: it is what makes the inbox-free demo work, and it is why this row is not green.
- **`C-3` — calendar invites landing on a speaker's calendar.** The ICS itself is correct and pinned
  by golden-byte tests: `METHOD:REQUEST` with real organizer and attendees, a stable UID with a
  `SEQUENCE` that increments only when an invite was already sent, RFC 5545 escaping and 75-octet
  folding, and a MIME `method=` parameter re-read from the body so a `METHOD:CANCEL` is not
  mislabelled. It stays partial purely because it rides on `T-6`: under the log transport the invite
  is stored, not delivered. `C-3a`, the plain add-to-calendar download, is complete.
- **`Z-4` — the speed bonus.** A real benchmark exists (`bun run bench`) and it **confirms the concern
  rather than clearing it.** Across 7,000 requests against a self-hosted `docker compose` target the
  five public routes returned zero errors at 41–58ms p50 — but cost **29–46ms of server CPU per
  rendered page**, against the Workers free plan's 10ms ceiling. The JSON API at ~8ms is the
  exception, which is exactly why an API health check passed while navigation intermittently 503'd on
  the old Workers deployment. One concrete cause was found and fixed — four public routes ran their
  read model twice per request, once from `generateMetadata` and once from the page body, now wrapped
  in React's `cache()` — but that fix was verified on macOS while the CPU sampling only works on
  Linux, so it has **not** been re-measured. Do not read this row as claiming the routes now fit in
  10ms; halving one source of duplicate work on a machine that cost 29–46ms is very unlikely to clear
  a 10ms ceiling by itself. Measuring a problem is progress; it is not a speed bonus.

### Not built, or not met

- **`Z-1` Cloudflare deployment** — not met by the deployed instance. Configuration is present and
  correct; see §4. One plan upgrade away.
- **`Z-3` Forge hosting** — not met. The source is on GitHub.
- **`N-1c` a live Accelevents end-to-end run** — no successful run against a real customer account.
  The client is built against the documented `POST /rest/events/{eventId}/speaker` contract with a
  fixture-backed fake for tests and demo mode, but Accelevents publishes per-endpoint OpenAPI
  fragments and no combined spec, and their auth header name is genuinely ambiguous (the client
  defaults to `Authorization` and retries once with `Key` on a 401). Attendee creation is a five-call
  ticket-order sequence with no documented complimentary flag; it ships behind the same interface,
  marked experimental, and the required speaker path does not depend on it.
- **`D-5` token-spend receipts** — not collected.
- **`E-8` role-based admin permission grid** — excluded by the brief. `membership.role` is only the
  organizer/reviewer/speaker distinction; nothing reads it beyond deciding which surface a session may
  enter. It is not a permissions matrix and does not pretend to be.
- **The compose screen cannot address one named person.** `manual` is a real audience kind in
  `lib/services/comms.ts` and the MCP surface reaches it, but it is not selectable in the composer —
  every send from that screen goes to a computed group. (Assisted chasing in `AR-30` is the
  one-person path that does exist.)
- **The embed builder exports HTML and an iframe snippet only.** JSON, XML and iCal views of the same
  data are reachable through the REST API but have no button in the embed admin.
- **R2 and Twilio ship tested but not production-proven.** Both code paths are complete and selectable
  by environment variable, but the hosted deployment takes no payment method, so it exercises the
  Postgres storage backend and the `log` SMS transport. A self-hoster who enables either is the first
  real user of that path. The SMS pre-flight set (`AR-9`–`AR-14`: consent, E.164, OTP verification,
  delivery state, quiet hours) is shipped and must be re-verified by whoever flips
  `SMS_TRANSPORT=twilio`; `AR-9` in particular is a legal precondition, not an improvement.
- **`D-1` / `D-4` — competition entry and delivery deadline.** External to the repository, and satisfied by this
  submission rather than by anything in the tree. (`docs/00-goals.md` still records an earlier draft
  date for the deadline; it is a stale note, not a missed date.)

---

## 6. What I would do next

In rough order of how much a real organizer would feel it.

1. **Close `T-6`, and with it `C-3`.** Verify a sender domain in Resend, set the secret, point
   `MAIL_FROM` at it. That converts two PARTIAL required rows to complete with no code change, and it
   is the only thing standing between the tested `.ics` and an actual calendar entry. It has to be
   done without breaking the inbox-free demo, and the per-recipient reserved-domain routing already
   built for exactly that reason means it can be.
2. **Replace full-session impersonation with an audited organizer-assist path.** Keep the ability to
   finish work on a speaker's behalf, but do not expose speaker-only settings. Every mutation should
   persist both the acting organizer and the affected speaker so the task history, uploads, comments
   and exports never claim that the speaker performed an organizer's action.
3. **Re-measure `Z-4` properly, on Linux, against the Workers runtime.** The `cache()` fix has never
   been measured. The honest next step is a Linux benchmark host, `--cpu-pid` against `wrangler dev`,
   and then a decision: either the public routes fit a real budget, or the answer is a
   short-TTL cache on the public read model, which is where the CPU actually goes. Both are better
   answers than "buy the paid plan," even though the paid plan also fixes it.
4. **Re-run the requirements audit against the current tree.** The pinned checklist is two days and
   several hundred commits stale, and a stale audit is worse than none because it reads as current. It
   should also pick up the corrected Cloudflare bundle numbers in §4, which landed after the audit was
   pinned.
5. **Split the Cloudflare bundle, or shrink it.** 3.42 MiB against a 3 MiB ceiling is ~14% — that is a
   tractable engineering problem, not a wall. The Anthropic SDK, the AWS S3 client and `nodemailer` are
   all conditionally reachable and all in the server bundle; moving the AI and S3 paths behind dynamic
   imports is the obvious first cut. Getting under 3 MiB would restore free-tier Cloudflare and close
   `Z-1` without anyone paying anything, which is a better outcome than the $5.
6. **Give the composer a `manual` audience.** The service layer already supports it; only the
   organizer screen does not. This is the shortest distance between a known gap and a closed one.
7. **A live Accelevents run** (`N-1c`) the moment a credential exists — and then decide, on evidence,
   whether the experimental attendee-order path is worth keeping or should be deleted rather than
   shipped ambiguous.
8. **Event cloning.** The requirements doc flagged this as the one genuinely arguable exclusion:
   organizers run the conference annually, and the brief never mentions a second edition. Everything
   needed for it exists — event scoping, `S-20` copy-tasks-from-a-previous-event, the CRM's
   cross-event contact model. It is the highest-value thing the brief did not ask for.

---

## A closing note on how this is documented

Every non-obvious decision in this build has a written record, and the records were written *before*
the decisions were needed rather than reconstructed after. `docs/00-goals.md` is the prose statement
of the target. `docs/01-requirements.md` is derived **only** from the competition brief and its 42
screenshots and is closed to additions — that is the property that makes it a faithful record of what
was actually asked for; everything the owner wanted afterwards lives in
`docs/05-additional-requirements.md` instead. An independent survey of Sessionboard was produced by a
separate agent with no access to the brief or the requirements doc, and used strictly as a *coverage
check* — it was never allowed to silently expand scope.

Where the requirements pass was later reversed — the speaker CRM and sponsor/exhibitor entities were
both excluded and then built — the exclusions are struck through in place and marked BUILT, rather
than deleted. A decision record that quietly edits itself is not a decision record.

That habit is also why §5 above can be specific about what does not work. A README that claims
everything works is one a judge stops trusting at the first dead end.
