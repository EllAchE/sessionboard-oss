# Cicero — full submission narrative

**Live demo:** <https://cicero-three.vercel.app>

**Readable HTML:** <https://cicero-submission.elehche.workers.dev/>

**Repository mirror:** [`submission/index.html`](submission/index.html)

**Field survey:** <https://cicero-field-survey.elehche.workers.dev/>

**Source:** <https://github.com/EllAchE/sessionboard-oss>

**License:** MIT

**Evidence:** [`06-submission-evidence.md`](06-submission-evidence.md)

**Short form:** [`06-submission-summary.md`](06-submission-summary.md)

**Copy-ready form answers:** [`06-submission-form-answers.md`](06-submission-form-answers.md)

## Philosophy First

Anyone here has context for what was built, and why. What I want to share with you is the philosophy behind my product decisions, and how that ultimately manifested in Cicero.

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

Thanks for coming to my Ted Talk :). The above was mostly me writing, but with a bit of AI assistance/drafting. The below is purely generated so read at your own expense. If you just want the facts of the features head, I would recommend looking at the field survey that I also created and linked here. 

## The Submission

The submission is best understood in three buckets:

1. **The requested feature set:** the end-to-end replacement spine in the competition brief.
2. **Additional features we shipped:** deliberate product improvements beyond that baseline.
3. **Future features we chose not to ship:** useful next steps whose complexity, risk, or evidence did
   not justify putting them in the first release.

That distinction matters. A long feature list is not evidence of a finished product, and a roadmap
is not a shipped capability. Cicero's central claim is narrower and stronger: the complete working
spine exists, the additional work has a reason, and the omissions are named rather than hidden.

## 2. The requested feature set is covered end to end

The original requirements remain separately traceable in [`01-requirements.md`](01-requirements.md).
The following table is the submission-level view: what a judge should test, why it matters, and what
Cicero supplies.

| Requested capability | What Cicero ships | Why this is replacement-grade |
| --- | --- | --- |
| Event setup | Event creation, dates, timezone, branding, tracks, rooms, tags, formats, multi-event scoping, switching, and safe duplication of a prior edition | A judge can create a second event without contaminating the seed or reuse an operating model without carrying over people, submissions, files, credentials, logs, or integration state |
| Call for speakers | Multiple drag-and-drop forms, built-in and custom fields, conditional logic, category routing, participant roles, welcome/success pages, deadlines | The builder and public runtime use the same definition; deadlines are enforced in the page, actions, upload routes, and API |
| Cold submission | Public mobile-friendly multi-step flow, account creation inside the flow, draft/resume, review step, confirmation, portal redirect | A speaker arrives without an account and leaves with a usable portal instead of hitting an authentication seam |
| Speaker portal | Profile and bio editing, headshots, versioned slides/documents, submissions, tasks, resources, raw organizer-authored HTML, group access, availability/blackout windows, calendar download | The accepted speaker can finish the real onboarding work and declare when they cannot present without an organizer relaying every file and field by email |
| Review and decisions | Status queues, named and weighted score, dropdown, and text criteria, multi-round review, evaluation plans, routing, recusal, anonymized modes, saved views, exports, inline and bulk decisions | Routing begins at the form and drives the reviewer's queue; qualitative evidence stays beside normalized numeric scoring, and staged recommendations remain distinct from committed decisions |
| Agenda | Drag-and-drop placement, unscheduled rail, list/day/week/room/track/month views, room/track/speaker/availability conflict detection, draft share links, draft versus published state | Organizers can rearrange privately, review a private live programme with stakeholders, see physically impossible collisions, and publish only the intended programme |
| Communications | Editable templates, triggered and filtered sends, delivery log, task reminders, `.ics` invitations with stable UID and sequence, add-to-calendar links | Rescheduling updates an existing calendar item instead of leaving stale duplicates; the log answers “did we send it?” |
| Organizer dashboard | Accepted speakers with outstanding tasks, counters, linked next actions, speaker-roster and agenda milestones, accurate overdue pacing, breakdowns, five prebuilt dashboards, custom dashboards | The first screen names the people and work blocking the event instead of showing only decorative totals |
| Public output | Public event/session/speaker pages, agenda starring and personal itinerary, seven embeddable views, live sample embeds, JSON/XML/subscribable `.ics` feeds, per-event `llms.txt` | Publication is a live read of the same programme; attendees can plan without an account, and websites or agents can consume the same configured output without copied schedules |
| Required integration | One-way accepted-speaker push behind an Accelevents client interface with deterministic fixture mode | The judged path exercises real field mapping, authentication and error outcomes without inventing credentials or undocumented remote capability |
| Open-source operation | MIT source, magic-link roles, Postgres, storage abstraction, Docker Compose, Cloudflare/OpenNext target, Vercel-hosted demo, and idempotent sample events at small, medium, and large conference scales | A new operator can run the product without buying a proprietary dependency or providing an email/SMS/AI key, then inspect real queue and agenda pressure rather than judging only a toy fixture |

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

