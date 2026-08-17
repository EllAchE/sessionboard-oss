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

Where a defect's resolution needed a product choice, the row records which resolution won and why,
so the reasoning is not lost in a closed pull request.

Status was initially assessed against `8489078` on `main` (2026-08-13) by reading the code, not by
exercising the deployed instance. It was reconciled against `7544759` after the fixes for `AR-3`,
`AR-6`, and `AR-12` landed; `AR-13a` and `AR-13b` were closed by the SMS mailbox change that last
updated this document. Line references are to those revisions and will drift. These IDs are **not** in
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
| AR-2a | **[IMPORTANT]** | SHIPPED | **Make the `file_blob` ceiling visible.** The organizer Files screen reports the active backend and deployment-wide Postgres blob usage, warns at 250 MiB, and names 500 MiB as the practical R2/S3 handoff (`lib/storage/index.ts`, `lib/storage/status.ts`, `app/organizer/submissions/files/page.tsx`). `README.md` and `docs/02-architecture.md` explain that these are operating bounds rather than Postgres limits: blobs enlarge the primary and every backup, the app caps one file at 25 MiB, and reads traverse Worker/Hyperdrive rather than an object CDN |
| AR-3 | **[REQUIRED]** | SHIPPED | **A profile picture referenced by the public API is fetchable.** The public API and Accelevents sync now share `lib/speaker-headshot.ts`, which points at the existing `app/embed/[slug]/headshot/[fileId]` route. That route proves access structurally: the file must be the headshot of a confirmed participant on the event named in the path. An unconfirmed profile returns `null` instead of a dead `/api/files/{fileId}` URL |
| AR-4 | **[IMPORTANT]** | SHIPPED | **Validate and normalize uploaded images.** Both portal and organizer pickers center-crop and re-encode in the browser to one 512×512 WebP no larger than 1 MiB, which serves as the detail image and bounded roster thumbnail without putting a native image library in the Worker. Both upload routes independently inspect the WebP bytes, dimensions, declared type and stored size, so a direct route call cannot bypass the contract (`lib/profile-image.ts`, `app/portal/[eventSlug]/upload/route.ts`, `app/organizer/speakers/upload/route.ts`) |
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
> archive at `/organizer/sms`, not a stub, so the whole notification path stays exercised and a
> self-hoster who does want live SMS only has to set three env vars.
>
> **This makes AR-9 through AR-13 a pre-flight set rather than open bugs.** None of them can hurt
> anyone while the transport is `log`, and all of them must be closed *before* `SMS_TRANSPORT` is
> ever set to `twilio` — not after. They keep their tags because that is the bar on the day it goes
> live; what changed is when they are due. Whoever flips that switch owns closing them first, and
> AR-9 in particular is a legal precondition, not an improvement.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-8 | **[REQUIRED]** | SHIPPED | **SMS as a delivery channel alongside email**, across all eight templated events (submission confirmation, accept/waitlist/decline, session invite/cancel, task reminder, form deadline) plus ad-hoc campaigns with an `auto`/`email`/`sms` selector. Admin archive at `/organizer/sms`, transport badge on the integrations screen |
| AR-9 | **[REQUIRED]** | SHIPPED | **Consent and opt-out.** Enabling SMS from either profile surface records destination-level consent; disabling it blocks first and writes the preference second. Every dispatch checks that record, including manually selected SMS campaigns. The signed `/api/webhooks/twilio/sms` endpoint handles Twilio Advanced Opt-Out and the standard `STOP`/`START`/`HELP` keyword families, updates every matching account, and avoids duplicate replies when Twilio already handled the keyword. Upgrades disable legacy SMS preferences until consent is renewed rather than treating an old boolean as retroactive authorization |
| AR-10 | **[REQUIRED]** | SHIPPED | **Normalize and validate phone numbers to E.164.** Profile, settings, participant, and public-API writes share `libphonenumber-js` parsing, with a configurable `SMS_DEFAULT_COUNTRY` for national input. `user.phone` also has an E.164 database check, outbound dispatch normalizes again, and the upgrade migration conservatively normalizes unambiguous legacy values while clearing values it cannot convert without guessing |
| AR-11 | **[IMPORTANT]** | SHIPPED | **Verify ownership of a phone number.** A six-digit, ten-minute OTP is bound to the signed-in user and exact E.164 destination, limited to five requests an hour and five attempts, and stored only as a digest. Log mode records the message without contacting Twilio and shows the development code only to that signed-in requester; that proof is tagged `log` and automatically becomes invalid if the deployment later enables Twilio. Changing a number clears verification and disables SMS; every dispatch fails closed until the current number is verified through the active transport |
| AR-12 | **[IMPORTANT]** | SHIPPED | **Give the default templates real SMS bodies.** All eight defaults now carry concise SMS-specific copy, remain below the 300-character limit under representative long merge values, contain only GSM-7 characters, and point somewhere whenever the corresponding email does |
| AR-13 | **[IMPORTANT]** | SHIPPED | **Record final delivery state.** Every Twilio REST send includes the signed `/api/webhooks/twilio/status` callback. Final `delivered`, `undelivered`, and `failed` states update the row by provider SID with carrier error details and a status timestamp; transient callbacks are ignored so out-of-order `sent` events cannot regress a final state. The admin SMS archive renders the final result |
| AR-13a | **[REQUIRED]** | SHIPPED | **Give `/organizer/sms` the redaction `/organizer/mail` already has.** The reader detects sign-in credentials, resolves the destination phone to exactly one user account, and applies `magicLinkMayBeShown` with the actual SMS transport. Missing or duplicate phone matches fail closed; Twilio cannot inherit the mail transport's log-mode exception; and a visible notice explains every withheld link |
| AR-13b | **[IMPORTANT]** | SHIPPED | **Make `{{portal.link}}` behave predictably in an SMS body.** The portal-link detector now covers subject, email body, and SMS body for both triggered and ad-hoc sends. A custom SMS template that asks for the merge field receives a minted link instead of an empty string, while previews still use a non-credential placeholder and the guarded archive handles the stored copy |
| AR-14 | **[OPTIONAL]** | SHIPPED | **Quiet hours and rate ceiling per recipient.** Both preference surfaces capture an IANA timezone, a cross-midnight-capable quiet window, and a 1–100 SMS hourly ceiling (six by default). The shared dispatcher checks successful sends in the rolling hour and suppresses SMS during the recipient's local quiet window; invalid stored timezones fail closed while email remains available |

