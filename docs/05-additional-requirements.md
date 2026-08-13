# Additional requirements

Requirements added by the repository owner **after** the competition brief was frozen. Nothing in
this document comes from the brief or its screenshots — that is exactly why it is a separate file.

[`01-requirements.md`](01-requirements.md) is derived **only** from the brief and must stay that
way; it is the record of what the competition asked for, and editing it to include later ideas
would destroy the one property that makes it useful. This document is the second source: what the
owner wants Cicero to be beyond the competition entry. Where the two disagree, this one wins for
product direction and `01-requirements.md` wins for "what was the brief".

Goals and context: [`00-goals.md`](00-goals.md). Competition scope:
[`01-requirements.md`](01-requirements.md). Build status of brief requirements:
[`requirements-audit-checklist.md`](requirements-audit-checklist.md).

---

## How to read this document

Tags carry the same meaning as in `01-requirements.md`, but their **provenance is different**:
there, a tag traces to the brief's numbered features or the author's screenshot annotations; here,
it traces to an owner decision. No `†` markers, because there is no external text to be faithful to.

| Tag | Meaning |
| --- | --- |
| **[REQUIRED]** | Cicero is incomplete without it |
| **[IMPORTANT]** | Wanted, and its absence is a visible rough edge |
| **[OPTIONAL]** | Build if the required set is done |
| **[EXCLUDED]** | Considered and deliberately not building — reason recorded in the row |

Unlike `01-requirements.md`, this document carries a **Status** column. That ledger was written
before the build and stays a pure reading of the brief; this one is written against a running
codebase, and several of these requirements are already satisfied. Recording that inline is more
honest than implying everything here is unbuilt.

| Status | Meaning |
| --- | --- |
| **SHIPPED** | Implemented on `main` at the revision noted below |
| **PARTIAL** | Real implementation exists, but the requirement as stated is not met |
| **OUTSTANDING** | Not built |
| **DEFECT** | Built wrong — there is code that does not work as its callers assume |

Rows marked DEFECT each have a fix in flight; where the fix is already decided, the row records
which resolution won and why, so the reasoning is not lost in a closed pull request.

Status was assessed against `8489078` on `main` (2026-08-13) by reading the code, not by exercising
the deployed instance; §2 was re-verified against `2bd0ce5` after `main` moved. Line references are
to those revisions and will drift. These IDs are **not** in
[`requirements-audit-checklist.md`](requirements-audit-checklist.md) — that checklist audits brief
requirements against a pinned revision and should not be retro-fitted with a different scope.

---

## 1. Profile pictures and file storage

The ask: a new profile should be able to upload its profile picture, and uploads should land in a
bucket rather than being faked.