Event-level speaker-roster and agenda milestones now give the dashboard, portal, public event, and
reminder runner the same deadlines. Overdue counts include only participants who are actually late,
so the pacing signal cannot be inflated by future or completed work. Organizers reach composing,
templates, campaigns, preferences, share links, and delivery history through one **Messages** area
rather than learning the system's channel boundaries first.

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
Session, speaker, agenda, and sponsor edits also produce numbered content revisions that can be
diffed and restored; a restoration becomes a new revision, so recovery is itself undoable.
Post-conference recordings have independent organizer and public publication gates. These features
extend the lifecycle beyond “collect one slide deck” while retaining deliberate visibility control.
Recording mutations refresh the board in place, so attaching, replacing, publishing, or removing a
source does not discard the organizer's scroll and navigation context with a full document reload.

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

Event duplication handles the other half of recurrence. It copies the reusable operating model—the
taxonomy, forms, review rounds and criteria, tasks, templates, and selected content—while reopening
time-bound workflows as drafts and clearing old due dates. The clone plan is exhaustive over the
event-scoped schema and fails tests when a new table or column has no explicit copy/clear/skip rule.
People, submissions, files, share links, credentials, logs, and integration state never cross into
the new edition.

### 3.5 Reviewable drafts and attendee-owned schedules

An organizer can mint a time-limited, revocable no-login share link for the draft programme. The
preview intentionally includes draft sessions and unapproved copy for stakeholder review, while
excluding contact, accommodation, credential, and other private data. The plaintext token is never
stored, and cloning an event cannot revive or carry one forward.

After publication, attendees can star sessions directly from the agenda grid and see the same
selection as a personal itinerary. The schedule is browser-local and event-scoped: it needs no
account, does not leak one conference's choices into another, and works in the public pages and
embeds. It is deliberately personal planning, not an attendee-registration claim.

### 3.6 API and automation surfaces

Beyond the required Accelevents push, Cicero ships:

- a versioned REST API with generated OpenAPI;
- a readable, deep-linkable API reference plus a Scalar rendering and cross-origin preflight
  support for browser clients;
- signed outbound webhooks;
- a Streamable HTTP MCP server and generated manifest;
- role-scoped agent workflows;
- public agenda data used by the same public/embedded programme;
- JSON, XML, and subscribable `.ics` representations of an organizer's embed configuration;
- per-event `llms.txt` discovery for agents;
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
control. The dense queues use one truncation contract for long cell content, and numeric review
scores print their scale beside the value, so scanability does not erase meaning under load.

### Persistent actions and workspace context

The persistent **Actions** control is the discoverable form of the global keyboard layer. Every row
shows the binding that invokes the same move without opening the panel, and it includes a narrow
workspace status: Ready means a signed-in organizer and an active event in this browser. The drawer
states explicitly that this is not a live database, infrastructure, storage, or third-party health
check.

That limited promise is intentional. A permanently green “system health” badge that never queried
the system would erode trust. Workspace readiness is still useful because this is a multi-event,
multi-persona app: it confirms the context in which the next action will occur and exposes recovery
shortcuts without overstating what was measured.

### Demo-first entry and quick actions

The same persistent control opens one-click paths to search/jump, the organizer dashboard, event
creation, the speaker portal, and the active public programme. These are the escape hatches an
organizer needs when context gets lost. They also make the product easier to demonstrate without
turning the primary navigation into a wall of buttons.

The signed-out landing page now does the same job for evaluation: its organizer, reviewer, speaker,
and attendee cards each open the relevant seeded tour; the demo menu groups all role paths; and the
public embed gallery renders every view the fixture can fill with the exact script and iframe
snippets that produced it. The API reference and MCP setup prompt remain visible for an evaluator
who wants to move from the product to its automation surfaces.

