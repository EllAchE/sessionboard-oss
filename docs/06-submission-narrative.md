# Cicero — full submission narrative

> **Dated competition artifact.** This narrative and its evidence capture were prepared on 16
> August 2026. Use [`../README.md`](../README.md), [`README.md`](README.md), and the latest CI run for
> the maintained operating state.

**Live demo:** <https://cicero-three.vercel.app>

**Readable HTML:** <https://cicero-submission.elehche.workers.dev/>

**Repository mirror:** [`submission/index.html`](submission/index.html)

**Field survey:** <https://cicero-field-survey.elehche.workers.dev/>

**Source:** <https://github.com/EllAchE/sessionboard-oss>

**License:** MIT

**Evidence:** [`06-submission-evidence.md`](06-submission-evidence.md)

**Short form:** [`06-submission-summary.md`](06-submission-summary.md)

## The submission in one sentence

Cicero is a self-hostable, open-source replacement for the part of Sessionboard an event team
actually uses: it carries a conference from call for speakers, through review and scheduling, to
speaker onboarding, communications, and a published programme—then adds the operational visibility,
safe automation, and keyboard ergonomics that frequent organizers need.

The submission is best understood in three buckets:

1. **The requested feature set:** the end-to-end replacement spine in the competition brief.
2. **Additional features we shipped:** deliberate product improvements beyond that baseline.
3. **Future features we chose not to ship:** useful next steps whose complexity, risk, or evidence did
   not justify putting them in the first release.

That distinction matters. A long feature list is not evidence of a finished product, and a roadmap
is not a shipped capability. Cicero's central claim is narrower and stronger: the complete working
spine exists, the additional work has a reason, and the omissions are named rather than hidden.

## 1. The problem and the product point of view

The competition brief explicitly says that the incumbent has features the AI Engineer team does not
use, and that exact visual cloning is not the goal. We treated that as a product constraint:

> Coverage of the real conference workflow beats feature parity with an accumulated product.

A beautiful CFP builder that ends before review is not a replacement. A polished agenda without a
speaker portal still leaves the organizer in spreadsheets and email. The priority was therefore to
make the whole journey coherent:

```text
create event → open CFP → receive proposals → review → decide → schedule
     → onboard speakers → communicate → publish → embed and integrate
```

The product thesis underneath the implementation is equally simple:

> Keep the human in control, but remove the clerical work that makes conference operations
> miserable.

That boundary is visible throughout the system. AI proposes review notes and agenda placements but
does not accept a talk or publish a schedule. Cicero can draft a targeted task reminder but does not
silently send it. External programme updates can be previewed and replayed idempotently before they
are applied. The product helps a person move faster without pretending it understands the political,
commercial, and interpersonal context that makes conference work difficult.

## 2. The requested feature set is covered end to end

The original requirements remain separately traceable in [`01-requirements.md`](01-requirements.md).
The following table is the submission-level view: what a judge should test, why it matters, and what
Cicero supplies.

| Requested capability | What Cicero ships | Why this is replacement-grade |
| --- | --- | --- |
| Event setup | Event creation, dates, timezone, branding, tracks, rooms, tags, formats, multi-event scoping and switching | A judge can create a second event without contaminating the seed; the taxonomy used by forms, review, and agenda is shared rather than copied |
| Call for speakers | Multiple drag-and-drop forms, built-in and custom fields, conditional logic, category routing, participant roles, welcome/success pages, deadlines | The builder and public runtime use the same definition; deadlines are enforced in the page, actions, upload routes, and API |
| Cold submission | Public mobile-friendly multi-step flow, account creation inside the flow, draft/resume, review step, confirmation, portal redirect | A speaker arrives without an account and leaves with a usable portal instead of hitting an authentication seam |
| Speaker portal | Profile and bio editing, headshots, versioned slides/documents, submissions, tasks, resources, raw organizer-authored HTML, group access, calendar download | The accepted speaker can finish the real onboarding work without an organizer relaying every file and field by email |
| Review and decisions | Status queues, named and weighted scoring, multi-round review, evaluation plans, routing, recusal, anonymized modes, saved views, exports, inline and bulk decisions | Routing begins at the form and drives the reviewer's queue; staged recommendations remain distinct from committed decisions |
| Agenda | Drag-and-drop placement, unscheduled rail, list/day/week/room/track/month views, room/track/speaker conflict detection, draft versus published state | Organizers can rearrange privately, see physically impossible collisions, and publish only the intended programme |
| Communications | Editable templates, triggered and filtered sends, delivery log, task reminders, `.ics` invitations with stable UID and sequence, add-to-calendar links | Rescheduling updates an existing calendar item instead of leaving stale duplicates; the log answers “did we send it?” |
| Organizer dashboard | Accepted speakers with outstanding tasks, counters, linked next actions, pacing, breakdowns, five prebuilt dashboards, custom dashboards | The first screen names the people and work blocking the event instead of showing only decorative totals |
| Public output | Public event/session/speaker pages, gallery, itinerary, agenda and five embeddable views with stable snippets | Publication is a live read of the same programme; existing websites do not need copied schedules or replacement embed code |
| Required integration | One-way accepted-speaker push behind an Accelevents client interface with deterministic fixture mode | The judged path exercises real field mapping, authentication and error outcomes without inventing credentials or undocumented remote capability |
| Open-source operation | MIT source, magic-link roles, Postgres, storage abstraction, Docker Compose, Cloudflare/OpenNext target, Vercel-hosted demo | A new operator can run the product without buying a proprietary dependency or providing an email/SMS/AI key |