**Most of this already exists.** `lib/storage/index.ts` is a real three-backend abstraction —
`Storage` with `put`/`get`/`delete`, resolved by `getStorage()` in the order R2 binding → `S3_BUCKET`
→ Postgres `file_blob`. Four upload routes accept `multipart/form-data`, three authenticated routes
serve bytes back, files are versioned through `rootFileId`/`version`, and the 600 seeded speaker
headshots are written through the same path as a real upload rather than shipped as static assets.
Nothing here is mocked. The rows below are the gap between that and the ask.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-1 | **[REQUIRED]** | SHIPPED | **A new profile can set its picture as part of creating the profile.** When no headshot exists, `ProfileForm` now includes the picture picker in the first-save form. Its client action prepares the image, performs the ordinary profile Server Action without file bytes, then posts the normalized file to the existing upload route; one Save profile action composes both transports without raising the Server Action body limit (`app/portal/[eventSlug]/profile/ProfileForm.tsx`, `app/portal/[eventSlug]/profile/page.tsx`) |
| AR-2 | **[REQUIRED]** | SHIPPED | **Uploads reach a real object bucket wherever one is configured.** Self-hosted `docker compose` gets MinIO with `cicero-files` auto-created; any S3-compatible endpoint works via `S3_*`; a Cloudflare deployment that turns the binding on gets R2. **Decision (2026-08-13): the hosted demo does not get a payment method, so R2 stays commented out in `wrangler.jsonc:67-76` and that deployment runs on the Postgres `file_blob` backend by choice, not by accident.** See [§6](#6-what-the-add-ons-cost-a-self-hoster) for what enabling it would actually cost |
| AR-2a | **[IMPORTANT]** | SHIPPED | **Make the `file_blob` ceiling visible.** The admin Files screen reports the active backend and deployment-wide Postgres blob usage, warns at 250 MiB, and names 500 MiB as the practical R2/S3 handoff (`lib/storage/index.ts`, `lib/storage/status.ts`, `app/admin/submissions/files/page.tsx`). `README.md` and `docs/02-architecture.md` explain that these are operating bounds rather than Postgres limits: blobs enlarge the primary and every backup, the app caps one file at 25 MiB, and reads traverse Worker/Hyperdrive rather than an object CDN |
| AR-3 | **[REQUIRED]** | DEFECT | **A profile picture referenced by the public API must be fetchable.** `app/api/v1/_lib/queries.ts:317` and `lib/accelevents/sync.ts:164` both emit `${appUrl()}/api/files/{fileId}` as `headshotUrl`. **That route does not exist.** Every headshot URL the public API and the Accelevents push hand out is dead. **Resolution: point both callers at the existing `app/embed/[slug]/headshot/[fileId]` route rather than building a new one.** Two fixes were written and the narrower won — a new unauthenticated `/api/files` would serve any participant's headshot to anyone holding its UUID, where the embed route already proves access structurally (the file must be the headshot of a *confirmed* participant on the event named in the path). The root cause was the URL being hand-built in three places; it now has one definition in `lib/speaker-headshot.ts`. A speaker whose profile is unconfirmed gets `null`, which beats a link that 404s |
| AR-4 | **[IMPORTANT]** | SHIPPED | **Validate and normalize uploaded images.** Both portal and organizer pickers center-crop and re-encode in the browser to one 512×512 WebP no larger than 1 MiB, which serves as the detail image and bounded roster thumbnail without putting a native image library in the Worker. Both upload routes independently inspect the WebP bytes, dimensions, declared type and stored size, so a direct route call cannot bypass the contract (`lib/profile-image.ts`, `app/portal/[eventSlug]/upload/route.ts`, `app/admin/speakers/upload/route.ts`) |
| AR-5 | **[IMPORTANT]** | SHIPPED | **One headshot model, not two.** `participant.headshotFileId` is the sole event/public profile image and always points at controlled `Storage` bytes. `contact.headshotUrl` is now explicitly a normalized http(s) CRM discovery/source reference, rendered without a referrer and never hotlinked when a contact becomes an event participant. The conversion is surfaced beside the URL and Add to event flow: open and download the source, upload it on the resulting speaker record, and the AR-4 path creates the canonical stored copy (`lib/services/crm.ts`, `app/crm/[contactId]/ContactProfile.tsx`, `docs/02-architecture.md`) |
| AR-6 | **[OPTIONAL]** | SHIPPED | **Honor `S3_FORCE_PATH_STYLE`.** The S3 client reads the flag at request time through the Worker-safe env accessor, defaults to path-style for MinIO, and switches to virtual-hosted addressing only for an explicit false value. Strict boolean parsing accepts `true`/`1` and `false`/`0`; missing, blank, or unrecognized values use the safe default (`lib/env.ts`, `lib/storage/index.ts`). Tests cover true, false, default, whitespace/case normalization, and malformed input (`lib/env.test.ts`, `lib/storage/index.test.ts`; shipped in `56db9c8`) |
| AR-7 | **[EXCLUDED]** | — | **Presigned direct-to-bucket uploads.** Declined on purpose: routing every read through the app is what makes "only someone with a role on this event can download this deck" enforceable per request, and the R2 binding cannot presign at all (`lib/storage/index.ts:18-23`). The previously unused `@aws-sdk/s3-request-presigner` package has been removed from both `package.json` and `bun.lock` (`56db9c8`) |

## 2. SMS notifications

Shipped in `bffcf44` (#63). Twilio is called directly over `fetch` rather than through the SDK
because the Workers runtime cannot host it; `SMS_TRANSPORT` defaults to `log`, which records the
send without dispatching it. Every send is row-logged to `sms_log` as `queued` before dispatch and
updated to `sent`/`failed`, and `sendSms()` never throws.

> **Decision (2026-08-13): SMS stays mocked, with the real pieces in place.** `SMS_TRANSPORT=log` is
> the intended production setting for any deployment not paying Twilio — and per
> [§6](#6-what-the-add-ons-cost-a-self-hoster), US A2P 10DLC registration means the standing fee
> dwarfs the per-message cost for a conference-sized sender. The `log` transport is a genuine
> archive at `/admin/sms`, not a stub, so the whole notification path stays exercised and a
> self-hoster who does want live SMS only has to set three env vars.
>
> **This makes AR-9 through AR-13 a pre-flight set rather than open bugs.** None of them can hurt
> anyone while the transport is `log`, and all of them must be closed *before* `SMS_TRANSPORT` is
> ever set to `twilio` — not after. They keep their tags because that is the bar on the day it goes
> live; what changed is when they are due. Whoever flips that switch owns closing them first, and
> AR-9 in particular is a legal precondition, not an improvement.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-8 | **[REQUIRED]** | SHIPPED | **SMS as a delivery channel alongside email**, across all eight templated events (submission confirmation, accept/waitlist/decline, session invite/cancel, task reminder, form deadline) plus ad-hoc campaigns with an `auto`/`email`/`sms` selector. Admin archive at `/admin/sms`, transport badge on the integrations screen |
| AR-9 | **[REQUIRED]** | OUTSTANDING | **Consent and opt-out.** There is no `STOP`/`HELP` handling, no inbound Twilio webhook, and no consent record — only a Zod refusal to enable `notifySms` without a phone number. This is a legal requirement in most jurisdictions Cicero would send into, not a nicety, and it is the single riskiest gap in this document |
| AR-10 | **[REQUIRED]** | OUTSTANDING | **Normalize and validate phone numbers to E.164.** `user.phone` is `z.string().trim().max(32)` (`lib/services/settings.ts:1033`). Anything a user types is passed to Twilio as-is, so a locally-formatted number fails at dispatch and surfaces as a `failed` row nobody reads |
| AR-11 | **[IMPORTANT]** | OUTSTANDING | **Verify ownership of a phone number** before sending to it — an OTP round trip on save. Without it, a typo sends a speaker's schedule change to a stranger |
| AR-12 | **[IMPORTANT]** | OUTSTANDING | **Give the default templates real SMS bodies.** `email_template.sms_body` exists and the editor exposes it, but none of the eight `DEFAULT_TEMPLATES` set one — so out of the box every SMS is the email body with markdown stripped and truncated to `SMS_MAX_LENGTH` (`lib/services/comms.ts:976-995`; `DEFAULT_TEMPLATES` at `:666`). The capability is built and unused. Bodies must be **GSM-7 only**: one emoji or curly apostrophe re-encodes the message as UCS-2 and takes a 300-character send from 2 segments to 5 (see [§6](#6-what-the-add-ons-cost-a-self-hoster)) |
| AR-13 | **[IMPORTANT]** | OUTSTANDING | **Record final delivery state.** `sms_log.status` stops at `sent`, meaning "Twilio accepted it". Delivered, undelivered and carrier rejection need Twilio's status callback, which requires the same inbound webhook as AR-9 |
| AR-13a | **[REQUIRED]** | OUTSTANDING | **Give `/admin/sms` the redaction `/admin/mail` already has.** #88 stopped the mail archive rendering other people's sign-in links; the SMS archive never got the same treatment and prints `selected.body` verbatim in a `<pre>` to any organizer on the event (`app/admin/sms/page.tsx:152`), where `/admin/mail` routes the body through `magicLinkMayBeShown` first. It is latent only because no shipped body carries a credential and `stripMarkdownForSms` happens to drop the URL out of `[text](url)` — neither is a control. Harder than the mail case: `magicLinkMayBeShown` keys on an email address and `sms_log` rows carry `toPhone`, so it needs a phone → user → email resolution first |
| AR-13b | **[IMPORTANT]** | OUTSTANDING | **Make `{{portal.link}}` behave predictably in an SMS body.** `PORTAL_LINK_PATTERN` is matched only against the subject and the email body, so an organizer who types `{{portal.link}}` into the SMS field via the template editor gets **silently nothing** rather than a link or an error. **Sequenced deliberately after AR-13a**: making it render would start minting 14-day sign-in credentials into `sms_log` rows that the archive above still displays unredacted. Fix the reader first, then the writer |
| AR-14 | **[OPTIONAL]** | OUTSTANDING | **Quiet hours and rate ceiling per recipient.** Scheduled reminder jobs can fire at any hour in the recipient's timezone; email tolerates that and SMS does not |

## 3. Notification management in settings

Shipped alongside the SMS work: a "Courier edicts" tab in organizer settings
(`app/admin/settings/NotificationsPanel.tsx`) and the same three fields on the speaker profile form,
backed by `user.phone` / `user.notify_email` / `user.notify_sms`.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-15 | **[REQUIRED]** | SHIPPED | **A settings surface where a user manages their own notification delivery** — phone number, email channel on/off, SMS channel on/off, with the SMS toggle disabled until a phone number exists. Reachable by organizers (admin settings) and speakers (portal profile), writing the same three columns |
| AR-16 | **[IMPORTANT]** | OUTSTANDING | **Per-event-type opt-out for recipients.** Preferences are per-channel only: a speaker who wants schedule changes by SMS but not task reminders cannot express that. The only per-event-type control today is organizer-side (`email_template.enabled`), which is a global mute, not a recipient preference |
| AR-17 | **[IMPORTANT]** | OUTSTANDING | **An unsubscribe path in outbound mail** that resolves to these preferences without requiring a login. Related to AR-9 — the SMS equivalent is `STOP` |
| AR-18 | **[OPTIONAL]** | OUTSTANDING | **Per-event preference override.** Preferences are deliberately global per user — "an organizer who manages three events still has one phone number" (`app/admin/settings/NotificationsPanel.tsx:10-16`). Recorded as a decision, not an oversight. Revisit if a user is a speaker at one event and an organizer at another and wants different volumes |

## 4. Public API

Exists as `Z-5` in `01-requirements.md`, tagged `[BONUS]` because that is what the brief made it.
The owner's position is that a public API is core product surface, not a competition point-scorer —
so it is restated here as `[REQUIRED]` and the gaps are tracked against that higher bar.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-19 | **[REQUIRED]** | SHIPPED | **A versioned public HTTP API** at `/api/v1` with three access tiers — unauthenticated public reads, `requireSpeakerSession` for the speaker `/me/*` surface (profile, submissions, tasks), and `requireApiKey` for organizer-scoped operations. Keys are per-event and stored as hashes (`api_key`, prefix-indexed lookup, revoke-by-timestamp, plaintext revealed once). The OpenAPI 3.1 schema is **generated from the Zod schemas** rather than hand-maintained (`app/api/v1/openapi.json/route.ts`) |
| AR-20 | **[REQUIRED]** | OUTSTANDING | **Inbound rate limiting.** `rate_limited`/429 exists as an error code and is documented in the OpenAPI error enum, but nothing enforces it — it is only ever produced when *Airtable or Accelevents* rate-limits Cicero. There is no `middleware.ts` and no counter. What does exist is request-shape bounding (256 KiB body, 20 query params, nesting depth 32, duplicate-key rejection in `app/api/v1/_lib/respond.ts`). The exposed surface is the unauthenticated read set — `GET` on `events/{slug}`, `/sessions`, `/speakers`, `/agenda` and `/forms` — which is cacheable but uncapped, and the unauthenticated sign-in path outside `/api/v1` |
| AR-21 | **[IMPORTANT]** | OUTSTANDING | **Scoped API keys.** A key is all-or-nothing on its event: the same credential that reads the agenda can run `program/reconcile` in `replace` mode. Read-only keys are the minimum split |
| AR-22 | **[OPTIONAL]** | OUTSTANDING | **Outbound webhooks** on submission received, decision made, and session scheduled — so an integrator does not have to poll |

## 5. MCP server

The ask: clone Sessionboard's MCP surface the way Cicero clones the rest of it. Sessionboard runs
one at `mcp.sessionboard.com/mcp` (US and EU) advertising 27 tools; the tool list itself is recorded
as a known unknown in [`reference/sessionboard-survey.md`](reference/sessionboard-survey.md). That
survey is a competitor inventory, not a scope list — the rows below are the owner's scope.

**Nothing MCP-related is built.** No dependency, no route, no config. The nearest existing thing is
`.agents/skills/manage-cicero-event/`, an agent skill that drives the REST API above — which is
useful precedent for tool design and is not a substitute.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-23 | **[REQUIRED]** | OUTSTANDING | **An MCP server exposing Cicero's event operations as tools**, hosted by the same deployment. It must call `lib/services/*` directly, exactly as the REST layer does — the repo's standing rule is that the UI never calls its own HTTP API and both entry points share a service function. An MCP server that shells out to `/api/v1` would be the third implementation of the same operations |
| AR-24 | **[REQUIRED]** | OUTSTANDING | **Authenticate MCP with the existing per-event API keys** (`api_key`, Bearer). A second credential system for the same operations is not worth it, and AR-21's scoping should land before an agent can call write tools |
| AR-25 | **[IMPORTANT]** | OUTSTANDING | **Streamable HTTP transport**, not stdio — the deployment target is Cloudflare Workers, which has no long-lived process to attach a stdio pipe to |
| AR-26 | **[IMPORTANT]** | OUTSTANDING | **Start from the read surface and the write operations Cicero already exposes**: event, sessions, speakers, agenda, submissions, program reconcile. Parity with Sessionboard's 27 tools is not a target — their list is unknown, and matching a number is not a product goal. Cover the spine in `00-goals.md` and stop |
| AR-27 | **[OPTIONAL]** | OUTSTANDING | **Publish the tool manifest in the docs** the way `docs/openapi.json` is published, generated from the same Zod schemas so it cannot drift |

---

## 6. What the add-ons cost a self-hoster

Cicero is meant to be self-hosted, and every optional backend in this document is chosen by an
environment variable. This section says what each one actually costs so an operator can decide
deliberately instead of discovering a bill. It is also the evidence behind the
[decisions](#decisions) below.

**Prices verified 2026-08-13 against vendor documentation. They will drift — re-check before
relying on them.** Anything that could not be verified from an official source is listed at the end
of this section rather than smoothed over.

### The short version

Cicero runs at **$0/month** on free tiers, and the default configuration is built to do exactly
that. Two purchases are worth understanding before you decline them:

| Add-on | Cost to enable | What it buys | Verdict |
| --- | --- | --- | --- |
| **Workers Paid** | **$5/month** | Raises the per-request CPU cap from **10 ms to 30 s** | **The only spend that fixes a real defect.** See below |
| **R2 object storage** | **$0** in practice | Uploads land in a bucket instead of Postgres | Free at our volume, but needs a checkout step |
| **Twilio SMS** | **~$32/year floor**, ~$75 year one | Live SMS instead of the `log` archive | Fixed fees dominate; declined (§2) |
| **Resend email** | **$0** up to 3,000/month | Real outbound mail | Free tier is enough; watch the daily cap |
| **Managed Postgres** | **$0** on Neon/Supabase free | The database | Free tiers have sharp edges — see below |
| **Anthropic API** | usage-based | AI review + agenda assist | Optional; falls back cleanly with no key |

### Cloudflare Workers — the $5 that actually matters

The free plan caps CPU at **10 ms per invocation**; Workers Paid is **$5/month** and raises it to
30 s (configurable to 5 min), with 10M requests included. This is not academic: the README's known
gaps already record that rendering a dense admin page on a cold isolate exceeds 10 ms, so Cloudflare
returns `error code: 1102` and roughly **one navigation in eight fails** on the free plan.

Nothing in the code can render an admin table in 10 ms of CPU. If you self-host on Cloudflare and
want the admin surfaces to be reliable, this is the purchase to make — and it is a better first $5
than R2 or Twilio. A self-host on any platform without a CPU quota (`docker compose`, a VPS) has no
such ceiling and needs no equivalent spend.

### R2 — free at this scale, but not frictionless

R2 is **$0.015/GB-month**, Class A ops $4.50/million, Class B $0.36/million, and **egress is free at
any volume**. The free tier covers **10 GB-month, 1M Class A and 10M Class B operations**.

A single conference does not come close. For 200 speakers and 500 sessions:

| Asset | Assumption | Volume |
| --- | --- | --- |
| Speaker headshots | 200 × ~500 KB | ~0.1 GB |
| Slide decks | ~400 uploads × ~5 MB | ~2 GB |
| **Total** | | **~2 GB** (worst case ~5 GB) |

That is **$0/month**, and ~600 uploads is a rounding error against 1M free Class A operations. Even
at 25 GB the overage is $0.23/month; it takes multi-year, multi-conference archives (~200 GB, about
$2.85/month) before this is a line item at all.

**So R2's cost is not why it is off.** Cloudflare requires completing an R2 subscription checkout
before the service can be used, including for free-tier usage, and that checkout is widely reported
to require a card or PayPal even when usage stays inside the free tier. Cicero's hosted deployment
takes no payment method, so it runs on the Postgres `file_blob` backend instead (AR-2). A
self-hoster who already has a card on the account should just turn R2 on — it is two uncommented
blocks in `wrangler.jsonc` and `open-next.config.ts`, and it costs nothing at this scale.

### Twilio SMS — the fixed fees, not the messages

This is the one add-on where the pricing genuinely changes the decision, and it is why §2 keeps SMS
mocked. In the US, sending A2P traffic requires **10DLC registration** whose standing fees dwarf the
messages for a conference-sized sender.

For **1,000 messages of ~300 characters** over a year, on Low-Volume Standard registration:

| Line item | Calculation | Year one |
| --- | --- | --- |
| Message segments | 1,000 × 2 segments × $0.0083 | $16.60 |
| Carrier pass-through | ~2,000 segments × ~$0.004 | ~$8.00 |
| US local number | $1.15 × 12 | $13.80 |
| Brand registration | one-time | $4.00 |
| Campaign vetting | one-time | $15.00 |
| Campaign fee | $1.50 × 12 | $18.00 |
| **Total** | | **≈ $75** |

That is **~$0.075 per message, of which only ~$0.025 is the message** — about 60% of the bill is
registration and number rental. Year two settles to ~$56, and the floor is **$31.80/year even if you
send nothing**. Sole Proprietor registration caps you below 1,000 messages/day and carries a $2/month
campaign fee instead.

> **Encoding trap worth knowing before editing templates.** A message is segmented at 160 GSM-7
> characters (153 once concatenated). **One emoji or curly apostrophe flips the whole message to
> UCS-2**, where a segment is 70 characters (67 concatenated) — so a 300-character message goes from
> **2 segments to 5**, a 2.5× jump on every send, for one character. Cicero's `SMS_MAX_LENGTH` is
> 300, which is exactly two GSM-7 segments; keeping default template bodies in plain ASCII (straight
> quotes, plain hyphens) is a cost control, not a style preference. See AR-12.

### Email, database and AI

- **Resend** is free for 3,000 emails/month but with a **hard 100/day cap**, which a bulk
  accept/decline run can hit in one afternoon — that is the constraint to plan around, not the
  monthly total. Pro is $20/month for 50,000. A verified domain is required to send on any tier.
  Self-hosted SMTP is $0 and trades cost for deliverability.
- **Postgres**: Neon's free tier is 0.5 GB per project and its paid Launch tier is pure usage
  ($0.106/CU-hour compute, $0.35/GB-month storage) with no stated minimum. Supabase free is 500 MB
  and **pauses a project after a week of inactivity** — the sharpest edge on this page for a
  conference app that goes quiet between events. Supabase Pro starts at $25/month. Note that AR-2's
  decision puts uploaded file bytes *in this database*, so storage tiers matter more here than they
  would otherwise (AR-2a).
- **Hyperdrive** is included on both Workers plans at no extra charge, but the free plan caps
  **100,000 database queries/day**, and over-limit queries fail rather than slow down.
- **Anthropic API** is usage-based — roughly $1/$5 per million input/output tokens on Haiku 4.5 and
  $2/$10 on Sonnet 5, with prompt-cache reads at 0.1× and a 50% batch discount. Cicero's AI features
  degrade to rule-based fallbacks with no key set, so this is genuinely optional.

### What we could not verify

Stated plainly, because a pricing table that hides its uncertainty is worse than one that admits it:

1. **Whether Cloudflare formally requires a payment method for free-tier R2.** The docs require
   completing a subscription checkout; the card requirement itself appears only in community
   reports.
2. **Twilio's canonical 10DLC brand fee.** Twilio publishes both $4/$44 (marketing) and
   $4.50 + $41.50 (Trust Hub docs); the reconciling support article blocks automated fetches.
3. **The full per-use-case 10DLC campaign fee table.** Only the "$1.50–$10" range is published; the
   $1.50 Low Volume Mixed figure is secondary-sourced.
4. **Per-carrier pass-through fees** beyond AT&T and T-Mobile examples — the ~$0.004/segment average
   above is an estimate.
5. **Resend's pre-verification sending restrictions**, widely reported but not in their docs.
6. **Whether Neon's Launch plan carries any base fee** — none is stated, and none is denied.

---

## Decisions

**2026-08-13 — no paid infrastructure.** Cicero's hosted deployment takes no payment method, so
neither R2 (AR-2) nor Twilio (§2) is activated. Both code paths stay complete and selectable by
env var, because the point of a self-hostable product is that the operator picks the backend — the
decision here is about *our* deployment, not about what the software supports. The consequences are
recorded in AR-2, AR-2a and the §2 callout rather than left implicit, and the prices that drove the
decision are in [§6](#6-what-the-add-ons-cost-a-self-hoster).

This costs something honest and worth naming: the hosted instance exercises the Postgres storage
backend and the `log` SMS transport, so the R2 and Twilio paths ship tested but not
production-proven. A self-hoster who enables either is the first real user of that path.

### Still open

**Who is the MCP server for?** An organizer pointing their own assistant at their event implies
per-user scoping; an integrator implies the per-event API key in AR-24 is enough. The answer changes
the auth model, so it should be settled before any transport work starts — it is the one remaining
question that blocks a build.

## Relationship to the other documents

| Document | Relationship |
| --- | --- |
| [`00-goals.md`](00-goals.md) | Unchanged. The eight-step spine still describes the product; nothing here alters it |
| [`01-requirements.md`](01-requirements.md) | Brief-derived, frozen. AR-1 refines `S-3` (headshot upload) and `T-5` (file storage); AR-19 promotes `Z-5` (`01-requirements.md:378`) from `[BONUS]` to `[REQUIRED]`. Sections 2, 3 and 5 have no counterpart there — SMS is listed at `01-requirements.md:408` as genuinely absent from the brief, and MCP is not mentioned at all |
| [`02-architecture.md`](02-architecture.md) | AR-23's service-layer rule and AR-25's transport choice belong there once decided |
| [`03-plan.md`](03-plan.md) | Workstream ownership still applies: AR-1–AR-7 land in W2, AR-8–AR-18 in W5, AR-19–AR-27 in W7 |
| [`requirements-audit-checklist.md`](requirements-audit-checklist.md) | Audits brief requirements at a pinned revision. AR IDs are deliberately absent; the Status column here serves the same purpose for this scope |
