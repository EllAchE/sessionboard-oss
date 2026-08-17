# Field backlog

What the rest of the field built that Cicero did not, ranked in the order Cicero would pick it up.

## Where this comes from

[`docs/alternatives/`](alternatives/README.md) is a survey of 32 other implementations of the same
frozen brief, each read from source at a pinned commit. It produced 48 capabilities that appear in
at least one of those 32 codebases and in none of Cicero's, catalogued as `AD-1`…`AD-48`. The prose
record is one file per project in that directory; the structured record is
`docs/alternatives/data/features.json`, which carries each item's title, description, convergence
count, and the project slugs it is attributed to.

This document is the next step: a priority order over those items, with the reasoning shown.

**Five have been taken off the ranking below** — they are not "skipped", they are shipped or are
someone's current work:

| | | |
|---|---|---|
| `AD-2` | Speaker availability / blackout windows | shipped — [#194](https://github.com/EllAchE/sessionboard-oss/pull/194) |
| `AD-11` | Per-event `llms.txt` | shipped — [#188](https://github.com/EllAchE/sessionboard-oss/pull/188) |
| `AD-4` | Revision history with organizer restore | in review — [#200](https://github.com/EllAchE/sessionboard-oss/pull/200) |
| `AD-9` | Tokenized no-login share links | in review — [#201](https://github.com/EllAchE/sessionboard-oss/pull/201) |
| `AD-1` | Whole-event cloning / reusable event templates | in flight — [#199](https://github.com/EllAchE/sessionboard-oss/pull/199) |

`AD-4` was the one item the survey mis-scored against Cicero. Most of it already existed —
`recordRevision`, `listContentRevisions` and `restoreContentRevision` in `lib/services/content.ts`
were a complete record → list → diff → restore loop before any of this work started. What #200 adds
is a monotonic revision number and coverage for the agenda and sponsors, not the feature.

That leaves 43 items, all of which appear below exactly once.

### Convergence is evidence about the brief, not a grade

The convergence count is "how many of the 32 analyzed teams independently built this thing." A high
count is used here as evidence that *the brief implies the capability* — when five teams who never
spoke to each other all read "publish the finished program back out to the event website" and all
concluded it needed more than an iframe, that is information about the requirement, not about the
five teams.

It is emphatically **not** a quality judgment. It says nothing about how well anyone built anything,
and a count of 1 does not mean a bad idea — several of the single-team items below outrank
four-team items in this ranking. The survey's own rule holds here: describe, do not grade.

Two asymmetries carried over from the survey are worth restating, because they bound how hard this
ranking can lean on the numbers. Attribution is positive-only — a project with no attribution for
`AD-n` was not verified to lack it, only not recorded as having it, so every count is a floor. And
the field is 32 hackathon-window projects, not the commercial products in this space.

## The rubric

Each item was scored on four axes. They are stated plainly so a reader can disagree with the
weighting rather than only with the outcome.

1. **Convergence** — how many of the 32 teams built it. Highest nominal weight, for the reason
   above. Range in this document: 1 to 5.
2. **Leverage on what Cicero already has** — does the item *complete an existing investment*, or
   does it *open a new surface*? Cicero already ships an MCP server (`lib/mcp/server.ts`), a
   versioned REST API with a generated OpenAPI contract (`app/api/v1/**`), role-scoped agent skills
   (`.agents/skills/`), a cross-event speaker CRM (`lib/services/crm.ts`), sponsors
   (`lib/services/sponsors.ts`), and advisory AI review and agenda drafting (`lib/ai/`). An item
   that finishes one of those ranks above an item of equal convergence that starts a new one:
   it is cheaper, and it compounds with work already paid for.
3. **Implementation cost** — a T-shirt size assessed by reading Cicero's code, not by guessing from
   the title. What drives the size is named for each item. The usual drivers, in rough order of how
   much they cost here: a new public surface > a new third-party dependency > a new table >
   widening an existing type > a new query over existing tables.
4. **Risk of not having it** — is the gap a *correctness or trust* problem (something is silently
   wrong, unattributable, or published without permission) or a *missing feature*? Correctness gaps
   rank above features of equal convergence.

**Where the axes disagree, the tie is broken toward risk, then leverage, then cost, then
convergence.** Convergence has the highest weight as *evidence*, but it is evidence about the brief,
and the brief is not the only input — Cicero has documented product decisions
(`docs/01-requirements.md`, `docs/05-additional-requirements.md`) that a majority of the field did
not share. Every place the order departs from the convergence count, the departure is stated in the
item's rationale rather than smoothed over.

One structural note on cost: `docs/03-plan.md` §3 freezes the schema, service signatures, and
`components/ui` across workstream boundaries. Any item marked as adding a table or widening an enum
is therefore a W0 (foundation) change plus its owning workstream, and that coupling is part of why
those items are sized where they are.

---

## Tier 1 — Pick up next

Four items. Each either completes an investment Cicero has already made, or closes a gap where the
current behaviour is not merely thin but arguably wrong.

`AD-8`, the in-product AI assistant, would otherwise sit in this tier on leverage alone. It is not
here: it has been declined outright on inference cost, and the reasoning is under
[Deliberately declining](#deliberately-declining) rather than in a ranking of things to pick up.

### 1. `AD-3` — Richer embed output formats · convergence 5 · **S**

The joint-highest convergence in the whole catalogue, and the cheapest item in this tier. Cicero
already has every piece except the plumbing: seven HTML widget views (`EMBED_VIEWS` in
`app/embed/model.ts`), an auto-resizing script-loader snippet (`public/embed.js`), correct
iCalendar generation with stable UIDs and sequences (`lib/ics.ts`, `app/embed/calendar.ts`), and a
public JSON agenda at `app/api/v1/events/[slug]/agenda/route.ts`. What is missing is that these are
five separate surfaces rather than five renderings of one widget configuration — there is no XML
feed, no *subscribable* `.ics` URL (only per-session and per-itinerary downloads via
`app/api/calendar/[sessionId]/route.ts`), and the JSON lives on a different route with different
options than the embed the organizer actually configured. The survey notes this confirms a gap
Cicero had already recorded against itself.

*Touches:* `app/embed/**`, `lib/ics.ts`, `public/embed.js` (W6, borrowing W5's calendar primitives).
No schema change.

**Shipped.** `app/embed/[slug]/[view]/[format]/route.ts` serves `feed.json`, `feed.xml` and a
subscribable `feed.ics` off the same query string the script and iframe snippets carry, so the
organizer's filters, field selection and limit are one configuration rendered six ways. The studio
also gained the two controls this item implied but did not name: a custom-CSS field and an explicit
publication-status filter.

### 2. `AD-19` — Hash-chained audit ledger, taken as the append-only half · convergence 1 · **M**

Ranked second on a convergence of 1, which is the largest single departure from axis 1 in this
document, and it is deliberate. Cicero's own requirements already declare this gap:
`docs/05-additional-requirements.md` AR-38 is tagged **PARTIAL**, and the stated reason is verbatim
that "every material mutation writes an append-only activity event" is not yet true. The
consequence is visible in `lib/services/updates.ts`, which reconstructs the organizer's "what
changed while I was away" feed by scanning `updated_at` across eight tables — so two successive
edits between visits collapse into one, and a change with no surviving row cannot be reported at
all. `db/schema.ts` has no audit table; `contentRevision` (`db/schema.ts:1131`) covers only
`session` and `participant` content, and `contactActivity` (`db/schema.ts:1715`) is CRM-only. This
is a correctness gap in a tool whose job includes answering "who decided this."

The scope taken here is deliberately the smaller half. The catalogued item is a *hash-chained* ledger
plus checksummed whole-workspace export and import; what is ranked second is the append-only event
table underneath it. Tamper-evidence and workspace export are a separate decision and do not need to
be made now — the table does, because four other items depend on it.

*Touches:* new `activity_event` table (W0), write sites across `lib/services/**`,
`lib/services/updates.ts` and `app/organizer/updates/**` (W6). The routing is already recorded —
`docs/05-additional-requirements.md` states that "AR-38 starts in W6 while a future append-only
activity table must cross W0 deliberately" — so the ownership question is settled before the build
starts. Unblocks `AD-36`, cheapens `AD-34` and `AD-44`, and is the missing substrate under
`AD-14`'s audit trail.

### 3. `AD-45` — Headshot publication consent bound to the current file · convergence 1 · **S**

Cheapest item in the tier and the clearest trust gap in the catalogue. Grepping `consent` across
`db/schema.ts` and the file services returns only `sms_consent` — SMS is the one place Cicero models
permission. There is no consent flag of any kind on `file` or on `participant.headshotFileId`, and
`file` already supports supersede-by-version (`rootFileId` / `version`, `db/schema.ts:1042`), which
means the exact failure the attributed project designed against is reachable here: a speaker
approves a headshot for publication, later replaces the file, and the replacement inherits a
publication path nobody granted for it. Cicero publishes headshots on public speaker pages and in
the gallery embed, so the failure is not hypothetical.

Ranked above several higher-convergence items because a wrongly-published photograph of a real
person is a different category of defect from a missing feature, and because the fix is one nullable
column plus a check at the publish boundary.

*Touches:* `file` or `participant` (W0, one column), `lib/services/files.ts` /
`lib/speaker-headshot.ts` (W2), public speaker page and gallery embed (W6).

### 4. `AD-5` — Bidirectional Airtable sync · convergence 5 · **L**

Joint-highest convergence, ranked last in the tier, and the disagreement is worth naming: this is
the item where axis 1 and axis 3 point hardest in opposite directions. `lib/airtable/mirror.ts:29`
states the current design as a deliberate one — "`Z-2`, one way only. Airtable is a mirror an
organizer's team can build views over, never the store" — and
`airtable_sync` (`db/schema.ts:1621`) records only push status. Making it bidirectional means field
ownership, conflict resolution, retries, and dead-lettering, which is not an extension of a
best-effort mirror but a replacement for it.

It stays in Tier 1 anyway because five independent teams reading the same optional `Z-2` row all
built the reconciling version, which is strong evidence the one-way reading is the minority one. But
it is the tier's biggest single commitment, and it is the one item here that cannot be verified
without a live third-party account — a constraint `docs/05-additional-requirements.md` already
records against the existing integration.

*Touches:* `lib/airtable/**` and `airtable_sync` (W7), inbound webhook route, reconciliation job.

---

## Tier 2 — Worth doing

Twenty-two items, ordered. Everything here is a real gap with a real answer; nothing here is urgent
enough to displace Tier 1, and several are cheap enough that they would sensibly be folded into
whatever adjacent work is already open.

### 5. `AD-46` — Two-step content publication gate · convergence 1 · **S/M**

`contentApprovalStatus` already exists (`db/schema.ts:169`: `in_review` / `approved` /
`changes_requested`) on `submission.contentStatus`, and it already gates public visibility —
`app/embed/queries.ts` filters on `contentStatus = 'approved'`. What is missing is that approval
attaches to the *live row* rather than to a *revision*: `updateSessionContent` and
`updateSpeakerContent` (`lib/services/content.ts`) never touch `contentStatus`, so an organizer
editing an already-approved abstract changes what the public sees with no return to `in_review`.
Pinning the approved revision is small precisely because `contentRevision` snapshots already exist
to pin. Sequence this after `AD-4` lands, since it consumes the same table.

*Touches:* `content_revision` / approval columns (W0), `lib/services/content.ts` (W2), public page
read path (W6).

### 6. `AD-44` — Immutable numbered program publication snapshots · convergence 1 · **M**

Publication today is `scheduled_session.status = 'published'`, one row at a time
(`scheduledSessionStatus`, `db/schema.ts:140`); the only `published_at` column in the whole schema
belongs to `session_recording`. So there is no answer to "what did the program look like when we
announced it," and no unpublish that is distinguishable from deleting rows. Pairs naturally with
`AD-19` — a publication event is an activity event with a payload — and with `AD-29`.

*Touches:* new snapshot table (W0), `lib/services/schedule.ts` publish path (W4), public agenda (W6).

### 7. `AD-38` — AI-seeded scorecards the server refuses until confirmed · convergence 1 · **S/M**

Narrower than the title suggests, because the bridge already half-exists.
`ai_review.criterion_scores` stores per-criterion AI suggestions as `{criterionId, value, note}[]`
(`db/schema.ts:969`), kept deliberately apart from `score` because "an AI opinion is advisory and
must never be averaged into a human panel's numbers", and
`app/organizer/submissions/[submissionId]/ReviewDetail.tsx` already offers a "Copy into my
scorecard" action that pulls those values into the reviewer's form with the note "Nothing is saved
until you submit." What is missing is that the guarantee is *client-side*: the copy is form state,
and the save path cannot distinguish a value a reviewer read and agreed with from one they never
looked at. This item makes the server the enforcer — track which criteria were seeded, refuse the
save until each is confirmed or changed — which is the same server-enforced review gate `AR-31`
applies to outbound mail.

*Touches:* `lib/services/review.ts` and the reviewer scorecard (W3). No schema change beyond a
per-criterion confirmation flag.

### 8. `AD-48` — AI-drafted decision emails and schedule notices · convergence 1 · **M**

Fits Cicero's documented shape better than almost anything else in the catalogue. `AR-30`–`AR-33`
built assisted chasing on an explicit finding — the tool drafts, a human reviews and sends — and
`AR-34` declined autonomous sending outright. Applying the same composer to decision notices is
consistent with that decision rather than in tension with it. The work is real because
`decideSubmissions` (`lib/services/review.ts:2657`) currently sends notices inline as part of the
batch write, so a draft-and-review step has to be introduced between the decision and the send.
The "preserve required portal/checklist facts" half is the interesting constraint: it means the
draft is validated against merge-field presence, not just rendered.

*Touches:* `lib/services/review.ts`, `lib/services/comms.ts` (W3/W5), `lib/ai/` (W9).

### 9. `AD-36` — Fail-closed audit persistence on private REST reads · convergence 1 · **S**

Small, and blocked on `AD-19`. Today `requireApiKey` (`app/api/v1/_lib/auth.ts`) best-effort updates
`api_key.last_used_at` and nothing else, so an organizer-scoped read of `/submissions` leaves a
timestamp but no record of *what* was read. Once an activity ledger exists, making token-scoped
private reads write to it — and fail the read if the write fails — is a handful of lines at one
choke point. Ranked here rather than higher only because its cost is almost entirely `AD-19`'s.

*Touches:* `app/api/v1/_lib/auth.ts` and `respond.ts` (W7).

### 10. `AD-26` — Resubmit-with-guidance as a first-class decision · convergence 1 · **S/M**

`submissionStatus` (`db/schema.ts:65`) is `draft / submitted / under_review / accepted / declined /
waitlisted / withdrawn`. There is no state for "we want this, not like this," so an organizer who
wants a revision has to either decline it or leave it under review and say so out of band. The
decision machinery is otherwise complete — `decision_note` already exists and already exports
(`AR-29`) — so this is one enum value, one required-guidance validation, and a portal state that
lets the speaker edit a submitted proposal again.

*Touches:* `submission_status` enum (W0), `lib/services/review.ts` (W3), portal (W2).

### 11. `AD-22` — Named acceptance waves · convergence 1 · **M**

Cicero already stages decisions without committing them: `submission_stage` is
`accept / decline / hold` (`db/schema.ts:92`), the schema comment is explicit that staging "is not a
decision and never writes a status," and `decideSubmissions` is already a batch commit that clears
staging. So roughly half of this item is built. What is missing is that a stage is a single global
queue — there is no way to have "wave 1" and "wave 2" staged simultaneously, no name on a release,
and no history of which wave a talk went out in.

*Touches:* new wave table plus a `submission` FK (W0), `lib/services/review.ts` and the decision
queue (W3).

### 12. `AD-39` — Cancellable queued decision notices · convergence 1 · **M**

`email_log.status` has a `queued` value (`db/schema.ts:130`), but it is a transient in-flight marker
rather than a hold window: `sendMail` (`lib/mail/index.ts`) inserts the row as `queued`, then invokes
the transport and updates the same row to `sent` or `failed` inside the one call, and
`decideSubmissions` reaches it inline and returns `notified` / `notifyFailed` counts. So there is no
moment at which a notice exists and has not yet gone. There is also nowhere to intervene from —
`app/organizer/mail/` is a read-only log viewer with no cancel, edit, or resend action. A
cancellable queue means a real deferral with a scheduled
drain, a cancel path with an audited reason, and recipient correction before the replacement goes.
Cicero has the cron infrastructure for the drain (`app/api/cron`, `lib/cloudflare-cron.ts`,
`vercel.json`), which is what keeps this at M. Sequence with `AD-48`: they touch the same send path
and would be wasteful done separately.

*Touches:* `email_log` or a new outbox (W0), `lib/services/comms.ts` and the cron route (W5).

### 13. `AD-18` — Automatic reviewer-company conflict recusal · convergence 1 · **M**

Recusal is already modelled well: `review_recusal` (`db/schema.ts:908`) is submission-scoped rather
than round-scoped, survives the assignment it was made against, carries a reason, and has an
explicit `released` state so an organizer's "yes, they may read this" sticks against the next
auto-assign. Automatic detection exists but only for *authorship*: `conflictsFor`
(`lib/services/review.ts`) computes, on every routing pass, the users who are the submitter or a
co-speaker. Affiliation is the gap. The speaker side of that data is there —
`participant.company` (`db/schema.ts:750`) — but reviewers are plain `user` rows with no affiliation
field, so the cost is dominated by giving reviewers a company at all, and by deciding whether a
detected conflict *creates* a recusal or *proposes* one. Given how carefully the existing table
treats a recusal as a remembered human decision — every row today originates in a reviewer
explicitly declining an assignment — proposing is the reading that fits.

*Touches:* reviewer affiliation column (W0), `lib/services/review.ts` auto-assign and queue (W3).

### 14. `AD-37` — Mixed-type rubric criteria · convergence 1 · **M** · **built**

`scorecard_criterion` (`db/schema.ts:853`) carried `weight` and `max_score` and nothing else, and
`score.value` was `integer` (`db/schema.ts:947`) — the rubric was numeric by construction. Adding
single-select and free-text criteria meant a type discriminator on the criterion, a widened answer
column on `score`, and a decision about what a non-numeric criterion contributes to
`weightedScore` (`lib/review-scoring.ts`) and to the CSV export. That last part was the real cost:
the weighted average is load-bearing for the decision queue's bar
(`review_round.decision_queue_bar_tenths`), so "this criterion has no number" had to mean something
precise rather than being silently skipped.

The answer taken was to make it mean *out of scope for the number*: `aggregateScorecard` reads only
the numeric criteria, non-numeric ones are stored with `weight: 0` so no later reader has to exclude
them twice, and submission gating moved to a separate `scorecardComplete()` — ratings and dropdowns
are required, a written criterion is an invitation. The bar therefore means exactly what it always
did. Landed against eval finding `ABS-03`.

*Touches:* `scorecard_criterion` + `score` (W0), `lib/review-scoring.ts`, `lib/services/review.ts`,
reviewer scorecard (W3).

### 15. `AD-34` — Public incremental changes feed · convergence 1 · **M**

The REST API returns whole collections with `Cache-Control: public, max-age=30`
(`app/api/v1/_lib/respond.ts`) and supports no `since` cursor, no sequence numbers, and no ETags. A
consumer wanting to stay current re-fetches everything. This is the natural companion to `AD-19` —
a monotonic sequence over an append-only activity table is most of the feed — and it is the item
that would make the existing API genuinely integrable rather than merely readable. Ranked below
the review-half items because nothing is *wrong* today, it is just expensive to consume.

*Touches:* `app/api/v1/**` and `lib/services/public-api.ts` (W7), depends on `AD-19`.

### 16. `AD-13` — Privacy export and erasure · convergence 2 · **M**

`lib/services/account.ts` exposes exactly `getAccountProfile` and `saveAccountProfile`; there is no
export path and no deletion path anywhere in the app. Cicero holds speaker bios, headshots,
dietary and accessibility notes (`participant`, `db/schema.ts:757`), phone numbers, and a
cross-event CRM, which makes the absence of a self-service export or erasure a real gap for a
self-hostable product that a European organizer might run. Cost is M and it is all in the erasure
half: the schema is heavily `on delete cascade`, so deletion is easy and *correct* deletion —
preserving the program while removing the person — is not.

*Touches:* `lib/services/account.ts` (W2), a new export route, cascade audit across `db/schema.ts`.

### 17. `AD-10` — OAuth 2.1 authorization server for MCP · convergence 2 · **L**

Uniquely well-motivated by Cicero's own documents. `docs/05-additional-requirements.md` §"Still
open" names this as the one remaining question that blocks a build: "Who is the MCP server for? An
organizer pointing their own assistant at their event implies per-user scoping; an integrator
implies the per-event API key in AR-24 is enough." Two teams answered it the per-user way. Today
`app/api/v1/events/[slug]/mcp/route.ts` authenticates with the same `requireApiKey` bearer lookup as
REST, and there is no `.well-known` route, no authorization-code flow, no dynamic client
registration, and no PKCE anywhere in the repo. L because an authorization server is a security
surface, not a feature — it is the wrong thing to build in a hurry.

*Touches:* new `.well-known` and authorization routes, client/grant/refresh tables (W0),
`lib/mcp/server.ts` and `app/api/v1/_lib/auth.ts` (W7).

### 18. `AD-12` — Accelevents preview/apply against the live platform · convergence 2 · **S/M**

Listed as a gap, but the honest description is narrower than the title: Cicero *has* the preview/apply
diff machinery. `lib/accelevents/program.ts` implements `ProgramSyncMode = 'preview' | 'apply'`,
`planProgramSync()` computes create/update/delete operations, and `reconcileProgram()` gates deletes
behind `allowDeletes`. What it does not do is run against the real platform:
`reconcilePublishedProgram()` throws unless the gateway is the fixture one, with the comment "Full
program reconciliation is fixture-only. Live Accelevents supports the documented accepted-speaker
push." Against live credentials only the one-way `pushAcceptedSpeakers()` in `lib/accelevents/sync.ts`
runs. So the work is mapping the existing planner onto the live API — small in code, and gated on
account access Cicero does not currently have.

*Touches:* `lib/accelevents/client.ts` and `program.ts` (W7).

### 19. `AD-40` — Persistent cross-device attendee schedules · convergence 1 · **S/M**

`app/embed/views/ItineraryWidget.tsx` keeps starred sessions in `localStorage`, and its header
comment explains why: "an attendee reading an embedded widget on somebody else's website has no
reason to sign in." That reasoning is sound for the embed and is the right default. The gap is that
there is no path *out* of it — the public itinerary page at `app/(public)/[slug]/itinerary/` has the
same limitation, and Cicero has no attendee account of any kind. The cheap version is the one the
attributed project shipped: persist for a signed-in user, keep the anonymous localStorage path as
the fallback. The expensive version is inventing an attendee identity, which is why this is not
higher.

*Touches:* new starred-session table (W0), `app/(public)/**` and the itinerary widget (W6).

### 20. `AD-28` — Printable organizer run-of-show · convergence 1 · **S**

There is no `@media print` rule and no print view anywhere in `app/` or `components/`. A conference
day is run off paper or a tablet at the back of a room, and the organizer surfaces are all
interactive tables. The "authorized deliverable links" half is the part that needs thought —
printing a page with links to speaker slides means deciding what a link on a printout is allowed to
reach — but the layout itself is one route over data `lib/services/schedule.ts` already returns.

*Touches:* new organizer print route and stylesheet (W4/W6).

### 21. `AD-24` — Primary-manager delegation · convergence 1 · **M**

`participant_role` already carries `is_primary` and a `kind` of
`speaker / co_speaker / moderator / panelist` (`db/schema.ts:74`, `:776`), and the flag is
load-bearing rather than decorative — `lib/services/portal.ts` gates withdrawal, group task
management, and roster removal on it. Two things are missing. Every role kind is a *speaking* one,
so a non-speaking manager cannot be represented at all. And primacy is assigned once, at creation,
from list position (`isPrimary: position === 0` in `lib/services/submissions.ts`) — there is no
transfer action anywhere in `app/` or `lib/`, let alone one that holds the incumbent in place until
the new person accepts. The handoff is the part with product content in it, and it is why this is M
rather than S.

*Touches:* `participant_role_kind` enum plus a handoff table (W0), `lib/services/submissions.ts` and
`participants.ts`, portal (W2).

### 22. `AD-29` — Named agenda draft variants · convergence 1 · **L**

Cicero has no agenda scenarios. `saved_view` (`db/schema.ts:1641`) is a per-user filter preset, not
a variant, and `scheduled_session.status` is per-session rather than a program-wide draft mode.
Duplicate / diff-against-live / selectively-accept is a genuinely useful shape for the one task that
is hardest in a scheduling tool — trying an arrangement without destroying the current one — but it
means every agenda query gains a variant dimension, and `mutateAgendaAtomically`'s per-event
advisory lock (`lib/services/agenda-guard.ts`) has to decide what it is locking. Sequence after
`AD-44`, whose snapshot is the diff target.

*Touches:* `scheduled_session` variant key (W0), all of `lib/services/schedule.ts` /
`agenda-atomic.ts` / `agenda-guard.ts` and the board (W4).

### 23. `AD-42` — Sponsor tiers with contacts, onboarding tasks, and form routing · convergence 1 · **M**

The one place in the field where another implementation went deeper than Cicero on Cicero's clearest
differentiator, which makes it worth reading carefully. `sponsor` (`db/schema.ts:468`) has free-text
`tier`, and the schema comment defends that choice well — tiers are named differently at every
conference and nothing joins against them. That defence holds for *display* and stops holding the
moment tiers route work: onboarding tasks per tier need a tier to be an entity. The blocker is
structural rather than incidental: `lib/services/sponsors.ts` states "**Nothing depends on a
sponsor.** No other table carries a `sponsor_id`", and sponsor contacts and sponsor tasks both
break that invariant deliberately.

*Touches:* `sponsor_tier` / `sponsor_contact` tables and a `sponsor_id` on tasks (W0),
`lib/services/sponsors.ts` and `tasks.ts` (W6/W2).

### 24. `AD-43` — Public sponsor/exhibitor intake forms · convergence 1 · **M**

Sponsors are organizer-entered only — `lib/services/sponsors.ts` guards every write with
`requireCapability(ctx, 'event:manage')`, and the public surface is three read-only functions. The
form engine is the reusable half, but it does not currently reach here: `form_target_type` is
`abstract | session` (`db/schema.ts:43`) and every completed form writes a `submission` row. A
sponsor intake form is a third target, which is a real extension of the form contract rather than a
new form. Sequence after `AD-42`, since "reviewed into tiered partner groups" presumes tiers exist.

*Touches:* `form_target_type` enum (W0), `lib/forms/contract.ts` and `lib/services/forms.ts` (W1),
`lib/services/sponsors.ts` (W6).

### 25. `AD-35` — Direct Sessionize speaker-profile import · convergence 1 · **S/M**

No occurrence of "Sessionize" in the codebase outside the survey docs. The value is concentrated in
one moment — a speaker filling in the public CFP form who already maintains a profile elsewhere —
and Cicero already has the target shape for it: `lib/services/participants.ts` normalizes inbound
speaker fields with an alias table (`company` / `organisation` / `organization` / `org` /
`employer` / `affiliation`), so the mapping layer exists. Cost is a third-party fetch and its
failure modes, not a data model.

*Touches:* `lib/services/participants.ts` (W1), public CFP form (W1).

### 26. `AD-32` — First-party TypeScript SDK and CLI · convergence 1 · **M**

`package.json` has no `bin` and there is no `sdk/` or `cli/` directory; `scripts/` holds internal
`tsx` scripts only. The unusual thing here is that the hard prerequisite is already done — the
OpenAPI 3.1 document is *generated from the Zod schemas* rather than hand-maintained
(`scripts/generate-openapi.ts`, `app/api/v1/openapi.json/route.ts`, `AR-19`), so a generated client
cannot drift from the API. That is exactly the investment an SDK completes. It is last in this tier
because it is packaging and release work — a second publishable artifact with its own versioning —
rather than product, and because `AD-34` would change the client's shape enough that doing it first
is wasted.

*Touches:* new package plus release wiring, generated from `docs/openapi.json` (W7/W8).

---

## Tier 3 — Only if a user asks

Nine items. Each is a coherent thing to want and none is wrong; they are here because they open
surfaces Cicero does not currently have, for a demand nobody has expressed against Cicero
specifically. Ordered by how small a nudge it would take to move them up.

### 27. `AD-27` — Predecessor-linked carry-forward lane · convergence 1 · **M**

Blocked on `AD-1`, which is in flight. Nothing links one event to another today —
`lib/services/events.ts` `createEvent()` is a from-scratch insert with no source-event parameter —
and cloning will have to establish that link anyway. Once it exists, "invite or discard last year's
proposals" is a query and a lane in the submissions queue. Worth revisiting the moment cloning
lands; premature before then.

### 28. `AD-25` — Approval-gated AI import planning across CSV/XLS/XLSX/ODS · convergence 1 · **L**

Cicero imports CSV only: `lib/csv.ts` is a hand-written RFC-4180 parser, and
`app/organizer/submissions/import/ImportSubmissions.tsx` sets `accept=".csv,text/csv"`. There is no
spreadsheet parser dependency. The AI planning half fits Cicero's approve-then-apply pattern well,
but the format half means a new binary-parsing dependency inside a Workers/Vercel runtime, and the
"deterministic idempotent application" half means an operation log. Large, and the current CSV path
is not visibly failing anyone.

### 29. `AD-47` — In-app problem reporting · convergence 1 · **S/M**

No bug-report form, no CAPTCHA or Turnstile, no incident routing anywhere — anti-abuse is entirely
the Postgres rate limiter (`lib/rate-limit.ts`). The privacy-redaction half has a good precedent to
build on (`lib/mail/redact.ts`), and the delivery half is `lib/services/comms.ts`. Cheap; it is here
rather than in Tier 2 because a self-hosted product's problem reports go to the self-hoster, and
what "an incident policy" means is theirs to decide, not Cicero's.

### 30. `AD-14` — Organization-level team administration · convergence 3 · **XL**

Highest convergence in this tier, and the item whose placement is most likely to be wrong. There is
no organization entity: `membership` is `(userId, eventId, role)` (`db/schema.ts:291`), `event` has
a single `owner_user_id`, and there is no invitation table — access is granted directly by
`grantRole`. Two things argue for moving it up. Cicero's own `AR-40` already presumes one ("An
organizer connects a Cicero **organization** once to a provider workspace"), and the CRM already
sits above events by hanging off `contact.owner_user_id` rather than an event — which is a
tenant-shaped hole filled with a user id. It stays here because introducing a tenant above every
event-scoped table in a 90-table schema is the single largest change in this document, and because
the thing it would unlock (`AR-40`) is itself excluded.

### 31. `AD-31` — Organization-level branded multi-program sites · convergence 1 · **XL**

Strictly downstream of `AD-14` — there is no organization to brand. Cicero has per-event branding
already (`lib/event-branding.ts`, `portal_theme`, `portal_page`), so the raw material exists, but
a multi-program site with custom pages and versioned privacy consent is a second product surface
sitting on a tenant that does not exist.

### 32. `AD-30` — Organizer-defined roles with per-field hide/edit policies · convergence 1 · **L**

`membership_role` is a fixed Postgres enum of three values and capabilities are a hardcoded table in
`lib/context.ts` (`CAPABILITIES: Record<MembershipRole, readonly Capability[]>`), gating whole
actions rather than fields. This is not an oversight: `db/schema.ts:193` records that "`role` decides
which surface a session may enter and nothing more — `E-8` (Sessionboard's permission grid) stays
excluded." So this item asks Cicero to reverse a stated exclusion, which is a product decision
rather than a backlog item. The "preview as role" half is nearly free by contrast, because full
impersonation already exists (`startImpersonation`, `lib/auth.ts`).

### 33. `AD-41` — Self-expiring per-visitor demo sandbox · convergence 1 · **M**

Cicero solves the same judge-can't-reach-a-demo problem a different way: `lib/demo-access.ts` gates
on-screen magic links behind four independent conditions, and `docs/06-submission-narrative.md`
argues that case at length. A per-visitor sandbox with a global cap and a purge job is the more
generous answer and the more expensive one, and it would need the rate limiter, a tenancy notion,
and a recurring purge. Worth building if the demo deployment ever gets abused; not before.

### 34. `AD-23` — Cross-conference historical program corpus · convergence 1 · **L**

The nearest thing Cicero has is the CRM, which is genuinely cross-event by design
(`db/schema.ts:1659`: "The speaker database sits *above* events… a speaker who came back for the
third year running should not be re-keyed") and already supports reversible merges. A historical
*program* corpus with field provenance and auditable link/split/relink is a different and larger
object than a contact directory, and it presumes archives to ingest.

### 35. `AD-15` — Awards · convergence 1 · **L**

Nominations, committee ballots, attendee voting, tallies, and winner notifications. Every piece has
a near-neighbour in Cicero — rubric scoring, rounds, decision notices — and none of them is the same
thing. Attendee voting in particular needs an attendee identity Cicero does not have (see `AD-40`).
A coherent feature, cleanly separable, waiting on someone to want it.

---

## Deliberately declining

Eight items. These are not ranked low; they are declined, because they conflict with a decision
Cicero has already made and written down, or because they belong to a product Cicero is not. Saying
so plainly is more useful than burying them at position 43.

### `AD-8` — In-product streaming AI assistant with tool use · convergence 4 · **L**

On leverage this is the strongest item in the whole catalogue, and it is declined anyway. **The
reason is inference cost, and it is a product-economics decision rather than a technical one.**

Every other item in this document is paid for once, in engineering time. An in-product assistant is
paid for on every keystroke, forever, and by us rather than by the organizer: a chat surface with
tool use runs the full tool registry through a model on each turn, so the bill scales with how much
people like the feature. Cicero's existing MCP surface is the deliberate alternative — it is
out-of-band precisely so that the cost sits with whoever brings their own client and their own key.
That is why the MCP server exists and this does not.

The build cost is the lesser half, and worth recording because it is genuinely small. Cicero has
already built every hard part except the chat surface: `lib/mcp/tools.ts` defines ten tools
including mutating ones (`cicero_mail_send`, `cicero_program_reconcile`), `lib/mcp/server.ts` wires
them to transport-neutral service functions, and — critically — `AR-31` already established
Cicero's answer to the approval question, server-side: the send path "requires the reviewed
subject/body/recipient back and passes them to `sendParticipantEmail`, which re-resolves the
recipient and re-renders the message and refuses if either moved"
(`docs/05-additional-requirements.md`). An in-product assistant is the same tool registry and the
same review gate behind a different front end — L only because streaming responses, persisted
threads, and a per-mutation approval step are a new surface.

The survey's framing that "Cicero's AI is advisory-only and out-of-band" is accurate but undersells
it: the out-of-band surface is fully tool-capable. It simply has no organizer-facing client, on
purpose.

**What would reverse this:** organizer-supplied API keys, or a plan tier priced to carry inference.
Both make the cost land somewhere other than us, which is the only objection.

### `AD-6` — Authentication beyond magic links · convergence 5

Joint-highest convergence in the catalogue, and declined anyway — the clearest case in this document
of evidence about the brief losing to a documented product decision. `T-4a`
(`docs/01-requirements.md:358`) is "magic-link auth everywhere — every role, no passwords anywhere in
the system", `lib/auth.ts:26` restates it as "Magic links everywhere, passwords nowhere (`T-4a`)",
and `user` has no password column. `docs/06-submission-narrative.md` §"Magic-link-only auth" argues the case, including
the observation that the incumbent itself uses magic links for reviewers and AV crew. Five teams read
the brief as permitting more; Cicero read it as permitting less on purpose, and the demo deployment's
on-screen-magic-link path (`T-7a`, `lib/demo-access.ts`) is built on that reading.

One narrow carve-out worth recording rather than hiding: passkeys are not passwords, and the
attributed WebAuthn implementation does not actually violate the letter of `T-4a`. If magic-link
deliverability ever becomes the binding constraint, passkeys are the re-entry point — not passwords,
and not third-party OAuth.

### `AD-7` — Real-time collaborative agenda over Durable Objects + WebSockets · convergence 4

Declined on infrastructure, not on desirability. Cicero's production deployment is Vercel
(`vercel.json`, with the daily cron at `/api/cron`), so Cloudflare Durable Objects are not available
to it; `wrangler.jsonc` has no `durable_objects` block and `custom-worker.ts` only wraps the OpenNext
fetch handler and a scheduled trigger. Cicero's answer to concurrent agenda edits is a Postgres
per-event advisory lock inside the mutating transaction (`pg_advisory_xact_lock` in
`lib/services/agenda-guard.ts`), which makes concurrent writes *correct* without making them
*collaborative*. The gap that remains is live invalidation for a second operator's browser — a real
gap, but one that would be solved with polling or SSE here rather than by adopting a runtime the
deployment does not run on.

### `AD-17` — Versioned external policy language · convergence 1

A rules DSL for CFP routing, form visibility, review governance, and schedule conflicts, with
persisted traces. Cicero deliberately keeps each of those as code at a single decision point —
`blockingConflicts()` is described in `docs/05-additional-requirements.md` AR-35 as "the single
decision point shared by the board, the transactional guard, and `/api/v1` program reconcile, so the
UI and the API cannot disagree about what saves." A policy language is the opposite architecture:
it makes those decisions data, and it makes the language itself a product with a version, a parser,
and a debugger. It is a defensible design; it is not Cicero's, and adopting it halfway would be
worse than either end.

### `AD-20` — Attendee social layer · convergence 1
### `AD-21` — Attendee-facing Q&A concierge · convergence 1

Declined together, for one reason: **Cicero has no attendees.** There is no attendee account,
no attendee table, and the only attendee-facing state in the product is `localStorage` in an embed
widget (`app/embed/views/ItineraryWidget.tsx`), by explicit design — "an attendee reading an
embedded widget on somebody else's website has no reason to sign in." The eight-step spine in
`docs/00-goals.md` §"The workflow we have to make work end to end" runs from the CFP form to a
program "published back out to the event website as an embeddable schedule and speaker gallery",
and stops there; attendees are the audience for the output, not users of the system. Mutual connections, follows, and a per-attendee metered
concierge each presume an identity that would have to be invented first, and inventing it is a
larger product decision than either feature. `AD-40` is the small, bounded version of the same
question and is ranked in Tier 2 for exactly that reason.

### `AD-33` — Deployable AWS SES infrastructure stacks · convergence 1

Declined on a recorded decision. `docs/05-additional-requirements.md` AR-2 carries an explicit
"Decision (2026-08-13): the hosted demo does not get a payment method", and §455 of the same
document states the principle behind it — "the point of a self-hostable product is that the operator
picks the backend." `lib/mail/config.ts` implements exactly that: `resend`, `smtp`, and `log`,
chosen by env var. A
shipped CDK stack for one specific provider inverts that — it makes Cicero opinionated about a
self-hoster's cloud account. The *transport-agnostic* half of what SES buys is worth taking
separately: `email_status` is only `queued / sent / failed` (`db/schema.ts:130`), with no bounce or
complaint state, and adding those does not require adopting SES.

### `AD-16` — Embargo-aware poster hall · convergence 1

Posters with board assignments, embargo windows, and visitor bookmarks are an academic-conference
shape; the brief's spine is talks, rooms, tracks, and a published schedule. Cicero's one
physical-space feature is deliberately minimal — `AR-37` ships the exhibitor map as an uploaded PDF
and explicitly excludes booths, hotspots, and wayfinding — and a poster hall would need exactly the
booth-and-region model that decision declined, plus embargo logic on top. If an academic organizer
ever asks, this is a fork of `AR-37`'s "future work" list rather than a new area.

---

## Reading this list against itself

Three patterns are worth naming, because they say more than any individual row.

**The convergence signal and Cicero's decisions disagree at the top.** Three of the ranked items
share the highest count of 5, and they land in three different places: `AD-3` 1st, `AD-5` 6th,
`AD-6` declined outright. Identical evidence, three outcomes, because of what each one collides
with. `AD-3` contradicts nothing Cicero decided, so the evidence carries it. `AD-5` contradicts a
design note — `Z-2`, the one-way mirror — and a note is exactly the kind of decision five
independent readings should be able to reopen. `AD-6` contradicts a `[REQUIRED]` row, `T-4a`, which
they should not. The gradation is the rubric working as intended rather than a flaw in it.

**Most of the cheap wins are half-built.** `AD-3`, `AD-22`, `AD-38`, `AD-46`, `AD-12`, and `AD-36`
are all cases where Cicero has the schema, the primitive, or the machinery and is missing the last
connection — a subscribable URL, a name on a queue, a bridge between two tables that were
deliberately kept apart. That is what "leverage on existing investment" means concretely, and it is
why the ranking is not simply the convergence column sorted.

**The single largest structural gap has a convergence of 1.** No append-only activity ledger
(`AD-19`) is the root cause of a requirement Cicero has already marked PARTIAL (`AR-38`), and it
blocks or cheapens `AD-36`, `AD-34`, `AD-44`, and `AD-14`'s audit trail. One team out of 32 built
the full hash-chained version. Convergence is evidence about the brief; it is not evidence about
what a given codebase most needs next, and this row is the sharpest illustration of the difference.