The complete browser path is mapped in the demo runbook, and the current seed plus hosted smoke
results are recorded in [`06-submission-evidence.md`](06-submission-evidence.md). The important proof
is not the number of screens. It is that each stage hands valid state to the next stage.

## 3. What we built beyond the brief

The extra features are not a grab bag. Each one closes a failure mode in the baseline workflow,
makes frequent use faster, or gives an open-source operator an extension point.

### 3.1 Operational follow-through

#### Assisted speaker chasing

The brief asks for accepted speakers with outstanding tasks. Cicero goes further: every outstanding
row can open a nudge already tailored to that speaker, task, deadline, blocked sessions, and portal
link. The organizer edits it, renders the final message, and then chooses whether to send through
Cicero, copy it, or open it in their own email client.

The human review is enforced server-side. If the recipient, text, or task state changes between
preview and send, the send is refused. Completed and waived work cannot be chased; a successful
manual nudge updates the same reminder timestamp the scheduled reminder flow reads.

We deliberately stopped before “remind everyone.” Evidence from years of real event operations
showed that escalation moves from system email, to a personal address, to text, to a call. The value
is knowing who needs attention and preparing the right message—not allowing a cron job to impersonate
the organizer's judgment.

#### Notifications and updates

The organizer Updates feed reconstructs material changes across submissions, decisions, reviews,
speaker details, tasks, agenda moves, content revisions, and files. It is intentionally marked
partial: the current watermark is browser-local and some source tables preserve only the latest
update rather than an append-only history. The shipped slice is useful, but we do not claim it is a
complete durable audit log yet.

#### Review permalinks and decision-note exports

Reviewers and organizers can copy stable submission links and preserve decision context outside the
live queue. This is small functionality with disproportionate operational value: committee work
spills into Slack, email, and meetings, and a durable link is the difference between a shared object
and a screenshot nobody can revisit.

#### Full organizer assistance in the speaker portal

An organizer can enter a speaker's portal and actually finish stuck work, then return to organizer
mode. The incumbent's read-only preview cannot solve the support case. The current version still
needs tighter scoping and durable dual-actor attribution on every mutation; that hardening is named
in the roadmap rather than disguised as complete auditability.

### 3.2 Programme quality and richer event output

#### Speaker double-booking and a configurable conflict policy

The brief names room and track conflicts. Cicero also detects the public failure that matters most:
one speaker scheduled in two rooms at the same time. Events can choose `warn` or `block`. Physical
impossibilities are errors; a track overlap remains an editorial warning because parallel sessions
inside a broad track can be legitimate. The same decision function governs the board and the API.

#### Versioned files and recordings

Speaker deliverables retain versions and comments instead of overwriting the previous upload.
Post-conference recordings have independent organizer and public publication gates. These features
extend the lifecycle beyond “collect one slide deck” while retaining deliberate visibility control.

#### Sponsors, exhibitors, and an exhibitor-map embed

The data model and public programme include sponsor/exhibitor entities. Organizers can also upload a
validated PDF exhibitor map and expose it through a stable public embed. We stopped at the static
document boundary: interactive booths, hotspots, search, and wayfinding would be a different product
surface and are not implied by “map support.”

### 3.3 Communication safeguards

Cicero adds SMS as a second channel, but only with the preconditions that make it defensible:
consent, E.164 normalization, OTP verification, delivery state, and quiet hours. It also adds
per-notification preferences and tokenized no-login unsubscribe. The hosted demo uses log transport,
so these paths are implemented and tested but not presented as production-proven Twilio delivery.