## 3. Notification management in settings

Shipped alongside the SMS work: a "Courier edicts" tab in organizer settings
(`app/organizer/settings/NotificationsPanel.tsx`) and the same three fields on the speaker profile form,
backed by `user.phone` / `user.notify_email` / `user.notify_sms`.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-15 | **[REQUIRED]** | SHIPPED | **A settings surface where a user manages their own notification delivery** — phone number, email channel on/off, SMS channel on/off, with the SMS toggle disabled until a phone number exists. Reachable by organizers (admin settings) and speakers (portal profile), writing the same three columns |
| AR-16 | **[IMPORTANT]** | SHIPPED | **Per-notification-type opt-out for recipients.** Submission updates, schedule changes, task reminders, submission deadlines, and organizer announcements each have independent email/SMS choices on both preference surfaces. Manual channel selection and automated templates resolve the same recipient-owned rules and cannot override an opt-out |
| AR-17 | **[IMPORTANT]** | SHIPPED | **Tokenized, no-login email unsubscribe.** Every event email to a Cicero account receives a 90-day bearer link whose database row stores only a digest and fixes the user, event, and notification category. GET only renders confirmation; POST applies the exact event/type email opt-out once. Used and expired tokens fail closed, and magic sign-in mail is deliberately excluded |
| AR-18 | **[OPTIONAL]** | SHIPPED | **Per-event preference override.** Phone ownership and base channels remain global, while each event can explicitly inherit, enable, or disable email and SMS. Resolution is deterministic: account default → event channel override → event notification-category override, so editing one event never mutates another event's defaults |

## 4. Public API

Exists as `Z-5` in `01-requirements.md`, tagged `[BONUS]` because that is what the brief made it.
The owner's position is that a public API is core product surface, not a competition point-scorer —
so it is restated here as `[REQUIRED]` and the gaps are tracked against that higher bar.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-19 | **[REQUIRED]** | SHIPPED | **A versioned public HTTP API** at `/api/v1` with three access tiers — unauthenticated public reads, `requireSpeakerSession` for the speaker `/me/*` surface (profile, submissions, tasks), and `requireApiKey` for organizer-scoped operations. Keys are per-event and stored as hashes (`api_key`, prefix-indexed lookup, revoke-by-timestamp, plaintext revealed once). The OpenAPI 3.1 schema is **generated from the Zod schemas** rather than hand-maintained (`app/api/v1/openapi.json/route.ts`) |
| AR-20 | **[REQUIRED]** | SHIPPED | **Inbound rate limiting.** A Postgres-backed fixed-window counter coordinates limits across both Cloudflare Worker isolates and self-hosted Node processes without retaining raw client addresses. Public API reads allow 120 requests per caller per minute, speaker sessions 300, and API keys 600; magic-link requests allow 5 per address and 30 per client address per 15 minutes. Limit responses are `429 rate_limited` with `Retry-After`, and the generated OpenAPI contract documents the policy (`lib/rate-limit.ts`, `inbound_rate_limit`) |
| AR-21 | **[IMPORTANT]** | SHIPPED | **Scoped API keys.** Keys are explicitly `read` or `write`; write includes read, while a read-only key receives 403 before either reconcile endpoint can mutate an event. Existing keys migrate to `write` so an upgrade does not silently break an integration, while the issue function and Organizer → Integrations default new keys to least-privilege `read`. Scope is visible in the key ledger and the OpenAPI security description (`api_key.scope`, `requireApiKey(request, slug, requiredScope)`) |
| AR-22 | **[OPTIONAL]** | SHIPPED | **Outbound webhooks** fire on `submission.received`, `submission.decision_made`, and `session.scheduled`. Per-event endpoints are managed under Organizer → Integrations; signing secrets are revealed once, bodies carry delivery IDs and timestamps, and `X-Cicero-Signature` is an HMAC-SHA256 over the raw JSON. Local, private, link-local, and metadata-network targets are rejected before storage; Cloudflare additionally enforces public-only fetches. Delivery status, response code, and errors are retained in `webhook_delivery`, while a failed endpoint never rolls back the lifecycle write that triggered it (`lib/webhooks.ts`) |
| AR-52 | **[OPTIONAL]** | OUTSTANDING | **A reviewer-scoped API key.** Keys carry a `read`/`write` scope (AR-21) but no role. `requireApiKey` resolves a key to its event and nothing narrower, so the only durable credential Cicero issues is an organizer's, and it reads every submission on that event. A reviewer has no programmatic surface at all: `submission:read_all` and `submission:review` (`lib/context.ts:60`) are reachable only through the server actions behind `app/review/**`, never through `/api/v1`. Reviewer is the one role where closing that is worth the cost — panel scoring is the repetitive, batchable work on an event, and it is the surface an external review tool or a reviewer's own agent would want. The work is a role or capability column on `api_key`, `requireApiKey` narrowing to that reviewer's assigned queue rather than the whole event, and read-assignments / submit-score routes under `/api/v1`. Speakers are deliberately out of scope: the `/me/*` surface already accepts a speaker session as its Bearer token (AR-19), which fits the one-off, per-person shape of speaker work |

## 5. MCP server