The landing page also avoids repeating those claims as abstract About-page facts: API, live embeds,
and role-scoped agent setup each have one nearby proof-bearing home. The About anchor and repository
link remain, while the redundant three-column list is gone.

The default `/demo` fixture is now deliberately medium-sized: 96 submissions, 45 speakers, five
rooms, and two days. The same conference is also seeded as `/demo-small` (18 submissions, eight
speakers) and `/demo-large` (384 submissions, 180 speakers, ten rooms, and three days). The three
idempotent scales make pagination, queue density, agenda legibility, and reviewer workload visible
without changing the story being compared.

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
request. Authentication resolves the acting user once per request and reuses that result through the
server-rendered tree, avoiding repeated session/database work without weakening authorization.

This matters most where a superficial clone fails:

- submission deadlines apply to public pages, actions, uploads, and REST writes;
- blind review redacts before search, so a hidden author cannot be rediscovered by filtering;
- decisions commit before best-effort notification and only real state transitions send;
- public reads default to published, so drafts do not leak through a forgotten endpoint;
- agenda conflicts behave the same from the board and reconciliation API;
- event duplication must account for every event-scoped table and column before the clone can ship.
- malformed identifiers and caller input produce useful client errors, while a genuinely unreachable
  database produces a retryable service-unavailable response instead of an opaque 500.

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
| Placeholder sponsor slots on the public wall | The sponsor wall renders the sponsors that exist and nothing else: there is no reserved "your logo here" tile holding space in a tier that is still being sold. A dummy mark on an attendee-facing page states something untrue about who is backing the event, and an event with no sponsors 404s rather than showing an empty grid, so the page never has to invent filler | Sponsorship sales wanting a prospectus surface — which is better answered by an organizer-only or share-link preview of the wall that shows unsold slots, than by mixing real and invented logos on the public page |
| First-class PowerPoint and Google Slides decks | Speaker deck support is only PDF and Keynote today; PowerPoint and Google Slides are accepted as opaque bytes rather than as understood deck formats | Organizer or speaker demand for PowerPoint and Google Slides as supported deck formats, which we do want to add |
| Arbitrary event resource uploads | Every upload path is bound to a known slot — headshot, speaker deliverable, submission form file field, exhibitor-map PDF, recording — so type validation, size caps, and publication rules can be specific to each one. Speaker-facing reference material is organizer-written portal pages rather than attached files. A general "attach anything to the event" library would need its own permission, visibility, and retention model | Organizers wanting to publish documents that are not one of the known slots — a speaker handbook, an event history page, a media kit, a sponsor prospectus — at which point a generic resource library with per-file audience control is a better answer than another bespoke slot |
| Headshot crop and framing control | Squareness is already enforced on the way in — the browser center-crops to a 512 px square and the server rejects anything that is not exactly that — so the gallery never has to reason about mixed aspect ratios. What is deferred is letting the person choose the crop: a center crop of a wide or tall portrait can cut off the subject, and the upload surfaces say so rather than fixing it | Enough off-center portraits to be a real complaint, at which point a crop/zoom step at upload time, with the resulting frame stored alongside the image, beats asking speakers to pre-crop |

### Agent mail as the first-run setup channel

Agent mail ships as a bounded MCP slice: the server can list effective templates and redacted
delivery metadata, preview one recipient-resolved email, and send it through the same audited
transport the UI uses. Every one of those tools authenticates with an event-scoped API key.

The obvious next idea is to point that channel at setup itself — give the setup agent its own
mailbox, let it create the account and the event, have Cicero deliver the freshly minted API key to
that address, and let the agent wire up its own MCP client and keep going. Setup would become one
agent-run sequence instead of a human pausing at **Organizer → Integrations** to copy a key that is
shown exactly once. We did not build it, and the reason is ordering rather than ambition:

- **It is circular.** Agent mail is authenticated by the credential the flow is trying to obtain.
  Nothing in the send path can run before a key exists, so first-run delivery would have to be a
  separate, unauthenticated path with its own rules — not a reuse of this one.
- **Every guardrail assumes an existing event.** The recipient must already be a participant on the
  key's event, the write must echo a target-specific confirmation literal plus a content-bound
  digest, and email preference is rechecked at dispatch. None of those checks are evaluable before
  the event and its participants exist.
