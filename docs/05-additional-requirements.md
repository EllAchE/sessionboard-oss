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
| AR-2a | **[IMPORTANT]** | SHIPPED | **Make the `file_blob` ceiling visible.** The admin Files screen reports the active backend and deployment-wide Postgres blob usage, warns at 250 MiB, and names 500 MiB as the practical R2/S3 handoff (`lib/storage/index.ts`, `lib/storage/status.ts`, `app/admin/submissions/files/page.tsx`). `README.md` and `docs/02-architecture.md` explain that these are operating bounds rather than Postgres limits: blobs enlarge the primary and every backup, the app caps one file at 25 MiB, and reads traverse Worker/Hyperdrive rather than an object CDN |
| AR-3 | **[REQUIRED]** | SHIPPED | **A profile picture referenced by the public API is fetchable.** The public API and Accelevents sync now share `lib/speaker-headshot.ts`, which points at the existing `app/embed/[slug]/headshot/[fileId]` route. That route proves access structurally: the file must be the headshot of a confirmed participant on the event named in the path. An unconfirmed profile returns `null` instead of a dead `/api/files/{fileId}` URL |
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
| AR-9 | **[REQUIRED]** | SHIPPED | **Consent and opt-out.** Enabling SMS from either profile surface records destination-level consent; disabling it blocks first and writes the preference second. Every dispatch checks that record, including manually selected SMS campaigns. The signed `/api/webhooks/twilio/sms` endpoint handles Twilio Advanced Opt-Out and the standard `STOP`/`START`/`HELP` keyword families, updates every matching account, and avoids duplicate replies when Twilio already handled the keyword. Upgrades disable legacy SMS preferences until consent is renewed rather than treating an old boolean as retroactive authorization |
| AR-10 | **[REQUIRED]** | SHIPPED | **Normalize and validate phone numbers to E.164.** Profile, settings, participant, and public-API writes share `libphonenumber-js` parsing, with a configurable `SMS_DEFAULT_COUNTRY` for national input. `user.phone` also has an E.164 database check, outbound dispatch normalizes again, and the upgrade migration conservatively normalizes unambiguous legacy values while clearing values it cannot convert without guessing |
| AR-11 | **[IMPORTANT]** | SHIPPED | **Verify ownership of a phone number.** A six-digit, ten-minute OTP is bound to the signed-in user and exact E.164 destination, limited to five requests an hour and five attempts, and stored only as a digest. Log mode records the message without contacting Twilio and shows the development code only to that signed-in requester; that proof is tagged `log` and automatically becomes invalid if the deployment later enables Twilio. Changing a number clears verification and disables SMS; every dispatch fails closed until the current number is verified through the active transport |
| AR-12 | **[IMPORTANT]** | SHIPPED | **Give the default templates real SMS bodies.** All eight defaults now carry concise SMS-specific copy, remain below the 300-character limit under representative long merge values, contain only GSM-7 characters, and point somewhere whenever the corresponding email does |
| AR-13 | **[IMPORTANT]** | SHIPPED | **Record final delivery state.** Every Twilio REST send includes the signed `/api/webhooks/twilio/status` callback. Final `delivered`, `undelivered`, and `failed` states update the row by provider SID with carrier error details and a status timestamp; transient callbacks are ignored so out-of-order `sent` events cannot regress a final state. The admin SMS archive renders the final result |
| AR-13a | **[REQUIRED]** | SHIPPED | **Give `/admin/sms` the redaction `/admin/mail` already has.** The reader detects sign-in credentials, resolves the destination phone to exactly one user account, and applies `magicLinkMayBeShown` with the actual SMS transport. Missing or duplicate phone matches fail closed; Twilio cannot inherit the mail transport's log-mode exception; and a visible notice explains every withheld link |
| AR-13b | **[IMPORTANT]** | SHIPPED | **Make `{{portal.link}}` behave predictably in an SMS body.** The portal-link detector now covers subject, email body, and SMS body for both triggered and ad-hoc sends. A custom SMS template that asks for the merge field receives a minted link instead of an empty string, while previews still use a non-credential placeholder and the guarded archive handles the stored copy |
| AR-14 | **[OPTIONAL]** | SHIPPED | **Quiet hours and rate ceiling per recipient.** Both preference surfaces capture an IANA timezone, a cross-midnight-capable quiet window, and a 1–100 SMS hourly ceiling (six by default). The shared dispatcher checks successful sends in the rolling hour and suppresses SMS during the recipient's local quiet window; invalid stored timezones fail closed while email remains available |

## 3. Notification management in settings