The key product decision is that a channel is not merely an API call. Preferences, proof of control,
time-of-day policy, and an audit trail are part of the feature.

### 3.4 CRM and cross-event continuity

The speaker CRM sits above a single event and adds custom fields, import, reversible merges, dynamic
and curated segments, and a sourcing pipeline. This was initially excluded and then deliberately
built because recurring conferences do not experience speakers as isolated rows recreated every
year. The event remains the unit of programme truth; the CRM supplies cross-event memory.

### 3.5 API and automation surfaces

Beyond the required Accelevents push, Cicero ships:

- a versioned REST API with generated OpenAPI;
- signed outbound webhooks;
- a Streamable HTTP MCP server and generated manifest;
- role-scoped agent workflows;
- public agenda data used by the same public/embedded programme;
- an Airtable mirror path;
- preview/apply/idempotency patterns for programme reconciliation.

These are not separate implementations of the business rules. Server Components, Server Actions,
REST, and MCP all call the same service layer. That is what makes automation a real product surface
rather than a second, weaker copy of the UI.

## 4. Ergonomics: designed for repeated organizer use

Cicero serves two very different usage patterns. A speaker may visit twice in a year and needs an
obvious, forgiving flow. An organizer may live in the product for weeks and repeat the same review,
scheduling, and follow-up actions hundreds of times. The interface should not force both users into
the same interaction model.

### Keyboard-first paths

The organizer ergonomics borrow a tactic from Linear: frequent users should be able to stay in the
keyboard flow and keep context, while every action remains available by mouse and every shortcut
stays inactive while the user is typing or a dialog owns focus.

Current source includes:

| Context | Keyboard behavior |
| --- | --- |
| Anywhere in the organizer shell | `⌘K` / `Ctrl-K` opens a fuzzy command menu for organizer views and common actions |
| Submission queue | `j` / `k` move, `x` selects, `o` or `Enter` opens, `a` / `d` / `w` decides, uppercase variants stage recommendations, `Esc` clears selection |
| Review detail | `j` / `k` move between submissions, arrows move through criteria, number keys score, `s` saves, `c` commits, and decision keys accept/waitlist/decline |
| Manual submission | `⌘Enter` / `Ctrl-Enter` submits |

The point is not to advertise a clever shortcut list. It is to reduce the distance between “I have
another forty proposals to process” and the next valid action. Keyboard behavior has guardrails:
inputs and editable regions win, modifier collisions are ignored, and confirmation dialogs retain
control.

### Persistent workspace readiness

The persistent Health control answers a narrower question than its label might suggest: **is this
browser ready for organizer work?** Today, Ready means a signed-in organizer and an active event.
The drawer states explicitly that it is not a live database, infrastructure, storage, or
third-party health check.

That limited promise is intentional. A permanently green “system health” badge that never queried
the system would erode trust. Workspace readiness is still useful because this is a multi-event,
multi-persona app: it confirms the context in which the next action will occur and exposes recovery
shortcuts without overstating what was measured.

### Quick actions

The same persistent control opens one-click paths to search/jump, the organizer dashboard, event
creation, the speaker portal, and the active public programme. These are the escape hatches an
organizer needs when context gets lost. They also make the product easier to demonstrate without
turning the primary navigation into a wall of buttons.

The interactive helper shown in that drawer is still a preview, not a shipped assistant. The
distinction is visible in the interface and retained in this submission.

## 5. Architecture choices that protect the product claims

### One service layer for UI and API

```text
app/api/v1/**      thin REST handlers, Zod validation, API-key auth
app/**             Server Components read; Server Actions write
lib/services/**    domain rules shared by every entry point
db/**              Drizzle schema, migrations, seed
```

The UI does not call Cicero's own HTTP API. Both UI and API call the same service function. A
conflict rule, deadline, publication filter, authorization check, or idempotency guard therefore has
one implementation. The MCP layer also calls services directly rather than making a loopback HTTP
request.

This matters most where a superficial clone fails:

- submission deadlines apply to public pages, actions, uploads, and REST writes;
- blind review redacts before search, so a hidden author cannot be rediscovered by filtering;
- decisions commit before best-effort notification and only real state transitions send;
- public reads default to published, so drafts do not leak through a forgotten endpoint;
- agenda conflicts behave the same from the board and reconciliation API.

### A hybrid submission schema

Title, description, format, track, level, and status are typed Postgres columns because the review
queue, agenda, exports, filters, and conflict rules query them directly. Form-specific answers live
in JSONB because they are read as a bundle on detail/export views. This preserves flexible forms
without turning core programme data into an untyped blob.

