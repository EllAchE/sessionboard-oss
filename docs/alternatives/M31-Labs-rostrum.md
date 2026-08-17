# M31-Labs/rostrum

**Source:** <https://github.com/M31-Labs/rostrum> · **Live:** <https://rostrum.m31labs.dev>
**Found via:** pre-cloned survey batch
**Analyzed:** 2026-08-16 at commit `7dbab2a`

## Stack
Go 1.26 with GoSX server-rendered file routes, an Arbiter policy engine, a whole-workspace aggregate persisted to JSON, SQLite, or PostgreSQL, hand-written CSS, and signed sessions supporting magic links, WebAuthn passkeys, and optional GitHub/Google OAuth.

## Scale
Approximately 45,780 lines of source and test code across 233 files. The checkout contains 48 commits, 1 distinct commit author, and a commit span of 2026-08-09..2026-08-13. Git reports this clone is not shallow.

## Feature coverage
Verified against Go handlers, aggregate operations, policy programs, presenters, and tests.

| Area | Coverage | Code evidence |
|---|---:|---|
| CFP intake | ✓ | Multiple editable forms, reordered fields, conditional questions, open/close enforcement, drafts, withdrawal, confirmation, rate limits, routing, and public submission handlers are implemented. |
| Review rounds & scoring | ✓ | `ReviewPlan`, explicit assignments, balanced auto-assignment, weighted criteria, reviewer portals, score updates, recusal, quorum, round management, and chair overrides are implemented. |
| Anonymized review | ✓ | `ReviewPlan.Anonymous` is enforced in the reviewer projection: speaker names are replaced before assigned cards are returned, and forged scoring posts recheck eligibility. |
| Decisions & notifications | ✓ | Governed accept/decline transitions persist actor/rule/trace, create sessions and tasks on acceptance, queue idempotent messages, and run them through the durable delivery runner. |
| Agenda / scheduling | ✓ | Organizer handlers support unscheduled and manual sessions, placement/movement, multiple views, publication, and calendar generation. |
| Conflict detection | ✓ | `internal/domain/conflicts.go` detects room and speaker double-booking plus track warnings; Arbiter rules decide whether each conflict blocks publication. |
| Speaker portal & tasks | ✓ | Signed speaker links provide profiles, task completion, resources, calendars, uploads, and private downloads with organizer approval gates. |
| Content deliverables | ✓ | Scoped tasks and uploaded files, headshot approval, replacement cleanup, private/public file separation, and approved-upload bundles are implemented. |
| Comms / templates | ✓ | Editable templates and revisions, merge rendering, notification rules, suppression, a durable outbox, retry/backoff, SMTP/Resend/log transports, and calendar attachments are implemented. |
| Public event pages | ✓ | Published agenda and speaker-gallery pages plus itinerary/calendar views are rendered from publication-gated sessions and approved media. |
| Embeddable widgets | ✓ | The embed admin produces iframe snippets and previews for public agenda and speaker-gallery routes; public routes opt into permissive framing while organizer routes do not. |
| Public REST API | ✓ | A small versioned read-only JSON API exposes a discovery index, published schedule, and published speakers with explicit caches and redaction. |
| AI features | ~ | The model supports a virtual reviewer and renders pre-existing virtual-review evaluations, but no model provider, generation handler, or user-triggered inference path exists. |
| Speaker CRM | ✗ | Speakers are event records tied to submissions, sessions, and tasks; no cross-event contact directory, sourcing pipeline, segments, or outreach CRM was found. |
| Sponsors | ✗ | No sponsor/exhibitor entity, intake, management, or public partner surface was found. |

## Structural choices worth recording

- The entire workspace is one validated `domain.State` aggregate. Even the SQLite and PostgreSQL stores serialize that aggregate into a versioned JSON document rather than mapping each domain entity to relational tables.
- CFP routing, conditional visibility, review governance, and schedule-conflict policy are versioned Arbiter source files evaluated with trace output rather than hard-coded service branches.
- GoSX file routes render the UI on the server and use the framework's managed form/action and navigation runtime; the repository deliberately carries no bespoke application JavaScript.
- Public JSON is a deliberately narrow read model with three data endpoints, while mutations remain GoSX form actions against the aggregate.
- The normal state audit events are supplemented by a separately fsynced, hash-chained JSONL ledger; full workspace/archive export and restore operate on checksummed envelopes.

## Shipped that Cicero did not

- A versioned external policy language for CFP routing, form visibility, review governance, and scheduling conflicts, with the matched rule and trace persisted alongside decisions.
- Automatic company-conflict recusal: reviewers whose normalized company matches a proposal speaker are excluded from assignment, hidden from the queue, and refused again at score time.
- WebAuthn passkeys plus optional GitHub and Google OAuth alongside magic-link organizer authentication.
- Checksummed whole-workspace export/import, full archives including uploads and audit segments, and an independent hash-chained audit ledger.

## Cicero shipped that this did not

- Working advisory AI review and agenda-generation actions; Rostrum only models and displays already-present virtual-review rows.
- A cross-event speaker CRM with import, custom fields, reversible merges, dynamic/curated segments, and sourcing.
- Sponsor/exhibitor management and published partner surfaces.
- Multi-event operation in one deployment; Rostrum's aggregate contains exactly one `Event`.
- A generated OpenAPI contract and authenticated write API, signed outbound webhooks, Streamable-HTTP MCP, and agent skills; Rostrum's public API is a small read-only projection.

## Notes
The repository itself names `https://rostrum.m31labs.dev` as an anonymous read-only hosted preview; mutations are deliberately disabled there. The 48-commit count is exact for this checkout because Git reports it as complete rather than shallow.