Shipped alongside the SMS work: a "Courier edicts" tab in organizer settings
(`app/admin/settings/NotificationsPanel.tsx`) and the same three fields on the speaker profile form,
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
| AR-21 | **[IMPORTANT]** | SHIPPED | **Scoped API keys.** Keys are explicitly `read` or `write`; write includes read, while a read-only key receives 403 before either reconcile endpoint can mutate an event. Existing keys migrate to `write` so an upgrade does not silently break an integration, while the issue function and Admin → Integrations default new keys to least-privilege `read`. Scope is visible in the key ledger and the OpenAPI security description (`api_key.scope`, `requireApiKey(request, slug, requiredScope)`) |
| AR-22 | **[OPTIONAL]** | SHIPPED | **Outbound webhooks** fire on `submission.received`, `submission.decision_made`, and `session.scheduled`. Per-event endpoints are managed under Admin → Integrations; signing secrets are revealed once, bodies carry delivery IDs and timestamps, and `X-Cicero-Signature` is an HMAC-SHA256 over the raw JSON. Local, private, link-local, and metadata-network targets are rejected before storage; Cloudflare additionally enforces public-only fetches. Delivery status, response code, and errors are retained in `webhook_delivery`, while a failed endpoint never rolls back the lifecycle write that triggered it (`lib/webhooks.ts`) |

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

## 7. Assisted chasing

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
deliberate signal. That is why AR-30 exists: the same reviewed draft has to be able to leave through
the organizer's own mail client, not only through Cicero's transport.

Cicero already had the send primitives — `previewParticipantEmail` and `sendParticipantEmail` in
`lib/services/comms.ts` — but only the MCP agent surface reached them. No organizer screen did.

| ID | Tag | Status | Requirement |
| --- | --- | --- | --- |
| AR-28 | **[REQUIRED]** | SHIPPED | **Every outstanding-task row can be chased from where it is read.** A per-row "Draft a nudge" control on the `B-1` report opens a composer prefilled with copy specific to that person and that task — overdue by how long, which sessions it blocks, a one-click portal link. Composition is a pure function (`composeTaskNudge`) so the wording is regression-tested rather than buried in JSX (`lib/services/task-nudge.ts`, `app/admin/dashboard/OutstandingTasks.tsx`, `app/admin/dashboard/NudgeComposer.tsx`) |
| AR-29 | **[REQUIRED]** | SHIPPED | **Nothing leaves without a human reading it.** The composer is two-step: edit, then render, then send — and any edit invalidates the rendering. This is enforced on the server, not in the client: `sendTaskNudge` requires the reviewed subject/body/recipient back and passes them to `sendParticipantEmail`, which re-resolves the recipient and re-renders the message and refuses if either moved. There is no bulk action, no "remind all", and no code path from a table row to an outbound message that skips the render |
| AR-30 | **[IMPORTANT]** | SHIPPED | **The draft can escalate to the organizer's own address.** Once rendered, the composer offers *Copy* and *Send from my own email* (`mailto:`) beside *Send from Cicero* — the same reviewed text, handed to the human instead of the transport. This is the escalation-by-medium finding, and it is the one thing an autosender structurally cannot do |
| AR-31 | **[IMPORTANT]** | SHIPPED | **A settled task is never chased.** Completed and waived assignments get no button, and both the draft and send paths re-check status against the live report — so a task finished while the composer was open fails closed. A successful send stamps `task_assignment.last_reminded_at`, which is the same field the cron reminder reads, so the automatic reminder does not chase someone a human chased an hour ago. The row shows when that person was last reminded |
| AR-32 | **[EXCLUDED]** | — | **Autonomous or scheduled chasing from this surface.** Declined on the evidence above. Cicero does keep its opt-in `task.reminder` cron flow, which is a template an organizer configured in advance for a whole event; this surface is the opposite act — one person, one task, one message, sent by a named human. Conflating them is exactly how the tools in that archive lost their users |

**Behavior on the `log` transport.** The hosted deployment runs `MAIL_TRANSPORT=log` on purpose
(§2, and the on-screen magic link judges sign in with depends on it). Assisted chasing is fully
exercisable there: the draft renders, the review gate applies, and the send lands in `email_log`
under `templateKey: 'task.nudge'`, visible at Admin → Mail. The organizer is told which of the two
happened rather than being shown a false "delivered" — and *Send from my own email* delivers for
real regardless of transport.

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
| [`01-requirements.md`](01-requirements.md) | Brief-derived, frozen. AR-1 refines `S-3` (headshot upload) and `T-5` (file storage); AR-19 promotes `Z-5` (`01-requirements.md:378`) from `[BONUS]` to `[REQUIRED]`; §7 extends `B-1` from a report into a workflow without changing what `B-1` asked for. Sections 2, 3 and 5 have no counterpart there — SMS is listed at `01-requirements.md:408` as genuinely absent from the brief, and MCP is not mentioned at all |
| [`02-architecture.md`](02-architecture.md) | AR-23's service-layer rule and AR-25's transport choice belong there once decided |
| [`03-plan.md`](03-plan.md) | Workstream ownership still applies: AR-1–AR-7 land in W2, AR-8–AR-18 in W5, AR-19–AR-27 in W7 |
| [`requirements-audit-checklist.md`](requirements-audit-checklist.md) | Audits brief requirements at a pinned revision. AR IDs are deliberately absent; the Status column here serves the same purpose for this scope |
