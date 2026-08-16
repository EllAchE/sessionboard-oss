# jpoehnelt/session-party

**Source:** git@github.com:jpoehnelt/session-party.git · **Live:** https://sessionparty.com
**Found via:** pre-cloned alternatives survey batch (discovery supplied)
**Analyzed:** 2026-08-16 at commit bc46bee

## Stack
React 19 and React Router 8 on Vite, TypeScript, Hono on Cloudflare Workers, Effect-based services, Drizzle ORM over Cloudflare D1/SQLite, R2, Tailwind CSS 4 with Radix/custom components, and passwordless magic-link authentication with hashed sessions and Turnstile.

## Scale
Approximately 197,500 lines across TypeScript, TSX, CSS, and SQL (tests included); 466 files excluding `.git`; ≥50 commits (shallow clone); 1 distinct author in the visible history; visible commit span 2026-08-12..2026-08-13.

## Feature coverage

- **✓ CFP intake.** Draft forms, a drag-capable builder, conditional/routing metadata, immutable copy-on-publish form versions, public submission, abuse controls, owned proposal editing/withdrawal, and organizer queues all use persisted D1 services.
- **✓ Review rounds and scoring.** Per-round rubrics, assignments, reviewer invitations, recusal, workload/progress, weighted results, staged decisions, and release operations are implemented in `src/features/review`.
- **✓ Anonymized review.** The `blind` round flag is applied by the review service to presenter identity and answer visibility, with tests covering assigned reviewer reads.
- **✓ Decisions and notifications.** Decisions are staged privately in `pending_decision`, atomically released as an explicit cohort, and then addressed through the separate Communications workflow.
- **✓ Agenda and scheduling.** The agenda board persists talks, rooms, tracks, placements, breaks, publication revisions, drag changes, and real-time show state.
- **✓ Conflict detection.** Services and the EventRoom protocol detect room and speaker overlaps; blockers and conflict counts are displayed on the board and overview.
- **✓ Speaker portal and tasks.** Claimed and managed speakers receive profiles, confirmation/time-response flows, onboarding tasks, custom resource pages, organizer readiness views, and recorded contact history.
- **✓ Content deliverables.** R2 assets are ownership-checked, versioned, restorable, downloadable, commentable, and tied to speaker/task lineage.
- **✓ Comms and templates.** Editable templates, audience resolution, immutable render snapshots, scheduling, retries, provider receipts, dead letters, reminders, and calendar attachments are wired to a Durable Object scheduler.
- **✓ Public event pages.** Public programs, schedule/session detail, speaker gallery/detail, reusable speaker profiles, metadata, and feeds are publication-gated.
- **✓ Embeddable widgets.** Persisted schedule and speaker embeds have saved design configuration and dedicated public routes.
- **✓ Public REST API.** A generated operation registry exposes versioned REST routes with scoped API keys and OpenAPI; the same registry also supplies MCP operations.
- **✓ AI features.** Review suggestions call Cloudflare Workers AI through `AiService`, persist as explicitly non-authoritative advice, and have a deterministic demo fallback.
- **~ Speaker CRM.** A cross-event directory groups identity by normalized email, shows submission/talk history and contact records, and can hand returning speakers into another event. Tags, merge workflows, sourcing pipeline, saved segments, and CRM campaigns are described in planning files but not present in the shipped service surface.
- **✗ Sponsors.** No sponsor or exhibitor model, organizer workflow, or public output was found.

## Structural choices worth recording

- `contracts/schema.ts` and feature operation definitions are frozen contracts; a generator turns operation metadata into the REST dispatcher, OpenAPI, MCP tool catalog, and route discovery data.
- Domain services use Effect environments for database, authorization, files, mail, AI, integration, and real-time capabilities, with typed application errors at transport boundaries.
- D1 is the canonical store, R2 holds files, EventRoom Durable Objects broadcast audience-filtered changes, and separate Durable Objects serialize mail and Airtable work.
- Commands record idempotency keys, append domain changes and audit entries, and use optimistic versions; rendered mail is snapshotted before any provider attempt.
- Recurring-event cloning copies structure into a private event and records provenance while deliberately excluding proposals, speakers, reviews, agenda state, credentials, and deliveries.

## Shipped that Cicero did not

- A previewed, structure-only event clone that copies forms, review-round definitions, task/resource templates, tracks, rooms, message templates, and optionally the team into a private next edition.
- Bidirectional Airtable synchronization with field ownership, pending edits, conflict detection, retry/backoff, dead letters, and per-base/global Durable Object serialization; Cicero's Airtable integration is one-way mirror output.
- A real-time multi-operator agenda and live-show control channel backed by an event-scoped Durable Object and WebSockets.
- An Accelevents import workflow with configuration, explicit fixture/live modes, run status, idempotency, and organizer-triggered imports; Cicero does not import Accelevents state.

## Cicero shipped that this did not

- Sponsor and exhibitor entities, tiered publication, and a public sponsor wall.
- A full speaker CRM with tags, reversible duplicate merges, sourcing pipeline, saved segments, and campaign tooling; this project ships a narrower cross-event directory and returning-speaker handoff.
- SMS delivery with consent, verification, quiet hours, and tokenized opt-out.
- Post-conference recording publication behind content and recording gates.

## Notes

The live URL is declared in the README and Worker configuration; it was not fetched. The repository contains extensive executable tests for the service, browser, worker, migration, and Durable Object paths, but this survey did not rerun them. The clone is shallow, so the commit count is a lower bound and the author count covers visible history only. No secret-bearing files or values were inspected.
