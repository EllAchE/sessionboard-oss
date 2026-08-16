# iankar8/event-manager-os

**Source:** git@github.com:iankar8/event-manager-os.git · **Live:** https://program-desk.ian-208.workers.dev
**Found via:** pre-cloned alternatives survey batch (discovery supplied)
**Analyzed:** 2026-08-16 at commit 84b6fcb

## Stack
React 19 with React Router DOM 7 on Vite, TypeScript, Hono on Cloudflare Workers, raw SQL over Cloudflare D1/SQLite (no ORM), custom CSS/design tokens, and password plus magic-link authentication with hashed D1 sessions.

## Scale
Approximately 9,300 lines across TypeScript, TSX, CSS, and SQL (tests included); 97 files excluding `.git`; 22 commits; 1 distinct author; commit span 2026-08-11..2026-08-12.

## Feature coverage

- **✓ CFP intake.** Public account creation and proposal routes enforce CFP windows, drafts/submission, core and custom conditional fields, co-speakers, persisted answers, profile handoff, and receipt mail.
- **✓ Review rounds and scoring.** Organizers configure multiple rounds, reviewer pools, criteria, expertise/capacity profiles, manual or automatic assignments, recusal, reminders, and persisted weighted scorecards.
- **✓ Anonymized review.** Per-round `blind_review` removes submitter names for reviewer responses while organizer reads retain them.
- **✓ Decisions and notifications.** Human-attributed decisions update proposal state, provision accepted sessions/tasks, and optionally queue and deliver decision mail through an event-owned Resend provider.
- **✓ Agenda and scheduling.** Draft/published/superseded schedule revisions, room/track creation, manual placement, auto-placement, publication, and a public schedule are persisted in D1.
- **✓ Conflict detection.** Placement detects room and speaker overlap, blocks by default, and requires an explicit written override to persist a conflicting slot.
- **✓ Speaker portal and tasks.** Speaker sessions expose profiles, proposals, accepted-session tasks, uploads, comments, reminders, custom resources, and task completion.
- **✓ Content deliverables.** Deliverable files enforce type/size policy, retain versions and comments, support latest-file ZIP export, and record restorable content snapshots.
- **✓ Comms and templates.** Event templates are editable; submission, decision, reviewer, speaker reminder, bulk email, and calendar-attachment paths write receipts and can deliver through a bring-your-own Resend connection.
- **✓ Public event pages.** Published, approved schedule/session/speaker data powers event home, agenda, session, speaker, gallery, and itinerary views.
- **✓ Embeddable widgets.** Five persisted widget types support saved appearance/filter configuration and iframe, URL, JSON, plus itinerary iCalendar output.
- **✓ Public REST API.** OpenAPI-backed public event, sessions, speakers, agenda, and agenda iCalendar endpoints read only the current published revision.
- **~ AI features.** Seeded research briefs and AI recommendations are queried, displayed with provenance, and can be human-overridden, but no model call or generation endpoint exists for non-seeded proposals and there is no AI agenda builder.
- **~ Speaker CRM.** Event speaker management includes CSV import, profile/workflow fields, notes, tasks, and bulk contact, but no cross-event CRM directory, merge, segments, sourcing pipeline, or campaign model was found.
- **✗ Sponsors.** No sponsor or exhibitor data model, workflow, or public output was found.

## Structural choices worth recording

- Hono route modules contain authorization, validation, raw D1 queries, and transition logic directly; there is no ORM or separate general-purpose domain-service layer.
- Draft and published schedules are immutable-style revisions, so public readers remain on the last published revision while organizers change a draft.
- Conflicts are reject-by-default but overrideable with a required reason, which is persisted beside the placement rather than only shown in UI state.
- Email and Accelevents mutations are outbox/preview first. External effects occur only when an organizer supplies a provider and explicitly applies the reviewed operation.
- AI-shaped data is stored as separate research/advice records and never writes a decision, but generation itself is represented only by seeded records in this revision.

## Shipped that Cicero did not

- Expiring external proposal-share links for guest advisors, with optional token-authorized comments and event-ownership checks at link creation.
- Embed-builder controls that directly offer JSON output for each public surface and iCalendar output for the itinerary; Cicero exposes those data formats through APIs but its embed builder has no such controls.
- An Accelevents preview/apply client that maps both speakers and scheduled sessions, computes create/update/no-op diffs, retains stable remote identities, and blocks silent deletion. Its live mode is code-present but repository-documented as unverified against a real account; Cicero limits live mode to accepted-speaker push and keeps full-program reconciliation fixture-only.

## Cicero shipped that this did not

- Working AI review assistance and an advisory AI agenda builder; this project only displays seeded AI-shaped records.
- A cross-event speaker CRM with custom fields, reversible merges, segments, sourcing pipeline, and handoff.
- Sponsor and exhibitor entities, publication gates, and a public sponsor wall.
- A Streamable HTTP MCP server, signed outbound webhooks, and SMS delivery safeguards.

## Notes

The live evaluator URL is declared in the README and judge walkthrough; it was not fetched. This clone has fewer than 50 commits and is not marked shallow by Git, so its 22-commit count is reported as exact. The Accelevents live transport is not counted as production-proven: the repository says it has not been exercised against a live account. No demo credentials, provider values, or environment contents were inspected or recorded.
