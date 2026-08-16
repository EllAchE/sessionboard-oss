# Cicero

An open-source replacement for **Sessionboard** — the software a conference runs on between "we
should do a CFP" and "the agenda is on the website."

Built for the **"$10,000 Kill My SaaS"** competition run by the AI Engineer team.

Cicero covers the whole spine, not a slice of it:

> organizer configures an event → builds a call-for-speakers form → publishes it at a public URL →
> a speaker submits cold, account created in the flow → lands in a portal for bio, headshot and
> slides → organizer scores and accepts → the accepted talk is dragged onto the schedule → the
> speaker gets a templated email and a real calendar invite → the organizer watches who still owes
> a task → the agenda and speaker gallery embed back onto the event website.

MIT licensed. No account required to read a published agenda, no password anywhere, and a
one-command self-host that needs no API key from anyone.

## Look at the running one first

**<https://cicero-three.vercel.app>** is deployed and seeded.

Sign in as `organizer@example.com` and you land in the organizer dashboard. It is a seeded demo
account at a reserved domain with no inbox behind it, so its sign-in link comes straight back on the
page and you never need one; every message the demo sends to a demo identity is readable at
[`/admin/mail`](https://cicero-three.vercel.app/admin/mail).

Type your own address instead and an account is created on the spot and the link is mailed to you —
you land at "create an event," which is the cold path this was built to survive. Your event and the
seeded demo cannot see each other.

Without signing in at all: the [public event page](https://cicero-three.vercel.app/demo), the
[programme](https://cicero-three.vercel.app/demo/agenda), an
[open call for speakers](https://cicero-three.vercel.app/submit/demo/speak) you can submit to,
the [embeddable agenda](https://cicero-three.vercel.app/embed/demo/agenda) an event site would
iframe, and the [REST API](https://cicero-three.vercel.app/api/v1/events/demo/agenda).

![The organizer dashboard, opening on outstanding speaker tasks](docs/images/dashboard.jpg)

The dashboard leads on who still owes you something, because that is the one report Sessionboard's
own FAQ says it does not have. Everything else on this page exists in the incumbent too.

![The published programme, without an account](docs/images/public-agenda.jpg)

## Try it in one command

```bash
docker compose up
```

Then open <http://localhost:3000>. That brings up the app, Postgres and MinIO, migrates the
database before serving, and creates the file bucket — there is no second command and nothing to
configure. Email has no API key in a fresh clone, so every message the app would send is recorded
and readable at **`/admin/mail`**; sign-in links included. Nothing about the walkthrough depends on
a real inbox.

To load the demo conferences:

```bash
docker compose exec app npm run db:seed
```

(`npm` rather than `bun` is deliberate here, and only here: the Dockerfile's runtime stage is
`node:22-slim`, so the running container has npm and no bun. Every command you run on your own
machine below uses `bun`, because `bun.lock` is the lockfile — `npm install` would ignore it and
resolve a different tree.)

The seed creates two idempotent cases:

- **Cicero Forum** — a fictional Roman-themed conference with 14 submissions mid-review, 7
  historically inspired speakers, 4 tracks, 3 rooms, and a two-day agenda with gaps still in it.
- **The First Settlement** — a Roman Senate-themed programme inspired by the sessions of
  13–16 January 27 BCE, with motions, consular review, a partly scheduled agenda, and outstanding
  speaker tasks.

Run it twice and you get the same two events, not four.

## Local development

```bash
cp .env.example .env       # defaults already point at the compose Postgres and MinIO
bun install
bun run db:migrate
bun run db:seed            # optional
bun run dev
```

Everything in `.env.example` is documented inline. The only variable that must be right in a real
deployment is `APP_URL`, because magic links, embed snippets and calendar invites are all built
from it.

| Script | |
|---|---|
| `bun run dev` | Next dev server |
| `bun run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` — no database needed |
| `bun run test:integration` | The database-backed suite (see below) |
| `bun run db:generate` | Generate a migration from `db/schema.ts` |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Seed both demo conferences (idempotent) |
| `bun run db:seed:first-settlement` | [Plan or seed only the Roman demo](docs/first-settlement-seed.md) |
| `bun run cf:deploy` | Build and deploy to Cloudflare Workers |

### Sending real email

Out of the box `MAIL_TRANSPORT=log`: every message is written to `email_log` and rendered at
`/admin/mail`, sign-in links included, and nothing is delivered. That is the right default for a
clone, and nothing in the walkthrough needs more than it.

To actually send, pick a transport:

| | Set | Notes |
|---|---|---|
| **Resend** | `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` | HTTP, so it works on Workers and self-hosted alike. The only option on Cloudflare. |
| **SMTP** | `MAIL_TRANSPORT=smtp`, and either `SMTP_URL` or `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`) | Self-host only — Workers has no raw TCP. `SMTP_ALLOW_INSECURE=true` accepts a self-signed certificate, for MailHog and other local catchers. |
| **Auto** | `MAIL_TRANSPORT=auto` | Takes whichever of the two has credentials, and the dev mailbox when neither does. Lets an instance be switched on by adding a key rather than by editing its configuration; it is what the deployed demo runs. |

Both paths need **`MAIL_FROM` set to an address at a domain the provider has verified** (Resend:
Domains → add and complete the DNS records; SMTP: whatever your relay's envelope rules allow).
Sending from an unverified domain is rejected by the provider or filed as spam by the recipient, and
it is the usual reason a correctly configured transport still produces no mail.

Naming a transport you have not configured — `MAIL_TRANSPORT=smtp` with no server set — falls back
to `log` and warns on the server console. Mail keeps working and stays readable at `/admin/mail`;
it just is not delivered. Check that console line first if sends look successful and no one is
receiving anything.

Addresses at domains the IANA has reserved — `example.com`, anything under `.example`, `.test`,
`.invalid`, `.localhost` — are always handled by the log transport, whatever else is configured.
Nothing can be delivered to them; a real provider would hard-bounce the seeded demo's six hundred
fictional senators and charge every bounce against your sending reputation. Real recipients in the
same run still get real mail.

#### Turning on mail for the hosted demo

The deployment runs `MAIL_TRANSPORT: auto` with no key, so it is on the dev mailbox and one secret
away from real sending. To flip it, in this order:

1. **Verify a sender domain in Resend** — Domains → Add Domain, then publish the DKIM/SPF records it
   gives you and wait for the status to go green. Nothing below works without this.
2. **Point `MAIL_FROM` at that domain** in `wrangler.jsonc`, e.g. `Cicero <cicero@your-domain.tld>`.
   The placeholder there is `onboarding@resend.dev`, Resend's shared test sender: it delivers only
   to the Resend account owner and returns 403 for everyone else. Leave it in place with a key set
   and the app says so on the server console on the first send.
3. **`wrangler secret put RESEND_API_KEY`** and paste the key. A secret, never a `var` — vars in
   `wrangler.jsonc` are committed.
4. Deploy (`bun run cf:deploy`), then confirm the banner at `/admin/mail` names `resend` and send
   yourself something from `/admin/comms`.

Step 3 alone is what changes behaviour, so a key without step 1 sends nothing and a key without
step 2 sends only to you.

#### Letting a visitor in without an inbox

Under a real transport the sign-in page keeps the magic link to itself — printing it is handing out
a session for whatever address was typed in. That would leave a public demo unusable for anyone
without an account, so `DEMO_ONSCREEN_MAGIC_LINKS=1` (set as a var on the deployment, off
everywhere else) re-opens exactly one narrow path: the link is shown on screen only for an account
that already exists, is at one of the reserved domains above, holds membership on a seeded demo
event, and holds membership on no other event it does not itself own. Every real organizer,
reviewer and speaker fails the domain test, so no real account is reachable through it at any
setting. The sign-in page offers `DEMO_SIGNIN_EMAIL` (default `organizer@example.com`) as the way
in. `lib/demo-access.ts` carries the full threat model.

Leave it off on any instance running a real event.

### The two test suites

`npm test` is the fast one and needs nothing: everything it touches is either pure or mocked at the
service boundary. Keep it that way — it is what makes the suite runnable on any checkout.

`bun run test:integration` runs `*.integration.test.ts` against a real Postgres, because the rules
worth calling security — who may read a submission, whether an anonymized round actually withholds
the author, whether blind review actually withholds a peer — are enforced in SQL, and a mocked
database will agree with whatever the test expects. Each test builds its own event and tears it
down, so no ordering or truncation is implied.

```bash
docker compose up -d postgres          # or any Postgres you like
export DATABASE_URL=postgresql://cicero:cicero@localhost:5434/cicero_test
bun run db:migrate
bun run test:integration
```

Point `DATABASE_URL` at a throwaway database. The suite writes real rows, and while it cleans up
after each test, it is not something to aim at a database you care about.

## What's in it

**Call for speakers.** A drag-and-drop form builder over a hybrid schema: title, description,
format, track, level and tags are real Postgres columns — so the review queue sorts on them and the
agenda joins on them — while everything a form adds lands in JSONB. Conditional questions,
multi-step public runtime, per-submitter limits, drafts, character limits with a live counter, file
questions, CSV export.

**Review.** Rounds with assignments, weighted scorecard criteria, auto-distribution across
reviewers, blind-until-close and author-anonymized modes, recusal, reviewer workload reporting, and
a reviewer surface that shows a reviewer their assignments and nothing else — no accept/decline
controls, no event configuration.

![The review queue, sorted by score, with keyboard shortcuts along the bottom](docs/images/review-queue.jpg)

**Speaker portal.** Magic-link sign-in, profile and headshot, deliverable uploads that version
rather than overwrite, review comments that reach the speaker, tasks with reminder cadences, custom
portal pages, group access.

**Agenda.** Drag sessions onto a day/room grid with conflict detection for room clashes, track
clashes and — the one the brief doesn't ask for — **speaker double-booking**, which is the clash
that fails publicly on the day. Clashes are saved and listed as warnings by default, because a
programme is built by passing through invalid intermediate states; an organizer who wants the
stricter behaviour turns on **Block clashes on save** and room and speaker double-bookings are then
refused outright.

**Post-conference recordings.** **Admin → Recordings** attaches a bounded video upload, an existing
event video, or an HTTPS streaming URL to a session. Media stays draft until an organizer publishes
it after the session ends; only then do public programme pages and embeds show **Watch recording**.
Replacing the source unpublishes it automatically. Full-length recordings should use a streaming
host—the through-app upload is intentionally capped at 25 MB.

![The agenda grid, with the unscheduled rail on the left and a clash banner above it](docs/images/agenda.jpg)

**Comms.** Branded templates, a send log, and a real `.ics` `METHOD:REQUEST` that bumps `SEQUENCE`
so a reschedule *updates the existing calendar entry in place* rather than adding a second one.

![The mailbox, showing a rendered reminder with its links pulled out](docs/images/mailbox.jpg)

**Public surfaces and embeds.** Sessions list, speakers directory, agenda grid, schedule itinerary,
speaker gallery, sponsor wall, and a static PDF exhibitor map — all server-rendered, all readable
with no account, each with a copyable embed snippet. Program widgets support per-embed filters and
styling; the exhibitor map displays the organizer's uploaded PDF as-is. Every embed is an
auto-resizing iframe over a live route, so "updates without re-pasting the snippet" comes for free.

**Integrations.** A rate-limited public REST API with read/write event keys and a generated
[`docs/openapi.json`](docs/openapi.json) schema, a Streamable HTTP MCP server with a generated
[`docs/mcp-tools.json`](docs/mcp-tools.json) manifest, signed lifecycle webhooks with a delivery
log, an Accelevents speaker-push client, and a one-way Airtable mirror. The
[Accelevents demo](docs/accelevents-demo.md) also includes a deterministic fixture adapter that
previews and applies a full published-program create/update/delete/no-op sync without claiming
undocumented live Accelevents capabilities.

An MCP client connects to `/api/v1/events/{event-slug}/mcp` with an event API key as its Bearer
token. The endpoint exposes event, session, speaker, agenda, and submission reads plus program
reconciliation and an event-scoped agent-mail surface. Mail tools can inspect templates and
redacted delivery metadata, then preview one existing participant against one template. Sending
requires a write key, the preview's exact target-specific confirmation literal, and its
content-bound digest; the service rechecks the recipient, template and email preference before an
email enters the ordinary audited transport. It never accepts an arbitrary address or sends SMS.
A read-only key can discover every tool but the server refuses both writes. `bun run docs:mcp`
regenerates the checked-in manifest from the same Zod schemas used at runtime.

### Bonus: use Cicero through role-scoped agents

These four surfaces are extra value beyond the required replacement scope:

- **Onboarding guide** — `onboard-cicero` keeps a non-secret local record of the chosen host,
  account readiness, exact event slug, API-key readiness, and completed setup milestones. It
  resumes at the first unfinished step and hands ongoing work to the organizer agent instead of
  becoming a second front end.
- **Viewer agent** — `explore-cicero-event` searches public event metadata, open CFPs, sessions,
  speakers, and agenda data without a credential. Structured filters and pagination make the same
  surface useful to a public assistant or another website.
- **Speaker agent** — `manage-cicero-speaker-work` reads and changes only the signed-in speaker's
  proposals, event profile, and onboarding tasks. Private reads and every write require that
  speaker's session; withdrawal carries an additional destructive confirmation.
- **Inbound Accelevents bonus** — when the deployed OpenAPI advertises the program reconcile
  operation, an Accelevents-shaped collection can be previewed and atomically applied to Cicero.
  This is separate from the required outbound accepted-speaker push.
- **Organizer agent** — the existing `manage-cicero-event` skill turns either an event spec or
  Accelevents-shaped payload into a compare → preview → confirm → apply → verify workflow, using an
  event-scoped integration key with destructive confirmation and rollback guidance.

Codex loads repository skills from `.agents/skills` at the repository root. Invoke
`$onboard-cicero`, `$explore-cicero-event`, `$manage-cicero-speaker-work`, or
`$manage-cicero-event` explicitly. Onboarding starts or resumes from
`.cicero/onboarding.json`; the role-scoped agents discover the live OpenAPI before acting and stop
cleanly when a deployment lacks the required operation. See the organizer workflow's
[`First Settlement copy-ready prompt`](.agents/skills/manage-cicero-event/references/first-settlement-demo.md).
The discovery location and `$skill-name` invocation follow the
[official Codex skills documentation](https://developers.openai.com/codex/build-skills#where-codex-loads-local-skills).

## Deployment

**Vercel** is where the demo above runs. It is a stock Next build — no adapter, no config beyond
`vercel.json`:

```bash
vercel link
vercel env add DATABASE_URL production     # a POOLED Postgres URL
vercel deploy --prod
```

`vercel.json` schedules `GET /api/cron` daily. Vercel's Hobby plan **rejects any cron running more
than once a day at deploy time**, so an hourly schedule fails the build outright; hourly parity is
either Pro or any external scheduler hitting that route with `Authorization: Bearer $CRON_SECRET`.
The reminder jobs are idempotent and evaluate their own due times, so a coarser tick delays
delivery rather than duplicating or corrupting it.

**Cloudflare Workers** also builds from this same tree, via `@opennextjs/cloudflare`:

```bash
wrangler hyperdrive create cicero --connection-string="<your-direct-postgres-url>"
# put the returned id in wrangler.jsonc
bun run cf:deploy
```

This path is complete and current — it is not a leftover. `bun run cf:build` succeeds, and the
bundle weighs **3.42 MiB gzipped** (`wrangler deploy --dry-run`, 2026-08-16). That fits **Workers
Paid**'s 10 MiB ceiling about three times over, so on a paid account the deploy above is all there
is to it.

On the **free** tier it misses the 3 MiB ceiling by roughly 14% and the API rejects the upload with
error 10027. We chose not to put a $5/month subscription behind a demo for this challenge, so the
hosted instance runs on Vercel instead — a billing decision, not a technical one, and reversible by
upgrading the plan without editing a file.
[`docs/02-architecture.md`](docs/02-architecture.md) §1 records the decision and what it cost.

Any Postgres works — Neon, Supabase, RDS, your own box. On Workers, Hyperdrive pools the connection
at the edge; everywhere else a pooled `DATABASE_URL` does the same job. Either way it is **the same
`pg` driver and the same Drizzle schema** a self-hosted container uses. That is deliberate, and it
is what let the host change without touching a line of application code.

R2 is off by default, because enabling it requires a payment method on the Cloudflare account and
that is a bad thing to demand of someone cloning an open-source project. Uploads fall back to the
database until you turn it on; `wrangler.jsonc` says exactly how. Treat that database backend as a
small-deployment convenience, not an object store: individual uploads are capped at 25 MiB, every
byte inflates the primary database and every full backup, and files are served through the Worker
and Hyperdrive rather than a storage CDN. The Files screen warns at 250 MiB of database blobs and
uses 500 MiB as the practical handoff point to R2/S3. Those are operating limits, not Postgres hard
limits; configure a bucket earlier for frequent decks, video, or a multi-event archive.

The Worker also has an hourly Cron Trigger. `custom-worker.ts` keeps OpenNext's generated request
handler and adds a scheduled handler that dispatches task and draft-deadline reminders through
`/api/cron` in-process. Self-hosters can call that route from their own timer; set `CRON_SECRET` and
send it as a bearer token when the route is exposed publicly. Each reminder job is idempotent, so
Cloudflare's at-least-once delivery does not intentionally duplicate messages.

One thing to know before you deploy this yourself: **`next build` reads `.env` and inlines what it
finds into the bundle**, so a `.env` sitting in the working directory at build time ships baked into
the deployed artifact. Keep secrets in `wrangler secret put` (or `vercel env add`), and check that
`.env` holds only local development values before you build.

## Judgment calls worth arguing about

The competition's tiebreaker is "whoever made the subjective judgment calls for the product we would
actually use." These are ours, stated out loud rather than buried.

- **Magic links for every role. No passwords anywhere.** Sessionboard makes participants keep a
  password for a site they visit twice a year. They forget it, and the organizer becomes a help
  desk.
- **Impersonation, not preview.** The organizer's session carries `impersonated_by` and every write
  goes through *as the speaker* while staying attributable. A read-only "view as" is useless for
  support — the point is to finish the stuck speaker's task for them.
- **Speaker double-booking detection.** A room clash is a spreadsheet error someone catches. A
  speaker booked in two rooms at once is a failure the audience watches happen.
- **Calendar invites that update in place.** A real `METHOD:REQUEST` with a bumped `SEQUENCE`, so
  moving a talk to Thursday moves the entry already in the speaker's calendar. An add-to-calendar
  link, which is the usual reading of this requirement, ships as well, but it leaves the old slot
  sitting there after every reschedule.
- **The outstanding-task dashboard.** Sessionboard's own FAQ says it has no central
  task-completion report. This is the place we add something missing rather than clone something
  present.
- **Airtable as a one-way mirror, not the store.** Airtable carries a larger bonus than Cloudflare
  in the brief, and building on it as the primary database would have been the easy way to claim
  that. But with no transactions, no joins and a 5-request-per-second ceiling, agenda conflict
  detection stops being implementable. So submissions, speakers and the agenda *push* to a
  configurable base, their team gets Airtable views over live data, and the product stays correct.
- **A form engine we wrote.** Every off-the-shelf builder assumes it owns the entire schema and
  emits one blob; ours needs six fields to be real columns. Between that and the licensing (SurveyJS's
  builder is per-developer commercial, HeyForm/OpnForm/Formbricks are AGPL, form.io hard-depends on
  Bootstrap), renting the schema-walking loop would have cost 300KB–1MB to save about eighty lines.
  `docs/02-architecture.md` shows the full survey.
- **`showIf` may reference only an earlier field, one hop, no chaining**, and hidden fields clear at
  submit. A documented limit that deletes the cyclic- and cascading-condition bug class by
  construction, rather than a gap.

## How it is built

Next.js 15 App Router, React 19, TypeScript, Drizzle over Postgres, Zod as the API contract, plain
CSS Modules over a hand-built design system. No Tailwind, no component library, no rich-text editor
— Markdown with a live preview instead, which is what power users want and has no XSS surface.

Three layers, strictly:

```
app/api/v1/**      REST handlers — thin, Zod-validated, API-key auth
app/**             Server Components read; Server Actions write — thin
lib/services/**    all domain logic. Pure TS. No HTTP, no React, no Next imports
db/**              Drizzle schema, migrations, seed
```

The UI never calls its own HTTP API; both entry points call the same service function. Every table
is event-scoped from the first migration, so a judge's cold-created event and the seeded demo
coexist without either seeing the other.

## Documentation

1. **[`docs/00-goals.md`](docs/00-goals.md)** — what we are building and why, in prose
2. **[`docs/01-requirements.md`](docs/01-requirements.md)** — every requirement and deliverable,
   tagged `[REQUIRED]` / `[IMPORTANT]` / `[OPTIONAL]` / `[EXCLUDED]` / `[BONUS]`
3. **[`docs/02-architecture.md`](docs/02-architecture.md)** — hosting, the stack, the database and
   API layers, and the form-engine and integration decisions
4. **[`docs/03-plan.md`](docs/03-plan.md)** — the spine, the tiered scope, and the verification plan
5. **[`docs/04-adversarial-test-plan.md`](docs/04-adversarial-test-plan.md)** — the hostile-input
   matrix, current implementation audit, and safe execution gate for adversarial testing
6. **[`docs/04-demo-runbook.md`](docs/04-demo-runbook.md)** — the presenter-ready walkthrough,
   requirement traceability, API bonus, fallbacks, resets, and go/no-go checks
7. **[`docs/04-user-roles-and-actions.md`](docs/04-user-roles-and-actions.md)** — the actor model,
   what each role can and cannot do, and the permission matrix
8. **[`docs/05-additional-requirements.md`](docs/05-additional-requirements.md)** — requirements
   added by the owner after the brief was frozen, with build status per row and what the optional
   add-ons cost a self-hoster
9. **[`docs/openapi.json`](docs/openapi.json)** — the generated OpenAPI 3.1 schema for the public API
10. **[`docs/mcp-tools.json`](docs/mcp-tools.json)** — the generated MCP tool manifest

Alongside those, two unnumbered companions:

- [`docs/requirements-audit-checklist.md`](docs/requirements-audit-checklist.md) — every requirement
  ID from `01-requirements.md` audited COMPLETE / PARTIAL / OUTSTANDING against a pinned revision
- [`docs/decisions-long-form.md`](docs/decisions-long-form.md) — the narrative rationale: why the
  product was scoped, built and named the way it was, including what was deliberately not built

### Reference material

- [`docs/reference/source-brief.txt`](docs/reference/source-brief.txt) — the competition brief,
  extracted verbatim, with screenshot positions marked inline
- [`docs/reference/screenshots/`](docs/reference/screenshots/README.md) — all 42 screenshots from
  the brief, filed by section, with the author's hand-drawn priority annotations catalogued
- [`docs/reference/sessionboard-survey.md`](docs/reference/sessionboard-survey.md) — an independent
  inventory of the real Sessionboard product. **Not a scope list**
- [`docs/reference/accelevents-api.md`](docs/reference/accelevents-api.md) — the Accelevents speaker
  and attendee API contract Cicero depends on, its documented inconsistencies, and verification
  steps

`docs/00-goals.md` and `docs/01-requirements.md` are derived **only** from the competition brief and
its screenshots — nothing is inferred from Sessionboard's own documentation. Where the brief was
silent or contradicted itself, the requirements doc records the decision and its reasoning under
*Resolved ambiguities* rather than leaving a hole. Anything the owner wanted afterwards lives in
`docs/05-additional-requirements.md` instead, so the brief-derived reading stays a faithful record
of what the competition actually asked for.

The survey was produced by a separate agent with no access to the brief or to either spec document,
working only from Sessionboard's public sources. The two derivations never touched. It exists as a
coverage check: anything it documents that the requirements never mention is either something the
AI Engineer team deliberately does not use, or a gap in our reading. It is deliberately much larger
than the spec — the brief says outright that most of Sessionboard is not needed.

## Known gaps

Stated plainly, because a README that claims everything works is one a judge stops trusting at the
first dead end.

- **Accelevents** publishes per-endpoint OpenAPI fragments but no combined specification. The
  speaker push is implemented against the verified pages. Attendee creation is a five-call order
  flow with no documented complimentary flag, so it ships behind the same interface marked
  experimental. The auth header name is genuinely ambiguous in their docs —
  `ACCELEVENTS_AUTH_HEADER` defaults to `Authorization` and the client retries once with `Key` on a
  401. The focused contract and remaining live-verification items are in
  [`docs/reference/accelevents-api.md`](docs/reference/accelevents-api.md).
- **AI features** (review assist, agenda suggestions) stay on the screen when `ANTHROPIC_API_KEY` is
  unset. Each says so and falls back — a rule-based reader for the review, a deterministic
  earliest-free-slot planner for the agenda. Hiding an unconfigured feature hides the shape of it,
  and the shape is the point: they propose, they never decide. The demo runs without a key.
- **The demo no longer runs on Cloudflare, and the CPU ceiling that used to break it is gone.**
  On the Workers free plan a 10ms-per-request CPU cap meant a dense admin page on a cold isolate
  answered `error code: 1102` with a 503 — roughly one navigation in eight. Nothing in the code can
  render an admin table in 10ms of CPU, so that was never fixable in the app. The demo now runs on
  Vercel, which has no such quota. For scale rather than for the cap: `bun run bench` measures a
  self-hosted `docker compose up` at 41–58ms p50 with a zero error rate across 7000 requests to the
  five public routes, and 29–46ms of server CPU per rendered page — which is where a 10ms budget
  went. [`docs/performance-benchmark.md`](docs/performance-benchmark.md) has the method and the
  numbers, and [`docs/02-architecture.md`](docs/02-architecture.md) §1 records why the host changed.
- **The compose screen can't address one named person.** `manual` is a real audience kind in the
  service layer (`lib/services/comms.ts:293`) and the MCP surface reaches it, but it is not
  selectable in [`app/admin/comms/Composer.tsx`](app/admin/comms/Composer.tsx) — every send from
  that screen goes to a computed group. This bullet used to also claim reviewers could only be added
  by role; that stopped being true once `inviteReviewerAction`
  (`app/admin/submissions/rounds/actions.ts:67`) and per-submission `assignReviewers`
  (`app/admin/submissions/actions.ts:167`) shipped, and both work today.
- **The embed builder exports HTML and an iframe snippet only.** JSON, XML and iCal exports of the
  same data are reachable through the REST API but have no button in the embed admin.