The ask: clone Sessionboard's MCP surface the way Cicero clones the rest of it. Sessionboard runs
one at `mcp.sessionboard.com/mcp` (US and EU) advertising 27 tools; the tool list itself is recorded
as a known unknown in [`reference/sessionboard-survey.md`](reference/sessionboard-survey.md). That
survey is a competitor inventory, not a scope list — the rows below are the owner's scope.

The shipped server complements `.agents/skills/manage-cicero-event/`: the skill remains the guided
REST workflow, while MCP gives any compatible client a discoverable, event-scoped tool surface on
the same deployment.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-23 | **[REQUIRED]** | SHIPPED | **An MCP server exposes Cicero's event operations as tools** at `/api/v1/events/{slug}/mcp`, hosted by the same Next/OpenNext deployment. REST and MCP both call the transport-neutral read functions in `lib/services/public-api.ts`, and program reconciliation calls `lib/services/program-reconcile.ts`; the MCP route never calls Cicero over HTTP (`lib/mcp/server.ts`) |
| AR-24 | **[REQUIRED]** | SHIPPED | **MCP authenticates with existing per-event API keys** through the same `requireApiKey` Bearer lookup as REST. The authenticated event id/slug are closed over by every tool, read-only keys receive only the `read` MCP scope, and the program write fails closed unless the key has `write` scope (`app/api/v1/events/[slug]/mcp/route.ts`, `lib/mcp/server.ts`) |
| AR-25 | **[IMPORTANT]** | SHIPPED | **Streamable HTTP transport**, supplied by the official `@modelcontextprotocol/server` web-standard handler. A fresh MCP server is created per request for the Cloudflare Worker runtime; the endpoint does not expose stdio or retain client transports across requests |
| AR-26 | **[IMPORTANT]** | SHIPPED | **The tool surface covers Cicero's existing spine**: event, sessions, speakers, agenda, submissions, and program reconcile. The tool definitions and handlers live in `lib/mcp/tools.ts` and `lib/mcp/server.ts`; no numerical parity claim is made about Sessionboard's unknown tool inventory |
| AR-27 | **[OPTIONAL]** | SHIPPED | **The generated tool manifest is published** at `docs/mcp-tools.json` and `/api/v1/mcp-tools.json`. `bun run docs:mcp` projects the exact runtime Zod input/output schemas and `lib/mcp/tools.test.ts` fails if the committed document drifts |

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
| **Workers Paid** | **$5/month** | Raises the per-request CPU cap from **10 ms to 30 s**, and the bundle ceiling from **3 MiB to 10 MiB** | **The only spend that fixes a real defect** — and the one that puts Cicero on Cloudflare at all. See below |
| **R2 object storage** | **$0** in practice | Uploads land in a bucket instead of Postgres | Free at our volume, but needs a checkout step |
| **Twilio SMS** | **~$32/year floor**, ~$75 year one | Live SMS instead of the `log` archive | Fixed fees dominate; declined (§2) |
| **Resend email** | **$0** up to 3,000/month | Real outbound mail | Free tier is enough; watch the daily cap |
| **Managed Postgres** | **$0** on Neon/Supabase free | The database | Free tiers have sharp edges — see below |
| **Anthropic API** | usage-based | AI review + agenda assist | Optional; falls back cleanly with no key |

### Cloudflare Workers — the $5 that actually matters

Workers Paid buys two separate things here, and the second one is why Cicero is not on Cloudflare
today.

**The CPU cap.** The free plan caps CPU at **10 ms per invocation**; Paid raises it to 30 s
(configurable to 5 min), with 10M requests included. This is not academic: the README's known gaps
already record that rendering a dense admin page on a cold isolate exceeds 10 ms, so Cloudflare
returns `error code: 1102` and roughly **one navigation in eight fails** on the free plan.

**The bundle ceiling.** Free allows a 3 MiB gzipped Worker; Paid allows 10 MiB. Cicero's upload is
**3.42 MiB gzipped** (`wrangler deploy --dry-run`, 2026-08-16) — about 14% over the free ceiling, and
comfortably inside Paid's with roughly 3× headroom. So on a free account `cf:deploy` is refused
outright with API error 10027, which is the reason the hosted demo runs on Vercel rather than any
defect in the Cloudflare path. `bun run cf:build` succeeds either way.

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

## 7. Review surface: circulating and exporting a decision

Two gaps found by reading the review surfaces against how a program committee actually works. A
committee argues about proposals asynchronously — by pasting links at each other, and by working
the results in a spreadsheet — and both of those paths lost information on the way out of the tool.

Numbered after §6 rather than before it so the existing `#6-what-the-add-ons-cost-a-self-hoster`
anchors, which three rows above link to, keep resolving.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-28 | **[IMPORTANT]** | SHIPPED | **A submission permalink is copyable in one click** from both review surfaces: every queue row and the submission detail header (`app/organizer/submissions/CopyPermalinkButton.tsx`). `/organizer/submissions/{id}` already resolved and was already linked; what was missing was getting the absolute URL out of the page without selecting the address bar, which a row in a queue of forty does not let you do. The origin is read at click time, so the copied link is on whichever host the reader is already using. The row's own link is untouched — copying is an addition, not a replacement — and the affordance is offered to reviewers as well as organizers, since circulating a link is not a decision |
| AR-29 | **[IMPORTANT]** | SHIPPED | **The review results export carries `submission.decision_note`**, in a `Decision note` column beside `Submission status` (`reviewResultsCsv`, `lib/services/review.ts`). The export already carried per-criterion scores, criterion weights and reviewer comments, so it answered what was decided and by whom — but never why, leaving the organizer's reasoning locked in the tool the moment anyone opened the results in a spreadsheet. The note repeats on each reviewer row of its submission, matching every other submission-level column in that file. `ai_review.rationale_markdown` is deliberately **excluded**: it is advisory by construction (`03-plan.md` §2), and a paragraph of model prose sitting between `Submission status` and `Reviewer comment` reads as reasoning that decided something, carrying none of the caveat the AI panel carries on screen |