Conditional logic is intentionally limited to one reference to an earlier field, and hidden values
are cleared at submit. That rule eliminates cycles and contradictory visibility paths by
construction.

### Magic links, with an inbox-free seed

There are no passwords. Tokens are short-lived, single-use, and stored as hashes before redemption
into an HTTP-only session. Seeded identities use reserved domains and can receive a guarded on-screen
demo link; real accounts fail that eligibility test. All messages are also recorded in the internal
mailbox when log transport is active.

This keeps a judge from being blocked by deliverability while ensuring that a fake demo address can
never send mail to a real person.

### Advisory AI

AI review produces a suggestion beside human scoring and never writes submission status. The agenda
assistant proposes placements and never commits them. Both retain deterministic fallbacks when no
model key is configured, so the product shape remains testable without a paid service.

### Reversible hosting

The application is Bun + Next.js + React + TypeScript, with Drizzle over Postgres and a storage
resolver that prefers R2, then S3-compatible storage, then database blobs. Docker Compose starts the
app, Postgres, and MinIO without third-party credentials. OpenNext/Cloudflare and Vercel use the same
application code.

Cloudflare Workers remains a supported target, but the hosted competition demo runs on Vercel. A
measured OpenNext upload was 3.42 MiB compressed: over the Workers Free 3 MiB limit and under the
Paid 10 MiB limit. This is a hosting-plan constraint, not a claim that the bundle cannot run on
Workers.

## 6. What we deliberately did not build

“Not built” contains several different decisions. Some items were explicitly excluded by the brief;
some are responsible deferrals; some are honest gaps to close. They should not be collapsed into one
roadmap list.

### Explicitly excluded or intentionally deferred

| Feature | Why it was not in v1 | What would justify revisiting it |
| --- | --- | --- |
| Payments and invoices | The brief explicitly says they are not needed; adding money movement would expand security, tax, refund, and support scope | A real customer requirement with a defined processor and accounting boundary |
| Autonomous per-person chasing | The evidence favored escalation by a named human and by communication medium; silent bulk reminders would undermine that model | Measured organizer demand plus opt-in cadence, clear ownership, stop conditions, and auditability |
| Intelligent agenda optimization | A useful optimizer needs audience-overlap signals, expected demand, room capacity, speaker constraints, tunable objectives, and evaluation against real schedules | First-class demand/venue data and a corpus of accepted schedules against which to calibrate |
| Automatic post-conference messages | Ending an event is not consent to send a message; the right follow-up varies between thank-you, feedback, recording, and next-event invitation | Opt-in event policy, editable content/timing, existing preference enforcement, and delivery-log integration |
| Presigned direct uploads | The current storage abstraction keeps validation and authorization in the application and is adequate for conference-sized files | Proven large-file or throughput pressure that warrants the additional upload-state and cleanup model |
| Interactive exhibitor map | Static PDF upload and embed satisfies the current operational need | Demand for booths, hotspots, wayfinding, search, or region links as a first-class product |

### Known gaps, not strategic exclusions

- Mobile responsiveness received less design and verification time on the dense organizer
  workflows, where frequent review, triage, and scheduling work is most likely to happen on a
  desktop. That tradeoff does not extend to attendee-facing output: public programme pages and,
  especially, agenda, itinerary, and speaker embeds inside event websites need a focused mobile and
  host-site compatibility pass.
- The hosted deployment uses log transport, so real transactional delivery and calendar arrival have
  not been proven there even though message generation and `.ics` behavior are tested.
- R2 and Twilio adapters are implemented and tested but have not been exercised against paid
  production accounts.
- Organizer impersonation needs narrower scope and durable attribution of both organizer and
  speaker on every assisted mutation.
- Updates needs a durable cross-device watermark and an append-only activity source for complete
  history.
- The requirements audit is a pinned snapshot and should be re-run against the submission commit.
- The hosted demo was on an older revision during the 2026-08-16 verification; see
  [`06-submission-evidence.md`](06-submission-evidence.md).

## 7. Proposed integrations and why each is useful

External task management is the most valuable unbuilt integration family because Cicero knows the
work that must happen, but many operations teams coordinate their day somewhere else. The proposed
architecture is organization-level provider connection, event-to-project mapping, stable external
IDs and URLs, webhook-driven status updates, reconciliation for missed events, and explicit
loop-safe state mapping.

