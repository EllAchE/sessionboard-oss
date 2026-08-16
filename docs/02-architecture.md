# Architecture

How we build what [`00-goals.md`](00-goals.md) describes and
[`01-requirements.md`](01-requirements.md) enumerates. Those two stay the source of truth for
*what*; this file covers *how* and, where the choice was contested, *why*. Requirement IDs below
refer to `01-requirements.md`.

The product is named **Cicero**, after the design system built for it.

## 1. Hosting — the fallback got called

> **Cloudflare Workers is a first-class, supported deployment target. Production currently runs on
> Vercel as of 2026-08-15 — a billing choice, not a technical one.**
>
> `bun run cf:build` completes cleanly from this tree and `bun run cf:deploy` is wired end to end.
> The bundle weighs **3.42 MiB gzipped** (`wrangler deploy --dry-run`, measured 2026-08-16), which
> clears **Workers Paid**'s 10 MiB ceiling with about three times the headroom and misses the
> **free** tier's 3 MiB ceiling by roughly 14%. We declined the $5/month upgrade for the duration of
> this challenge rather than put a subscription behind a demo, so the free tier rejects the upload
> with API error 10027 and the running instance is on Vercel instead.
>
> Nothing about the Cloudflare path was removed, stubbed, or left to rot: `wrangler.jsonc`,
> `custom-worker.ts`, `open-next.config.ts`, the Hyperdrive binding and the `cf:build` / `cf:preview`
> / `cf:deploy` scripts are all present and current. Everything in this section describing Cloudflare
> is accurate for anyone deploying there today. See
> [The fallback got called](#the-fallback-got-called-2026-08-15) below for the full numbers.

Design-time primary target was **Cloudflare Workers** via the OpenNext adapter. Self-host is a
supported secondary target, not the thing the architecture bends around.

| Concern | Cloudflare | Vercel (production) | Self-host |
| --- | --- | --- | --- |
| Runtime | Workers, `@opennextjs/cloudflare` | Node 22 serverless, stock `next build` | Node 22 container, `next start` |
| Database | Neon Postgres via **Hyperdrive** | Neon Postgres via `DATABASE_URL` | Postgres 16 in `docker-compose` |
| DB driver | `pg` + `drizzle-orm/node-postgres` | **the same two packages** | **the same two packages** |
| File storage | Postgres by default, R2 binding when bound | Postgres `file_blob` | MinIO, or any S3 endpoint |
| Email | Resend HTTP API | Resend HTTP API | SMTP via nodemailer |
| Scheduled sends | Hourly Cron Trigger → custom Worker → `/api/cron` in-process | Vercel Cron → `GET /api/cron` | any cron hitting `/api/cron` |

`wrangler.jsonc` points at `custom-worker.ts`, which preserves OpenNext's generated `fetch` handler
and adds Cloudflare's module-format `scheduled` handler. The hourly trigger calls that fetch handler
in-process at `/api/cron`; this establishes OpenNext's request-local Hyperdrive context without a
public loopback request. The same route remains the self-hosted scheduler contract. Reminder jobs
carry durable idempotency guards because Cron Trigger delivery is at least once. This is the
documented [OpenNext custom Worker](https://opennext.js.org/cloudflare/howtos/custom-worker) shape
with a [`triggers.crons`](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
schedule owned by Wrangler.

**File storage defaults to the database, not R2.** `lib/storage` resolves in three steps — the `FILES`
R2 binding if present, then an `S3_BUCKET` if configured, then a `file_blob` row. R2 would be the
better store, but it cannot be enabled on a Cloudflare account without a payment method on file, and
an open-source project that demands a credit card before it will run is a worse product than one
that keeps a few headshots in Postgres. The binding always wins where it exists, so turning R2 on is
uncommenting two config blocks and changes no code. Same reasoning drops the R2 ISR cache: nearly
every route is dynamic and per-event, so there is little to persist.

The Postgres backend is intentionally bounded in product terms even though `bytea` itself permits
more: one upload is capped at 25 MiB, the admin Files screen warns when deployment-wide blobs reach
250 MiB, and 500 MiB is the practical handoff point to R2/S3. Database blobs enlarge the primary and
every full backup, while reads traverse the Worker and Hyperdrive instead of an object CDN. The two
numbers are operating guidance, chosen around common free database quotas, not engine limits.

**One event-profile image model.** A published or portal speaker image is always
`participant.headshotFileId`, pointing at controlled bytes in the configured `Storage`. Both
speaker pickers center-crop and re-encode to a 512×512 WebP in the browser, then the upload route
verifies the stored bytes' format, dimensions and 1 MiB ceiling. This keeps image processing out of
the Worker runtime and makes that one asset suitable for the detail page and roster thumbnail.
`contact.headshotUrl` remains only a CRM discovery/source reference: adding the contact to an event
copies profile text but does not hotlink the external image. The explicit conversion is to open the
source link, download the image, open the new event speaker, choose the downloaded file in the photo
uploader, and let the normalizer create the canonical stored copy.

### Why Postgres, and why this is the load-bearing decision

Hyperdrive pools TCP connections at the edge, so on Workers we use **`drizzle-orm/node-postgres`
with a `Pool` built from `env.HYPERDRIVE.connectionString`** — the identical driver and identical
Drizzle schema a self-hosted container uses against local Postgres. Deliberately *not* the Neon HTTP
driver: Neon's own docs now steer to Hyperdrive, it is roughly 30–40% faster than HTTP mode, and
critically it keeps one code path instead of two.

Two details of that sentence are load-bearing, and the spike caught both the hard way (`db/client.ts`):

- **The binding is per-request, never a global.** Workers does not put bindings on `globalThis`; they
  arrive on a request-scoped context read through `getCloudflareContext()`, which *throws* when there
  is no request — under `next start`, `tsx` and vitest. That throw is the self-hosted path, not an
  error, so it is caught and falls through to `DATABASE_URL`.
- **The pool is not shared across requests on Workers.** A workerd socket belongs to the request that
  opened it, so a module-scoped `Pool` survives onto the next request on a warm isolate and every
  query on it hangs until the runtime cancels it — an every-other-request 500. On Workers we open one
  short-lived connection per request, which is the right shape anyway because Hyperdrive *is* the
  pool. Self-hosted, the cached pool is kept, because there it is correct.

That is what makes the hosting choice **reversible**, and reversibility is the point. Postgres,
S3-compatible storage and HTTP email are all host-agnostic. If Workers turns hostile at hour six we
redeploy to Vercel or Fly and lose exactly one thing — the `Z-1` bonus, which the brief itself calls
"mild." Nothing else in the codebase changes.

The rejected alternative makes the argument concrete. SQLite plus `better-sqlite3` plus local disk
would have been faster to stand up and would have turned that same fallback into a rewrite: a
different driver, a different storage story, and a migration of every query. We are trading a small
amount of day-one setup for the ability to abandon the primary host without abandoning the work.
On a deadline where the deployed site is a hard deliverable (`D-3`), an escape hatch is worth more
than a head start.

### The fallback got called (2026-08-15)

The paragraph above was written speculatively. It cashed out, and the honest version of the story is
that we were wrong about *which* limit would bite.

`bun run cf:deploy` fails:

```
✘ A request to the Cloudflare API (.../workers/scripts/cicero/versions) failed.
  Your Worker exceeded the size limit of 3 MiB. Please upgrade to a paid plan
  to deploy Workers up to 10 MiB. [code: 10027]
```

**Corrected 2026-08-16.** This paragraph previously read "13.4 MiB uncompressed against a 3 MiB
free-tier ceiling … Workers Paid's 10 MiB ceiling would not have fit it either." Both halves were
wrong, and in a way that made the Cloudflare path look far more dead than it is. Cloudflare measures
the **gzipped** upload, so quoting an uncompressed figure against a compressed limit compares two
different things. `bunx wrangler deploy --dry-run` reports what the API actually weighs:

```
Total Upload: 19499.98 KiB / gzip: 3499.68 KiB
```

**3.42 MiB gzipped.** Against the free tier's 3 MiB that is a miss of about 14% — a near miss, not
the 4.5× blowout the old wording implied. Against Workers Paid's 10 MiB it fits with roughly three
times the headroom, so the claim that Paid "would not have fit it either without splitting the
bundle" was simply false. `bun run cf:build` completes cleanly; nothing here is broken, and no
bundle splitting is required to take the paid path.

The pre-deploy spike at [§1's gate](#the-spike-that-de-risks-it) proved a *hello-world* deploys to
Workers, which is exactly the thing a bundle-size limit cannot be tested by. That is the lesson
worth keeping: the spike validated the integration and told us nothing about the constraint that
actually stopped us — and the follow-on lesson is this correction, that we then misdescribed the
constraint for a day by measuring it in the wrong units.

The failure mode was quiet in a way worth recording. Deploys had been failing rather than not being
run, so production silently stayed on a pre-2026-08-13 build for two days — 8 API paths live against
20 on `main`, and every magic link it issued pointed at a hostname that no longer resolves.

**What we declined.** Workers Paid is $5/month and raises the ceiling to 10 MiB with 30s CPU per
request. Measured rather than assumed, it **does** carry this bundle — 3.42 MiB against 10 MiB — and
it would keep `Z-1` and close the 10ms CPU defect in the same $5. That is a real option and a cheap
one, and it stays one line away: upgrade the plan and run `bun run cf:deploy`, with no change to any
file in this repo. We passed on it because `Z-1` is a **"mild"** bonus by the brief's own wording
(`01-requirements.md`) and paying a subscription to keep a mild bonus is the wrong trade for a
project whose README asks a stranger to clone and run it. A reader who wants `Z-1` should upgrade
the plan — nothing in this repo has to change to take that path, which is the same reversibility
claim as before, pointing the other way.

**What the move actually cost, in full:**

- `Z-1` (the Cloudflare bonus) is not met by the deployed instance.
- **Hyperdrive is gone**, so Postgres connections are no longer pooled at the edge. `db/client.ts`
  falls through to its `DATABASE_URL` branch with the module-scoped `nodePool` — correct for Node,
  and the reason no code changed. Use a Neon **pooled** connection string here; the direct one will
  exhaust connections under serverless fan-out.
- **Cron parity degrades on Vercel Hobby**, which rejects any schedule running more than once a day
  *at deploy time* — an hourly `0 * * * *` fails the build outright. `vercel.json` therefore
  schedules `0 8 * * *`, and Hobby may fire it anywhere inside that hour. Reminder jobs already
  carry durable idempotency guards and evaluate their own due times, so a coarser tick delays
  delivery rather than corrupting it. Restoring hourly is either Vercel Pro or any external
  scheduler hitting `GET /api/cron` with `Authorization: Bearer $CRON_SECRET`.

**What did not change:** no application code. `db/client.ts`, `lib/env.ts` and `lib/storage` each
already had a non-Cloudflare branch reached by catching `getCloudflareContext()`'s throw, and R2 was
never enabled, so uploads were already going to the `file_blob` table. The only repo changes are
`vercel.json`, moving `@opennextjs/cloudflare` from `devDependencies` to `dependencies` (runtime
modules import it, so Vercel's file tracing must see it as one), and this section. `wrangler.jsonc`
and `custom-worker.ts` are untouched and still correct.

### The spike that de-risks it

**First 45 minutes of W0, before any feature work:** deploy a hello-world Next 15 app through
`@opennextjs/cloudflare` to `*.workers.dev`, with Hyperdrive bound and one real `SELECT` rendering
server-side. If that is not green in 60 minutes, we ship on Vercel and stop paying attention to
`Z-1`. This is a gate, not an aspiration — see [`03-plan.md`](03-plan.md) for where it sits on the
clock.

### Self-host still ships (`T-3`)

```bash
docker compose up      # app + postgres + minio, one command
```

`T-3` is a REQUIRED row and the repo is the product's whole point, so the compose file and its
README section are real and tested. They are just no longer the constraint that decides the stack.

## 2. Language and frameworks

Every dependency is MIT or Apache licensed and adds a capability we would otherwise hand-write
badly.

| Concern | Choice | Why this and not the obvious alternative |
| --- | --- | --- |
| Framework | Next.js 15 App Router, React 19 | RSC renders the dense admin tables server-side with near-zero client JS — that *is* the `Z-4` speed bonus |
| DB access | Drizzle ORM + `pg` | Same driver on Workers (via Hyperdrive) and Node. One schema, one migration path |
| Validation | Zod | One schema per entity, shared by REST handlers, Server Actions and client forms. **The Zod schemas are the API contract** |
| Styling | Plain CSS + CSS Modules over the Cicero tokens | The design system uses no Tailwind, no shadcn, no Radix. Introducing any means fighting it |
| Icons | `lucide-react` | Already the design system's icon set |
| Drag & drop | `@dnd-kit/core` + `/sortable` | Headless, no stylesheet to override. Powers `A-1` and the form builder |
| Rich text | Markdown textarea + live preview | Tiptap is ~100KB and half a day. Markdown is what power users want, has no XSS surface, and renders identically in email and embeds |
| Email | Resend HTTP behind a `MailTransport` interface | Three impls: `resend`, `smtp`, `log`. Workers cannot open SMTP sockets; self-host should not need an API key |
| Calendar | Hand-written VCALENDAR, ~80 lines | No npm package does `METHOD:REQUEST` with `SEQUENCE` bumping correctly, which is the hard half of `C-3` |
| Fonts | `next/font/local` over the extracted woff2 | Self-hosted, no runtime Google request, no layout shift |
| AI features | Anthropic SDK, `claude-sonnet-5` | Powers `V-9` and `A-8`; degrades to disabled when no key is set |

## 3. Database layer

Postgres 16. Drizzle migrations live in `db/migrations/` and are applied by a `predeploy` step.
Workers cannot run migrations at boot the way a container entrypoint can — this is the one
operational difference between the two targets, and it resolves to a `package.json` script.

### Event scoping is not optional

**Every table is event-scoped from day one.** `E-6` (multi-event) is tagged OPTIONAL but the scoping
underneath it is not: `D-3` requires that a judge's cold-created event coexists with the seeded demo
without either clobbering the other. Retrofitting `event_id` across a live schema is a rewrite;
adding it now is a column. Since the optional rows ship anyway (see [`03-plan.md`](03-plan.md)), the
event switcher comes nearly free on top of scoping we needed regardless.

Human-readable refs (`SESS-4`, `ABS-12`) are per-event counters surfaced everywhere. `S-5` calls for
them and power users navigate by them.

### Table inventory

```
event · track · room · tag · session_format · persona · field_library_entry
user · membership(user,event,role) · magic_token · session_cookie(+impersonated_by)
form · form_field · submission · submission_tag · participant · participant_role · profile
review_round · review_assignment · score · scorecard_criterion
scheduled_session · session_recording(file XOR external HTTPS URL, published_at)
task · task_assignment · file · file_request
portal_page · portal_theme · email_template · email_log
api_key · accelevents_sync · airtable_sync · saved_view
```

The `role` on `membership` is only the organizer/speaker/reviewer distinction that `T-4` depends on.
It is not a permissions matrix — `E-8` (Sessionboard's role-based admin permission grid) stays
excluded, and nothing reads `role` beyond deciding which surface a session may enter.

### `submission` is the hybrid table, and the one to get right

Title, description, format, track, level and status are **real columns**. Not JSON, not an EAV side
table. The review queue sorts on them, the agenda joins on them, conflict detection compares them,
and the embeds filter on them — every one of those is a query that becomes slow, untyped or
unwritable if the value lives inside a blob.

Everything a form adds beyond those built-ins lands in an `answers` JSONB column, where it is only
ever read back whole, per submission, on a detail screen or a CSV export. That is the access pattern
JSONB is good at.

The split is therefore not a compromise between two designs; it follows from two genuinely different
access patterns living in the same row. Section 5 explains why no off-the-shelf form engine can
express it.

### Post-conference recordings stay behind two publication gates

`session_recording` is a one-to-one child of `scheduled_session`, not a URL column on the public
programme. Its source is either an event-scoped `file` row or a validated credential-free HTTPS
URL, enforced as an exclusive pair by a database check. `published_at` is independent of the
session's agenda status: attaching or replacing media leaves it draft, and publication is refused
until the public session has ended. A past event end substitutes for a missing session time so
historical imports are not stranded.

The in-app upload stays at 25 MB and uses the existing `Storage` abstraction. This keeps Worker and
Postgres memory bounded to the same ceiling as other uploads; full-length masters belong on a
streaming host and are associated by URL. Stored public playback is still an application route,
not a presigned object: it rechecks event ownership, recording publication, session publication,
and submission-content approval before returning the storage stream.

### `email_log` doubles as the dev mailbox

With `MAIL_TRANSPORT=log` — or alongside any real transport — every send is recorded and
`/admin/mail` renders it. That single choice satisfies `T-7a` and removes email deliverability as a
single point of failure during judging. A judge who never receives a message can still see it.

### Reserved recipients are why `T-6` and `T-7a` can both hold

`T-6` wants real mail leaving the deployed instance. `T-7a` wants a visitor with no mailbox on it to
sign in anyway, which the product does by printing the magic link on the sign-in page — and printing
a magic link is handing out a session for whatever address was typed into the box. Under a real
transport those two are in direct conflict, which is what kept the deployment on `log`.

The resolution is that the demo identities are undeliverable *by construction*, rather than delivery
being off for everyone. Both seeds are built entirely from IANA-reserved domains
(`organizer@example.com`, the senate at `@first-settlement.example`), and `sendMail` routes any
recipient at a reserved domain to the log transport whatever else is configured — real addresses in
the same run still get real mail, and the provider is never asked to bounce six hundred fictional
senators. An on-screen link for such an address therefore cannot lock a real person out of anything,
because no mailbox behind it can exist.

That property is one of four conditions. `lib/demo-access.ts` is the single place the decision is
made and carries the threat model in full: an explicit default-off flag, the reserved-domain test,
an existing account holding demo-event membership, and no membership on any event outside the demo
it does not own. A failed send is deliberately *not* a condition — revealing the link whenever a
provider says no would be an authentication bypass triggerable by a stranger with a bounce.

## 4. Design system

The Cicero design system is landed by a separate session before any feature work starts, driven
entirely by [`handoff/design-system.md`](handoff/design-system.md). That document is self-contained
and authoritative: the verbatim token dump, the 21-component catalog, the woff2 inventory, the
dark-mode rule, and the acceptance criteria. It is not reproduced here.

What matters architecturally is only this: `components/ui/` must exist and be frozen before eight
agents start, or eight agents invent eight different buttons. Styling is plain CSS Modules reading
`var(--…)` tokens — no Tailwind, no shadcn, no Radix, no CSS-in-JS. Any feature workstream that
wants a new primitive routes the request rather than adding one.

## 5. API contracts — the parallelization boundary

Three layers, strictly:

```
app/api/v1/**      REST handlers — thin, Zod-validated, auth'd by API key
app/**             Server Components read; Server Actions write — thin
lib/services/**    ALL domain logic. Pure TS. No HTTP, no React, no Next imports
lib/db/**          Drizzle schema + queries
```

The UI never calls its own HTTP API. Both entry points call the same service function, so there is
one implementation of every rule and no drift between what the REST surface enforces and what the
admin screens enforce.

**Two files break the "no React, no Next imports" line, and it is worth naming them rather than
letting the rule read as absolute** (audited 2026-08-16; these are the only two in `lib/services`):

- `lib/services/submissions.ts` imports `cache` from `react`. Deliberate — it is the `Z-4` fix that
  deduplicates repeated reads within a single render pass.
- `lib/services/events.ts` imports `cookies` from `next/headers` to resolve the currently-selected
  event. This one is a genuine leak of a request-scoped concern into the domain layer: it makes
  those two functions unusable from the REST handlers and from any non-request caller. The right
  shape is to take the selected event id as a parameter and let each entry point resolve it. Not
  changed here because the service-signature freeze is still in force; recorded so the next person
  does not have to rediscover it.

**The service layer is what makes parallel agents possible.** `db/schema.ts` and the service
signatures are written first and then frozen, which means every workstream codes against types
instead of against each other. Two agents touching submissions never need to agree on anything at
runtime; they need to agree on a signature that was fixed before either started. The layering is
not architectural taste — it is the mechanism that lets nine workstreams run at once. See
[`03-plan.md`](03-plan.md) for the ownership table that this boundary makes safe.

### Public REST surface (`Z-5`)

Nearly free once the services exist, because handlers are a Zod parse plus a service call.

```
GET  /api/v1/events/:slug
GET  /api/v1/events/:slug/sessions?status=&track=&room=
GET  /api/v1/events/:slug/speakers
GET  /api/v1/events/:slug/sponsors
GET  /api/v1/events/:slug/agenda
GET  /api/v1/events/:slug/submissions          (key-scoped)
POST /api/v1/events/:slug/forms/:formId/submissions
GET  /api/v1/openapi.json                      generated from the Zod schemas
```

Auth is `Authorization: Bearer <key>`, keys are per event, hashed at rest.

### Embeds are server-rendered routes, not a JS widget

`G-1`–`G-3` ship as `/embed/:slug/agenda`, `/embed/:slug/speakers`, `/embed/:slug/sessions`, and
`/embed/:slug/sponsors`. `AR-36` adds `/embed/:slug/exhibitor-map`, which wraps the event's current
PDF map rather than inventing a second interactive floor-plan model. All are served with
`frame-ancestors *`, plus a `<script src="/embed.js">` that injects an auto-resizing iframe. The
requirement that an embed "auto-updates with no re-paste" is then free rather than engineered: the
iframe renders live data on every load, so there is no snapshot to go stale and no client bundle to
version.

The map's stable `/embed/:slug/exhibitor-map/file` route does not expose arbitrary event files. It
joins `event_exhibitor_map` to a `file` with the same event id on every request, sends `no-store`,
and returns 404 after the organizer removes the slot. Upload, replacement, and removal reuse the
same storage service as speaker deliverables; only PDF input with an actual `%PDF-` signature is
accepted.

Sponsor rows add one more structural gate: only `status = published` rows enter the public page,
embed, REST list, navigation presence check, or logo authorization. Changing a row back to draft
therefore removes both its metadata and its image bytes without deleting either.

## 6. The form engine — verdict: BUILD

We surveyed SurveyJS, form.io, `@rjsf/core`, JSONForms, Formily, HeyForm, OpnForm, Formbricks,
`@bpmn-io/form-js` and `@react-form-builder` against three tests: license compatibility with an MIT
repo, restyleability onto Cicero tokens, and whether the hybrid schema above can be expressed.
Every candidate fails at least one; most fail two.

The rejections are recorded here in full because they are the record of a decision someone will
otherwise re-litigate at hour ten.

- **SurveyJS** — the runtime is MIT, but **`survey-creator` is a commercial per-developer seat**
  ($569–$2299/dev). Shipping it in an MIT repo means everyone who clones Cicero needs a license.
  Disqualifying on its own.
- **form.io** — the license scare that circulates about this one is wrong: `@formio/js` is still
  MIT; the *server* went OSL-3.0 and we do not need the server. It dies instead on **Bootstrap as a
  hard dependency**, around 1MB, and an imperative DOM model hostile to RSC.
- **HeyForm / OpnForm / Formbricks** — AGPL-3.0, with proprietary enterprise directories inside.
- **Formily** — the builder (`@formily/designable-antd`) was last published in 2021. Dead.
- **`@bpmn-io/form-js`** — MIT *plus a non-removable watermark clause*. Preact and Carbon CSS.
- **`@rjsf/core` / JSONForms** — the only two that are genuinely restyleable, and **neither has a
  builder**, which is the half we most wanted to rent.

And the decisive point is license-independent, so it would still hold if every row above were clean:
**every engine assumes it owns the whole schema and emits one blob.** Our six built-ins have to be
real Postgres columns for the reasons in section 3. With any engine we would still hand-write the
locked-column enforcement, *and* the builder-UI locking, *and* the theme — while carrying 300KB–1MB
of someone else's runtime. The only thing we would actually be renting is the schema-walking loop,
which is about 80 lines.

**Estimate: 7–9 hours**, tracked in W1: schema and tables 0.75 · field components 2.0 · builder UI
2.0 · conditional logic editor and evaluator 1.0 · multi-step public runtime 1.5 · server action and
upload 1.0 · CSV export 0.5.

### The one constraint that kills a bug class

`showIf` may reference **only earlier fields, one hop, no chaining**, and hidden fields' values are
cleared at submit.

That is a deliberate limit, not a gap, and it should be documented to organizers as one. Arbitrary
conditional graphs bring cycles, cascading re-evaluation order, and fields that are visible by one
path and hidden by another — a class of bug that is expensive to find and worse to find during
judging. Restricting to one backward hop removes all of it by construction rather than by testing.
Clearing hidden values at submit closes the matching data bug, where an answer the respondent never
saw survives into the export.

```ts
export type Condition = {
  fieldId: string;   // must be EARLIER in field order
  op: 'eq' | 'neq' | 'includes' | 'gt' | 'lt' | 'is_empty' | 'not_empty';
  value?: string | number;
};
/** The locked six live in COLUMNS, never in form_field. */
export const BUILTIN_FIELDS = ['title','description','format','tags','track','level'] as const;
```

## 7. Accelevents

The external contract is recorded separately in
[`reference/accelevents-api.md`](reference/accelevents-api.md), including the speaker request and
response fields, error codes, five-step attendee order flow, official source links, and every known
documentation contradiction. That reference stays contract-focused; this section records only the
architectural decision.

`N-1` uses the documented speaker create endpoint because it matches the required one-way program
→ registration flow. Duplicate email is a hard remote rejection rather than an upsert, so Cicero
deduplicates before pushing and never reconciles remote edits back into participant records. The
fixture-backed gateway preserves that behavior when no credential is available.

Attendee creation remains experimental. The vendor exposes a ticket-order sequence rather than a
single create-attendee operation, publishes no complimentary-ticket flag, and has not been tested
from this repository with a live account. The required speaker path does not depend on it.