A third fix shipped alongside these is a defect repair rather than a new requirement, so it gets no
AR ID: the embed's multi-session `.ics` download minted its own `{session.id}@cicero.events` UID at
a hardcoded `SEQUENCE:0`, giving a session a second calendar identity distinct from the
`scheduled_session.ics_uid` used by the speaker invite and the `C-3a` per-session download. It now
carries the stored UID and sequence (`app/embed/calendar.ts`, `app/embed/calendar.test.ts`).

---

## 8. Assisted chasing

The ask: the outstanding-task dashboard (`B-1`) tells an organizer who is blocking the event, and
then abandons them. The chase itself — the thing that actually consumes a coordinator's week — was
left to their inbox.

The shape is not a free choice. A program-committee organizer with roughly a decade of records had
an assistant read the Slack channel where their event coordinator has run speaker logistics for
years, ~13,488 messages, and the finding was blunt: **in thirteen years of archive there is no
instance of a tool successfully sending a reminder on the committee's behalf.** The same "it went
to spam, I'm sending a personal email" incident appears in 2023 and again in 2025. Their conclusion,
which these rows adopt verbatim as a constraint: a feature that auto-emails speakers is switched off
within one event cycle; build **assisted chasing** — the tool drafts, a human reviews and sends.

The related finding is that escalation runs **by medium, not by attempt count**: the tool's email,
then the coordinator's own address, then a cc, then a text, then a phone call. Each step up is a
deliberate signal. That is why AR-32 exists: the same reviewed draft has to be able to leave through
the organizer's own mail client, not only through Cicero's transport.

Cicero already had the send primitives — `previewParticipantEmail` and `sendParticipantEmail` in
`lib/services/comms.ts` — but only the MCP agent surface reached them. No organizer screen did.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-30 | **[REQUIRED]** | SHIPPED | **Every outstanding-task row can be chased from where it is read.** A per-row "Draft a nudge" control on the `B-1` report opens a composer prefilled with copy specific to that person and that task — overdue by how long, which sessions it blocks, a one-click portal link. Composition is a pure function (`composeTaskNudge`) so the wording is regression-tested rather than buried in JSX (`lib/services/task-nudge.ts`, `app/organizer/dashboard/OutstandingTasks.tsx`, `app/organizer/dashboard/NudgeComposer.tsx`) |
| AR-31 | **[REQUIRED]** | SHIPPED | **Nothing leaves without a human reading it.** The composer is two-step: edit, then render, then send — and any edit invalidates the rendering. This is enforced on the server, not in the client: `sendTaskNudge` requires the reviewed subject/body/recipient back and passes them to `sendParticipantEmail`, which re-resolves the recipient and re-renders the message and refuses if either moved. There is no bulk action, no "remind all", and no code path from a table row to an outbound message that skips the render |
| AR-32 | **[IMPORTANT]** | SHIPPED | **The draft can escalate to the organizer's own address.** Once rendered, the composer offers *Copy* and *Send from my own email* (`mailto:`) beside *Send from Cicero* — the same reviewed text, handed to the human instead of the transport. This is the escalation-by-medium finding, and it is the one thing an autosender structurally cannot do |
| AR-33 | **[IMPORTANT]** | SHIPPED | **A settled task is never chased.** Completed and waived assignments get no button, and both the draft and send paths re-check status against the live report — so a task finished while the composer was open fails closed. A successful send stamps `task_assignment.last_reminded_at`, which is the same field the cron reminder reads, so the automatic reminder does not chase someone a human chased an hour ago. The row shows when that person was last reminded |
| AR-34 | **[EXCLUDED]** | — | **Autonomous or scheduled chasing from this surface.** Declined on the evidence above. Cicero does keep its opt-in `task.reminder` cron flow, which is a template an organizer configured in advance for a whole event; this surface is the opposite act — one person, one task, one message, sent by a named human. Conflating them is exactly how the tools in that archive lost their users |

**Behavior on the `log` transport.** The hosted deployment runs `MAIL_TRANSPORT=log` on purpose
(§2, and the on-screen magic link judges sign in with depends on it). Assisted chasing is fully
exercisable there: the draft renders, the review gate applies, and the send lands in `email_log`
under `templateKey: 'task.nudge'`, visible at Organizer → Mail. The organizer is told which of the two
happened rather than being shown a false "delivered" — and *Send from my own email* delivers for
real regardless of transport.

---

## 9. Agenda conflict policy

`A-2` in `01-requirements.md` asks for conflict detection, and `A-7` for speaker double-booking
detection. Both were built as *refusals*: every write path re-detected conflicts after the mutation
and rolled the transaction back, so a conflicting agenda could not be stored. The consequence was
that the conflicts view and the "N conflicts on this agenda" chip could only ever render zero, and
step 6 of the rehearsal script in [`03-plan.md`](03-plan.md) — "force a room clash and a speaker
double-booking; confirm both surface" — was not performable.

The owner's decision: **conflicts are warnings by default, and the organizer may switch their event
to blocking.** Detection was never wrong; treating detection and enforcement as the same thing was.
The two are separated below — severity is intrinsic to the kind of clash, enforcement is the
organizer's call.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-35 | **[REQUIRED]** | SHIPPED | **Agenda conflicts are recorded, not refused, unless the organizer says otherwise.** `event.agenda_conflict_policy` is `warn` (default) or `block`, set from the conflicts view by anyone with `agenda:manage`. Severity is a property of the clash: a room double-booking and a speaker double-booking are `error` — physically impossible programmes; a track collision is `warning` — an editorial judgement, since parallel sessions inside a strand are a normal choice. Under `block` only `error` kinds refuse the write; under `warn` nothing refuses, and every clash surfaces as a named row — "Cicero is scheduled in X and Y at the same time" — with one-click unschedule on either side, a "Saved with a clash" toast confirming what actually committed, an amber banner during the drag, and the persistent count chip. The policy is read inside the same transaction and advisory lock as the entries, and `blockingConflicts()` is the single decision point shared by the board, the transactional guard, and `/api/v1` program reconcile, so the UI and the API cannot disagree about what saves (`lib/services/schedule.ts`, `lib/services/agenda-atomic.ts`, `lib/services/program-reconcile.ts`, migration `0020`) |

