# Architecture

How we build what [`00-goals.md`](00-goals.md) describes and
[`01-requirements.md`](01-requirements.md) enumerates. Those two stay the source of truth for
*what*; this file covers *how* and, where the choice was contested, *why*. Requirement IDs below
refer to `01-requirements.md`.

The product is named **Cicero**, after the design system built for it.

## 1. Hosting — Cloudflare, with the fallback pre-paid

Primary target is **Cloudflare Workers** via the OpenNext adapter. Self-host is a supported
secondary target, not the thing the architecture bends around.

| Concern | Cloudflare (primary) | Self-host (secondary) |
| --- | --- | --- |
| Runtime | Workers, `@opennextjs/cloudflare` | Node 22 container, `next start` |
| Database | Neon Postgres via **Hyperdrive** | Postgres 16 in `docker-compose` |
| DB driver | `pg` + `drizzle-orm/node-postgres` | **the same two packages** |
| File storage | R2 via S3 API | MinIO, or any S3 endpoint |
| Email | Resend HTTP API | SMTP via nodemailer |
| Scheduled sends | Cron Triggers → `/api/cron` | any cron hitting `/api/cron` |

`wrangler.jsonc` sets `main: ".open-next/worker.js"`, `nodejs_compat`, and an `[assets]` binding.
`open-next.config.ts` configures the ISR cache handler.

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
scheduled_session
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

### `email_log` doubles as the dev mailbox

With `MAIL_TRANSPORT=log` — or alongside any real transport — every send is recorded and
`/admin/mail` renders it. That single choice satisfies `T-7a` and removes email deliverability as a
single point of failure during judging. A judge who never receives a message can still see it.

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
GET  /api/v1/events/:slug/agenda
GET  /api/v1/events/:slug/submissions          (key-scoped)
POST /api/v1/events/:slug/forms/:formId/submissions
GET  /api/v1/openapi.json                      generated from the Zod schemas
```

Auth is `Authorization: Bearer <key>`, keys are per event, hashed at rest.

### Embeds are server-rendered routes, not a JS widget

`G-1`–`G-3` ship as `/embed/:slug/agenda`, `/embed/:slug/speakers` and `/embed/:slug/sessions`,
served with `frame-ancestors *`, plus a `<script src="/embed.js">` that injects an auto-resizing
iframe. The requirement that an embed "auto-updates with no re-paste" is then free rather than
engineered: the iframe renders live data on every load, so there is no snapshot to go stale and no
client bundle to version.

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

## 7. Accelevents — what the research actually found

`01-requirements.md` §11 describes the Accelevents contract as public, with an OpenAPI spec. Direct
research did not bear that out, and `N-1a` should be read accordingly.

**There is no downloadable OpenAPI file.** The docs are ReadMe.io pages rendering an unpublished
spec. That changes `N-1a` from "code against the published spec" to "code against verified pages,
and be honest about the gaps." The findings that shape the client:

- **Speaker push is well documented.** `POST /rest/host/event/{eventUrl}/speaker` with a full
  `SpeakerDTO`; `GET` on the same path with a required `expand` param. A duplicate email is a **hard
  reject** (`4068906`), not an upsert — so we dedupe on our side before pushing.
- **There is no create-attendee endpoint.** Attendee creation is a five-call order flow
  (availability → `calculateFee` → create order → `formattributes` → payment), with no documented
  "complimentary" flag.
- **The auth header is genuinely ambiguous.** The spec's security scheme says `Key`; every endpoint
  *also* lists an `Authorization` header; the guide calls it "AUTHENTICATION," which is a UI label
  rather than a header name. No `Bearer` prefix is mentioned anywhere. The requirements doc's fact
  table records the UI label; treat the header as unresolved.
- **Rate limits, webhook payload schemas and signature verification are entirely undocumented.**

**Therefore:** `N-1` ships as a real client for the speaker push — the documented, verifiable path,
and the one that matches the brief's stated pain, an organizer re-typing accepted speakers so they
get comped tickets. The order flow ships behind the same interface, marked experimental.
`ACCELEVENTS_AUTH_HEADER` is an env var defaulting to `Authorization`, and the client retries once
with `Key` on a 401 — three lines that resolve from runtime an ambiguity we cannot resolve from
docs. `N-1b`'s fixture-backed fake is built from the exact request and response shapes above, so
tests, the demo, and a judge without credentials all exercise the full path. The gaps go in the
README rather than being papered over.