- **Mailing a key widens what the once-only reveal exists to contain.** Keys are stored as hashes
  and shown a single time on purpose. Emailing a live write credential to an address chosen by the
  same unauthenticated caller who is creating the account issues that credential to whoever asked,
  and leaves it sitting in an inbox and a delivery log.

`onboard-cicero` covers the same ground the safe way today: it records non-secret local state —
host, event slug, account and API-key readiness, completed milestones — resumes at the first
unfinished step, and narrates key minting instead of performing it, so the credential never leaves
the human's hands or lands in this repository's state file.

What would justify revisiting it: a verified agent identity bound to an organizer account rather
than a self-asserted address, a short-lived single-use enrollment token that exchanges for a key
instead of the key itself, and an explicit human approval on the account side before enrollment
completes. With those three, first-run delivery becomes an enrollment protocol worth building;
without them it is credential issuance on request.

### Known gaps, not strategic exclusions

- Mobile responsiveness received less design and verification time on the dense organizer
  workflows, where frequent review, triage, and scheduling work is most likely to happen on a
  desktop. That tradeoff does not extend to attendee-facing output: public programme pages and,
  especially, agenda, itinerary, and speaker embeds inside event websites need a focused mobile and
  host-site compatibility pass. Agenda starring improves the attendee path but has not replaced
  that device-and-host verification work.
- The signed-out landing page now gives organizers, reviewers, speakers, and attendees explicit demo
  entry points. A real reviewer or speaker who arrives without an invitation still has no event
  discovery path, however. Sign-in with no `next` begins at `/organizer` and relies on role-aware
  redirects to reach `/review` or `/portal`; a person with no membership is still sent toward event
  creation. The next fix is a deliberate post-authentication role/event router, not more shell
  redirects.
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

On 2026-08-16 the then-current source tree was built as a production Docker image, migrated, seeded,
and walked in Chrome. Both seed events loaded; public agenda, reserved-address magic-link sign-in,
organizer dashboard, command menu, and readiness/quick-action drawer were exercised. The hosted demo
also served the public agenda, embed, First Settlement event, organizer login, and the agenda API;
the API returned HTTP 200 with five sessions across three rooms.

The documentation refresh audited every product commit through `1017ca9`, including three-scale demo
data, per-request acting-user reuse, in-place recording-board refresh, resilient error
classification, clearer dense-table scoring, and a less repetitive landing page. It regenerated the reading copies and reran the
source checks recorded in the evidence document. A live recheck on 2026-08-17
found the same deployment boundary: the hosted demo and its five-session agenda are healthy, but the
organizer shell still uses `/admin` and the landing page predates the current demo-first revision.
The newest features in this narrative are therefore current-source claims until a fresh application
deploy closes the gap. The separate static submission Worker was refreshed and verified on 17
August, so the public reading copy now matches this branch. The screenshots, commands, and route results are preserved in
[`06-submission-evidence.md`](06-submission-evidence.md).

## 9. What we would build next

In product order rather than novelty order:

1. Deploy the current application `main` and repeat the authenticated evidence checklist so the
   hosted demo and current source are on one revision.
2. Verify a sender domain and prove real transactional email/calendar delivery without removing the
   reserved-address inbox-free demo.
3. Replace broad impersonation with scoped, dual-attributed organizer assistance.
4. Make Updates append-only and cross-device.
5. Bind headshot publication consent to the exact file version being published.
6. Build the provider-neutral task connector with Linear as the first implementation, then evaluate
   bidirectional Airtable reconciliation with explicit field ownership.
7. Re-measure public-route CPU in the target runtime and reduce the OpenNext bundle below the free
   Workers limit.
8. Evaluate intelligent agenda optimization only after demand, capacity, and schedule-quality data
   exist.

Event cloning was the highest-value product feature the brief did not ask for, and it is now part of
the submission. The next trust boundary is narrower but more important than another broad feature:
an approved headshot must remain approved only for the exact file the speaker consented to publish.

## Closing

Cicero is not an attempt to recreate every menu item in Sessionboard. It is an argument about what
an event-operations product should prioritize: a complete workflow, one source of programme truth,
fast repeated interaction for organizers, forgiving paths for infrequent speakers, human control at
consequential moments, and honest extension boundaries.

The required spine works. The additional features make it more useful than a literal clone. The
future list is specific enough to guide a next release without being presented as present-day
capability. That is the standard this submission asks to be judged against.