---

## 10. Intelligent agenda optimization

The current builder finds a valid, conflict-free placement. A later version should optimize the
draft for likely attendees and the physical venue. That is outside v1 because it needs new input
data, a scoring model, and tuning against real conference programs; a model prompt alone is not an
optimizer.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-36 | **[EXCLUDED]** | — | **Build intelligent automatic agenda allocation as a post-v1 goal.** A future auto-drafter should infer likely audience overlap from talk content, format, and expected interest, then avoid placing talks for the same cohort in parallel. For example, energy-and-software and bioweapons-and-software talks may compete for much of the same software audience. It should also estimate demand from speaker popularity or clout and map each talk to the venue structure, stage or room capacity, and available slot shapes. Speaker popularity and venue structure need first-class fields if the current data model does not carry them. The optimizer needs a tunable weighting system for these competing objectives and an evaluation loop that calibrates the weights against real schedules. This is a recorded product goal, not current implementation scope. |

---

## 11. Exhibitor map

The first version is deliberately a document, not a floor-plan editor. An organizer should be able
to publish the map they already have without recreating booths or exhibitor data in Cicero. The
upload is the configuration: no coordinates, booth records, or map-specific authoring are required.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-37 | **[REQUIRED]** | SHIPPED | **An organizer can upload one PDF exhibitor map for an event and expose it as an embed.** Organizer → Exhibitor map uploads, replaces, or removes the current PDF through the ordinary event-scoped storage path; server validation checks the MIME type, `.pdf` extension, 25 MB ceiling, and `%PDF-` signature. Uploading publishes immediately, while replacement keeps the stable embed URL and removal revokes it before deleting the bytes. The same screen previews the map and copies script or iframe snippets for `/embed/:slug/exhibitor-map`; its current-slot-only file route is unauthenticated, responsive, non-cacheable, and offers inline, open, and download paths. The embedded result remains the uploaded static document — there are no interactive booths, hotspots, search, wayfinding, or map-region links (`event_exhibitor_map`, `lib/services/exhibitor-map.ts`, `app/organizer/exhibitor-map/**`, `app/embed/views/ExhibitorMapWidget.tsx`, migration `0021`) |

**Future work, not part of AR-37:** multiple floors or maps, structured booth placement, clickable
exhibitor regions, map search and filtering, attendee wayfinding, and richer embed presentation or
accessibility controls. Those enhancements should build on the basic upload-and-embed path rather
than block it.

---

## 12. Notifications and update rundown

An organizer should not have to inspect the submission queue, review rounds, speaker roster, task
board, content history, deliverables, and agenda one by one just to learn what moved while they were
away. Cicero needs one event-scoped place that answers: **what changed, when, who was involved, and
where can I act on it?** This is an in-app operational feed, distinct from the outbound email/SMS
delivery preferences in §3.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-38 | **[REQUIRED]** | PARTIAL | **An organizer-facing Notifications & updates section gives a chronological rundown of material changes since that organizer last used Cicero.** Each entry is event-scoped, names the change and its time, attributes the person when the underlying record knows them, and links to the relevant organizer workflow. Unread changes lead the default feed, visually distinct from already-viewed changes retained below; an unread-only view is available without hiding older context by default. The first slice at `/organizer/updates` covers submissions and decisions, completed reviews, speaker/profile changes, task state, schedule changes, attributed content revisions, uploads, and file comments over the latest 30 days; it groups and filters those entries and remembers the last time this browser checked the feed per organizer and event. The requirement remains PARTIAL until the watermark is durable across browsers/devices and every material mutation writes an append-only activity event: tables that retain only `updated_at` can currently report the latest state change, not reconstruct several successive edits made between visits. |

---

## 13. Post-conference speaker messaging

Cicero sends nothing merely because a session or an event has ended. Organizers who want to reach
speakers afterwards do it manually today, through the same reviewed composer as any other message.
This section records a possible future addition; it is not a requirement and carries no
implementation commitment.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-39 | **[EXCLUDED]** | — | **Add automatic post-conference speaker messaging as a possible future feature.** Cicero currently sends no message merely because a session or event has ended; organizers can manually message accepted or scheduled speakers today. A future addition could provide an opt-in, organizer-editable follow-up after the conference, such as a thank-you, feedback request, recording link, or next-event invitation, while respecting the existing notification preferences and delivery log. This is a recorded product idea, not current implementation scope. |

---

## 14. External task-management sync

The ask: many organizing teams already run all work in **Linear or another task-management system**
such as Jira, Asana, Trello, or GitHub Issues. A Cicero to-do produced for a speaker or submission
should appear there automatically, without the organizer re-entering it, and progress recorded in
either system should be reflected in the other.