**Linear first.** Linear is the best first provider for a technical event team and the clearest
reference for Cicero's own keyboard ergonomics. A Cicero task can become an issue with owner, due
date, event/submission context, and a canonical link. Completion in either product can update the
other without asking engineers to watch a second task list.

**Jira.** Larger organizations already run programme, marketing, legal, and production work in Jira.
Mapping Cicero assignments into a project lets conference tasks participate in existing workflows,
permissions, reporting, SLAs, and automation instead of creating a parallel operating system.

**Asana.** Event and marketing teams often organize campaigns, launches, and dependencies in Asana.
Cicero tasks would become actionable work inside the project where venue, sponsorship, and content
work already lives, preserving assignees and dates while linking back to the canonical speaker data.

**Trello.** Smaller and volunteer-run events benefit from a low-configuration visual board. A
Trello connector can turn onboarding work into cards and lists without forcing the team to adopt a
more structured issue tracker.

**GitHub Issues.** Developer conferences often coordinate content and production in the same
repository as their website or tooling. Issues provide a familiar place for technical owners to
track session assets, demos, and programme changes, with repository-level notifications and links to
the source that depends on the work.

The provider-neutral contract is more important than any one logo. Cicero should own the conference
task and its event scope; the provider should own team workflow. Stable IDs prevent retries and
backfills from duplicating work. Completed and canceled provider states must map separately so
finishing a requirement is not confused with an organizer waiving it.

The first version should send **canonical links and project metadata**, not copy speaker PII, files,
comments, or document bodies into third-party systems. Replicating that content requires a separate
privacy, access, deletion, and retention decision.

Other useful integration directions follow the same rule:

| Integration direction | Incremental value | Boundary |
| --- | --- | --- |
| Calendar providers | Give speakers and organizers live programme updates where their time is managed | Preserve stable UID/sequence and do not turn calendar edits into an unreviewed source of programme truth |
| Slack or Teams | Deliver actionable operational alerts and deep links where staff coordinate | Avoid copying sensitive speaker content; require explicit channels and rate/cadence controls |
| CRM/marketing systems | Carry consented speaker and attendee relationships across annual events | Cicero remains source of truth for programme data; consent and field mapping must be explicit |
| Additional event platforms | Push accepted speakers/programme into the execution platform a venue uses | Begin one-way and previewable; add inbound sync only after ownership and conflict rules are defined |
| Storage/video providers | Publish approved files and recordings without duplicating large media | Keep publication gates and deletion semantics in Cicero |

## 8. Evidence and demo status

On 2026-08-16 the current source tree was built as a production Docker image, migrated, seeded, and
walked in Chrome. Both seed events loaded; public agenda, reserved-address magic-link sign-in,
organizer dashboard, command menu, and readiness/quick-action drawer were exercised. The hosted demo
also served the public agenda, embed, First Settlement event, organizer login, and the agenda API;
the API returned HTTP 200 with five sessions across three rooms.

The same pass found that the hosted demo uses the older `/admin` organizer shell while current source
uses `/organizer`. The public and authenticated core is working, but the newest ergonomics should be
demonstrated from current source until a fresh deploy closes that parity gap. The screenshots and
route-by-route results are preserved in [`06-submission-evidence.md`](06-submission-evidence.md).

## 9. What we would build next

In product order rather than novelty order:

1. Deploy current `main` and repeat the evidence checklist so the hosted demo and submission images
   are on one revision.
2. Verify a sender domain and prove real transactional email/calendar delivery without removing the
   reserved-address inbox-free demo.
3. Replace broad impersonation with scoped, dual-attributed organizer assistance.
4. Make Updates append-only and cross-device.
5. Build the provider-neutral task connector with Linear as the first implementation.
6. Add event cloning: copy taxonomy, forms, tasks, templates, and selected content into a new edition
   without copying submissions or private speaker state.
7. Re-measure public-route CPU in the target runtime and reduce the OpenNext bundle below the free
   Workers limit.
8. Evaluate intelligent agenda optimization only after demand, capacity, and schedule-quality data
   exist.

Event cloning is the highest-value product feature the brief did not ask for. Conference teams repeat
an edition annually; the correct clone would preserve their operating system while creating clean
programme and participant state.

## Closing

Cicero is not an attempt to recreate every menu item in Sessionboard. It is an argument about what
an event-operations product should prioritize: a complete workflow, one source of programme truth,
fast repeated interaction for organizers, forgiving paths for infrequent speakers, human control at
consequential moments, and honest extension boundaries.

The required spine works. The additional features make it more useful than a literal clone. The
future list is specific enough to guide a next release without being presented as present-day
capability. That is the standard this submission asks to be judged against.