**Decision for the current release: accepted as product direction, but not scheduled to build.** The
`[EXCLUDED]` tag below describes the release boundary, not a one-way-export product decision. When
this work enters scope, the intended feature is a durable sync with the following shape.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-40 | **[EXCLUDED]** | — | **Organization-level provider connection and project mapping.** An organizer connects a Cicero organization once to a provider workspace, then maps each Cicero event to the provider team and project where its work belongs. An event may override organization defaults. Provider credentials and provider membership stay at the organization connection; individual event organizers do not each install a separate integration. Build against a provider-neutral connector contract, with **Linear as the first provider**, so Jira, Asana, Trello, or GitHub Issues can be added without changing Cicero's task model |
| AR-41 | **[EXCLUDED]** | — | **Cicero task assignments automatically create and maintain external to-dos.** When a speaker submission causes Cicero to fan out a `task_assignment` — per contact, per submission, or once for a session group — the mapped provider receives one corresponding work item without a manual export step. Its title and description identify the task, speaker or group, event, and submission; carry due date and stable Cicero links; and retain provider ID and URL so retries and backfills update the same item instead of creating duplicates. Changes to the Cicero task's name, due date, scope, or cancellation propagate outward |
| AR-42 | **[EXCLUDED]** | — | **Task state synchronizes in both directions.** Cicero `not_started`, `in_progress`, `completed`, and `waived` states map explicitly to provider states. Completing, waiving, reopening, or starting a task in Cicero updates the external work item; moving the external item between mapped states updates the Cicero assignment and the speaker/organizer views. Provider webhooks drive the normal path, a reconciliation job repairs missed deliveries, and every transition is idempotent, loop-safe, event-scoped, and visible in a sync log. A provider's completed and canceled states map separately so finishing a requirement is not confused with an organizer waiving it |
| AR-43 | **[EXCLUDED]** | — | **Project context travels with the task.** The mapped external project can carry links to the Cicero event, submission, speaker record, and relevant organizer-authored documents so the operations team can understand the to-do without hunting through Cicero. Start with canonical links and provider project metadata; copying document bodies, comments, files, or speaker PII into the provider requires a separate privacy and retention decision and is not implicit in task sync |

---

## 15. Keyboard shortcuts and power-user hotkeys

The brief never asked for keyboard shortcuts, so `01-requirements.md` contains no keyboard, hotkey,
or shortcut requirement anywhere in it. Cicero nonetheless grew them by accident: three people
independently wrote `window` keydown listeners — the command palette's ⌘K, the submission queue's
`j k x o Enter a d w` block, and the review detail's `1`–`9` scoring keys — each with its own copy of
the "are they typing?" guard and its own ad-hoc "a dialog is open, stand down" check. Nothing knew
about anything else, the help dialog listed two keys while twenty were live, and the agenda board
registered only a pointer sensor, so moving a session was physically impossible without a mouse.

The ask, recorded here as an owner requirement: **an organizer who works in Cicero all day should be
able to drive it from the keyboard**, with shortcuts that mean the right thing for the window they
are in and that a new user can discover without reading the source.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-44 | **[REQUIRED]** | SHIPPED | **One declarative shortcut registry, resolved against a scope stack.** Every binding is a row in `lib/hotkeys/registry.ts`; a single `keydown` listener in `components/hotkeys/HotkeyProvider.tsx` resolves it. Screens claim a scope while mounted (`useHotkeyScope`) and bind handlers for that scope's ids (`useHotkeys`); resolution walks the stack innermost-first, so the same key can mean one thing on the submission queue and another on the review detail without either screen knowing what the other bound. A scope marked `modal` truncates the walk at itself, which is how an open dialog silences the screen beneath it generically rather than through per-screen open-state checks. Typing targets and two-key `g`-prefixed sequences are handled once, in the engine. The two hand-rolled listeners were migrated onto it with their chord sets unchanged, fenced by a test that asserts the exact pre-migration keys (`lib/hotkeys/registry.test.ts`; shipped in `bf0a625`) |
| AR-45 | **[REQUIRED]** | SHIPPED | **Shortcuts are discoverable and cannot go stale.** `?` opens an overlay that reads the live scope stack and renders only the bindings actually active on that screen, grouped and labelled from the registry rows themselves. Because the help is generated rather than written, a shortcut cannot ship undocumented and a documented shortcut cannot quietly stop existing — the exact failure of the previous hand-written dialog. The organizer info panel links into the same overlay. Chords render platform-correctly (⌘ on Apple, Ctrl elsewhere) from an injected platform value rather than a sniff (`components/hotkeys/ShortcutsDialog.tsx`; shipped in `bf0a625`) |
| AR-46 | **[IMPORTANT]** | SHIPPED | **A session can be placed on the agenda without a mouse.** This is an accessibility gap as much as a power-user one. Rather than hand-rolling arrow-key nudges that would bypass conflict preview and the warn/block policy, the board gained a `KeyboardSensor` with a coordinate getter that snaps to the grid's existing droppable cells: space lifts a focused session, arrows walk it across rooms and time slots, space drops it — through the same drag path a pointer uses, so conflict detection, the warning toast, and `placeSessionAction` come along and no second mutation path exists. Collision detection falls back to nearest-center only when there are no pointer coordinates, leaving mouse behaviour unchanged (`app/organizer/agenda/keyboardCoordinates.ts`, `app/organizer/agenda/AgendaBoard.tsx`; shipped in `bf0a625`) |
| AR-47 | **[IMPORTANT]** | OUTSTANDING | **Extend shortcuts to the reviewer surfaces, the speaker portal, and the CRM.** Only the organizer workspace is bound today. A reviewer working `app/review/**` gets nothing — the scoring hotkeys live on the *organizer's* copy of the review screen, not theirs — and `app/portal/**` and `app/crm/**` have no shortcuts at all. The engine was built profile-aware for this: the work is mounting `HotkeyProvider` in those three shells and adding their binding tables to the same registry, not new machinery. Deferred deliberately so the engine could land and be proven on one profile first |
| AR-48 | **[OPTIONAL]** | OUTSTANDING | **Let a user remap shortcuts.** Defaults are fixed and compiled in. Personal or per-organization overrides would need a durable per-user store, which means a `db/schema.ts` change that `docs/03-plan.md` §3 freezes for feature workstreams; the owner decision was that fixed defaults are the right first release, and remapping is worth building only if the fixed set proves wrong for real users. The registry is the single source the overlay and the matcher both read, so an override layer would sit above it without touching either |

---

## 16. Reinvite speakers from a prior event

Cicero can add one CRM contact to an event today, while event duplication deliberately carries over
none of its people. What is missing for an annual conference is a workflow that starts with a prior
event's speaker roster and lets the organizer choose who should be invited back.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-49 | **[EXCLUDED]** | — | **Import speakers from a previously hosted event into a new event, individually or in bulk.** An organizer can select one, some, or all speakers from a prior event and add them to the new event without exporting and re-importing a CSV or recreating their profiles. The import reuses each person's existing account and CRM identity, creates at most one speaker record in the target event, and preserves the prior event's history rather than copying its submissions, sessions, task state, or availability. Imported speakers begin as invited, but the import does not publish them or send a message; any reinvitation remains an explicit, organizer-reviewed outreach action. This is a recorded product goal, not current implementation scope. |

---

## 17. Milestone deadlines between the CFP and the doors

The ask: an organizer can already say when submissions close (`form.closes_at`), when a review round
runs (`review_round.opens_at` / `closes_at`), and when a speaker's task is due (`task.due_at`). They
had nowhere to say when the **speaker roster** is meant to be settled or when the **agenda** is —
the two internal milestones that pace a conference between the CFP closing and the doors opening.

**These are informative, and deliberately so.** The owner's decision was that they should not be
enforced: nothing is refused, warned on, or scored against either date, and no readiness count is
derived from them. An organizer moving a talk the week of the show is ordinary conference work, and
a product that argued with them about it would be wrong. That choice is what keeps the change
additive — `mutateAgendaAtomically`, `decideSubmissions`, `setSpeakerWorkflowStatus` and
`isAcceptingSubmissions` are untouched, and `passed` in `lib/event-deadlines.ts` exists for phrasing
rather than for gating.

The columns are named `deadline`, not `lock`, for the same reason: nothing locks.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-50 | **[IMPORTANT]** | SHIPPED | **The event carries two advisory milestone deadlines: when the speaker roster is meant to be settled, and when the agenda is.** They are nullable properties of `event` (`speaker_deadline_at` / `agenda_deadline_at`), not a separate milestone entity — an event that sets neither behaves exactly as before. Both are entered as wall clock in the event's own timezone, alongside the conference window in organizer settings; the one write rule is that a milestone may not fall after the event starts, and there is no ordering between the two, because settling the agenda before the roster is legitimate. They are read on the organizer dashboard, the speaker portal, the public event page, and `/api/v1/events/:slug`, all through one shared description so no surface disagrees with another about what day it is |
| AR-51 | **[IMPORTANT]** | SHIPPED | **Each milestone reminds the organizers once inside the three days before it falls.** The send rides the existing scheduled-reminder pass and is guarded by `email_log`, so re-running it sends no duplicate. Recipients are the event's **organizers only**: both dates describe work only they can do, and a speaker has no lever on either. Speakers still read the dates — on the portal, on the public page, and through the `{{event.speakerDeadline}}` / `{{event.agendaDeadline}}` merge fields available to every template, so an acceptance email can carry the date without a second fan-out. The mails belong to their own `deadline` notification category rather than falling in with organizer announcements |

---

## 18. Moderators as a role of their own

Cicero knows what a moderator is and then does nothing with it. `participant_role_kind` carries
`moderator` alongside `speaker`, `co_speaker` and `panelist` (`db/schema.ts:74`); `F-7` lets each
form decide which of the four it offers, what to call them, and how many it wants
(`form_participant_role`); and a speaker adds one from the portal's group view
(`app/portal/[eventSlug]/group/GroupPanel.tsx:99`). Past that point the four kinds are
interchangeable. Nothing in the application branches on `kind === 'moderator'`: a moderator signs in
through the speaker portal, is asked the same participant questions, appears in the same speaker
column on the review queue, and counts the same way against the agenda's double-booking guard. The
label is the entire difference.

**No space was made for moderators anywhere, and that was deliberate rather than an oversight.**
The brief's spine is talks, rooms, tracks and a published schedule, so a panel host is a person on a
session rather than a fifth actor. [`04-user-roles-and-actions.md`](04-user-roles-and-actions.md)
names four actors — public visitor, speaker, reviewer, organizer — and moderators are in none of
them; the landing page's products-by-role grid is Organizer, Reviewer, Speaker, Attendee
(`app/page.tsx:109`) for the same reason, and got a reviewer section without gaining a moderator
one. This section exists so the next reader treats that as a decision with a follow-up attached, not
as a gap nobody noticed.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-53 | **[OPTIONAL]** | OUTSTANDING | **Differentiate the moderator role beyond its label.** Two ends, and they are not the same size. The cheap end is carrying the distinction outward to places that already model it: `toSpeakerDto` hard-codes `moderator: false` (`lib/accelevents/mapping.ts:77`) even though the Accelevents speaker DTO accepts the flag (`lib/accelevents/types.ts:26`), so a panel host pushed across arrives there as an ordinary speaker, and the public programme and the embeds likewise print the person without the role beside them. The expensive end is a moderator *surface* — a run-of-show for the panel, the panellist roster, a question queue to work from — which is a new product area rather than a fifth label, and should not be started on the strength of an enum value alone. Until one exists, the role grid on the landing page stays at four. Nothing is blocked meanwhile: an organizer who needs a moderator names the role on the form, bounds the count, and gets exactly what `F-7` promised |

---

## 19. Common-action FAQ for people and agents

Several ordinary workflows are implemented but not discoverable from one place. Registering a
speaker does not create a talk; a signed-in speaker starts a new one from the event's public CFP,
while **My sessions** only lists existing submissions and drafts. An organizer can create another
submission for the same speaker by entering the same email, which reuses the account. Adding that
person to an existing panel is a different operation: the session group gains them as a panellist,
moderator, co-speaker or speaker. The organizer can perform that operation through **View portal
as** the primary speaker, but there is no equivalent control on the organizer submission detail.

Those distinctions are reasonable once known and unnecessarily hard for a person or agent to
reconstruct. They should be recorded as product guidance rather than duplicated as prose in every
agent prompt.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-54 | **[OPTIONAL]** | OUTSTANDING | **Create one maintained FAQ for common role-scoped actions and make bot/agent guidance reference it.** Start with the speaker-to-programme path: how a registered speaker submits another talk, how an organizer creates another submission for an existing speaker, and how that speaker is added to an existing panel. Each answer should distinguish the current capability, its actual UI entry point, and any current workaround, so an agent does not mistake **My sessions** for a creation surface or invent a direct organizer panel-membership control. The role-scoped speaker and organizer guides should reference the FAQ rather than carry independent copies. This follow-up does not authorize an in-product chatbot, new mutation endpoints, or either underlying UX change; none of it is implemented by recording this requirement |

---

## Decisions

**2026-08-17 — the common-action FAQ remains follow-up work.** The speaker, submission and panel
membership capabilities already exist; the gap is a maintained explanation that both people and
agents can find. AR-54 records that discovery work without treating this document as the FAQ or
changing any bot, agent, portal or organizer behaviour.

**2026-08-16 — the milestone deadlines inform, they do not enforce.** Section 17's two dates were
the owner's, and the owner's second decision about them was that nothing may be refused, warned on,
scored, or counted against either one. That is what keeps AR-50–AR-51 additive: the placement,
decision and submission-window paths are untouched, and `passed` exists so a surface can phrase a
date, never so a caller can gate on one. An enforced version of this is a different requirement and
would have to be written as one.

**2026-08-16 — keyboard shortcuts are an owner requirement, not a brief one.** Section 15 exists
because the brief is silent on keyboard use and `01-requirements.md` must stay a faithful reading of
it. Recording the requirement here keeps that boundary intact while making the shortcut work
auditable: AR-44–AR-46 are shipped and AR-47–AR-48 are the scope that was deliberately left out.

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
| [`01-requirements.md`](01-requirements.md) | Brief-derived, frozen. AR-1 refines `S-3` (headshot upload) and `T-5` (file storage); AR-19 promotes `Z-5` (`01-requirements.md:378`) from `[BONUS]` to `[REQUIRED]`; §8 extends `B-1` from a report into a workflow without changing what `B-1` asked for. Sections 2, 3, 5, 10, 12, 13, 14 and 16 have no counterpart there — SMS is listed at `01-requirements.md:408` as genuinely absent from the brief, and MCP, intelligent agenda optimization, the update rundown, post-conference speaker messaging, and prior-event speaker import are not mentioned at all. AR-40–AR-43 specify an owner-requested task-management sync under the brief's existing optional `N-2` "other integrations" umbrella without changing that frozen row. §15 likewise has no counterpart: the brief says nothing about keyboard use, so AR-44–AR-48 are owner requirements in full and `01-requirements.md` correctly stays silent on shortcuts. §17 is adjacent to the brief without being covered by it: `P-5` and `C-2` are both about the submission form's own closing date, and AR-50–AR-51 are about the dates *after* it, so they are owner requirements too rather than a reading of either row. AR-52 is likewise owner-only: `Z-5` asks for a public API without saying who may authenticate against it, so a reviewer-scoped key is neither required nor excluded by that row. §18 sits beside `F-7` without reading it: the brief asks a form to collect participant roles with counts, which is shipped, and says nothing about the product treating a moderator differently once collected, so AR-53 is owner-only too |
| [`02-architecture.md`](02-architecture.md) | AR-23's service-layer rule, AR-25's transport choice, and AR-37's public-file authorization boundary are recorded there |
| [`03-plan.md`](03-plan.md) | Workstream ownership still applies: AR-1–AR-7 land in W2, AR-8–AR-18 in W5, AR-19–AR-27 in W7, AR-28–AR-29 in W3, AR-30–AR-34 in W6 on W5's send primitives, and AR-35 in W4 (crossing W0 for the one `event` column it adds). AR-36 is a post-v1 W4 goal and stays unassigned until optimizer work is authorized; AR-37 belongs to W6 on W2's file-storage primitives, AR-38 starts in W6 while a future append-only activity table must cross W0 deliberately, and AR-39 would be a post-v1 W5 goal that stays unassigned until that work is authorized. AR-40–AR-43 have no workstream or estimate while excluded; this preserves §2's recommendation against building unspecified integrations in the current scope. AR-44–AR-46 cut across the table rather than sitting in one row: the engine is shared infrastructure in `lib/hotkeys/` and `components/hotkeys/`, consumed by W3 (submissions), W4 (agenda) and W6 (organizer shell), and adding a binding is a registry row plus a handler in the screen its owning workstream already holds. AR-47 extends the same registry into W3's reviewer surfaces, W2's portal, and the CRM; AR-48 stays unassigned because it needs a `db/schema.ts` change that §3 freezes. AR-49 is a post-v1 cross-event CRM and speaker-roster goal and stays unassigned until that work is authorized. AR-50 sits where AR-35 does — W6 for the settings write and the dashboard read, crossing W0 for the two `event` columns it adds — and its remaining readers are W2's portal and public page and W7's event API, each consuming `lib/event-deadlines.ts` rather than owning a copy. AR-51 is W6 on W5's send primitives, like AR-30–AR-34. AR-52 is W7 like the rest of §4, but stays unassigned while optional: it needs a `db/schema.ts` change that §3 freezes, and it would cross into W3, which owns the reviewer surfaces its routes would expose. AR-53 stays unassigned for a different reason — no schema change is needed, since the enum value already exists — but its two halves belong to different owners: carrying the role outward is W7 for the Accelevents DTO and W6 for the public pages and embeds, while a moderator surface would be new W2 work rather than an extension of any row in this table |
| [`requirements-audit-checklist.md`](requirements-audit-checklist.md) | Audits brief requirements at a pinned revision. AR IDs are deliberately absent; the Status column here serves the same purpose for this scope |
