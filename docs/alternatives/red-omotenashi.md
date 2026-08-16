# red/omotenashi

**Source:** https://forge.smol.ai/red/omotenashi.git · **Live:** none found
**Found via:** pre-cloned alternatives survey batch (discovery supplied)
**Analyzed:** 2026-08-16 at commit 8b1c140

## Stack
React 19 and React Router 8 on Vite, TypeScript, Cloudflare Workers, a custom repository/adapter layer over Airtable rather than an ORM, R2 for files, Tailwind CSS 4 plus application CSS, and Airtable-directory-backed signed sessions with separate reviewer and speaker-portal grants.

## Scale
Approximately 83,200 lines across TypeScript, TSX, CSS, and SQL-equivalent source files (tests included); 377 files excluding `.git`; ≥1 commit (shallow clone); 1 distinct author in the visible history; visible commit span 2026-08-13..2026-08-13.

## Feature coverage

- **✓ CFP intake.** Airtable-backed form definitions and immutable versions power a public multi-form CFP, drafts/resume flow, lifecycle windows, conditional fields, participants, answer snapshots, post-submit edits, and an organizer submission inbox.
- **✓ Review rounds and scoring.** Review plans require sequential rounds, weighted rubrics, assignment routing, balanced fill, progress, abstention, exports, and persisted review revisions.
- **✓ Anonymized review.** Reviewer reads expose a fixed allowlist of proposal fields and blind submitter/private profile data, peer reviews, and admin decisions before data reaches the route.
- **✓ Decisions and notifications.** Selection decisions create acceptance snapshots/sessions and feed transactional decision messages through the outbox/effect pipeline.
- **✓ Agenda and scheduling.** Airtable-backed accepted and manual items can be placed and released into a published public snapshot with multi-day agenda views.
- **✓ Conflict detection.** The canonical evaluator checks event bounds, speaker availability, speaker/room/track overlap, and setup/teardown buffer overlap; the repository runs the same evaluator for single and batch changes.
- **✓ Speaker portal and tasks.** Claim/resume grants lead to proposals, profile editing, portal forms, onboarding tasks, audience-scoped resources, and organizer completion views.
- **✓ Content deliverables.** File requests enforce types and sizes; R2 objects have checksums, verification/approval state, retained versions, authorized downloads, and task linkage.
- **✓ Comms and templates.** Versioned Airtable templates, merge previews, transactional messages, reminders, calendar effects, delivery attempts, and repairable outbox jobs have working repositories and routes.
- **✓ Public event pages.** Published speakers, speaker details/headshots, schedules, session details, SEO metadata, sitemap, robots, and event-specific `llms.txt` output read the released snapshot.
- **✓ Embeddable widgets.** Dedicated speaker and schedule embed routes render the same publication-gated projection without admin state.
- **✓ Public REST API.** Public speaker/schedule and token-scoped submission/session reads implement pagination, signed cursors, rate limits, OpenAPI, authorization, and audit recording.
- **✗ AI features.** `AI_REVIEW_POLICY` documents an advisory boundary, but no model adapter, generation handler, persisted suggestion workflow, or agenda generator was found.
- **✓ Speaker CRM.** The organization-wide CRM joins people to event profiles, proposals, accepted sessions, publication/message history, notes, relationship status, and event tags, with filters and mutations.
- **~ Sponsors.** Event profiles carry an operational `Is Sponsored Speaker` flag used by import/update paths, but there is no sponsor/exhibitor entity, tier management, asset workflow, or public sponsor output.

## Structural choices worth recording

- Airtable is the authoritative application store. A versioned manifest defines tables, field types, relationships, and whether each field is system- or operator-owned.
- Each domain has memory and live Airtable adapters behind the same repository contract, allowing deterministic tests without converting the app into a fixture-only UI.
- React Router loaders/actions call domain repositories directly; the public REST route builds on the same event, publication, schedule, and submission repositories.
- Public pages and APIs read a released publication snapshot rather than live operator records, separating Airtable editing state from public state.
- External effects are represented as Airtable jobs/effect attempts and repaired explicitly; the code intentionally has no cron-driven Airtable polling loop.

## Shipped that Cicero did not

- An Airtable-native operating model in which provisioned Airtable records are the source of truth and selected fields remain directly operator-editable; Cicero only mirrors its Postgres records outward.
- Fail-closed audit recording for private REST reads: token-scoped submission/session API requests return 503 when their audit event cannot be persisted.
- A dynamic sitemap containing only currently published event, speaker, and session paths; Cicero's robots route explicitly states that it has no sitemap.
- Per-event `llms.txt` output populated with the event's released speaker and session data, in addition to a site-level agent index; Cicero's root `llms.txt` is a generic route map.

## Cicero shipped that this did not

- Working AI-assisted review and an advisory AI agenda builder with deterministic no-key fallbacks.
- Sponsor and exhibitor entities, tiers, assets, publication gates, and a public sponsor wall.
- A Streamable HTTP MCP server and role-scoped agent skills.
- SMS delivery with consent, E.164 normalization, OTP verification, quiet hours, and tokenized opt-out.

## Notes

No repository-declared live deployment URL was found, and no deployment was sought or fetched. The clone contains one visible commit and is marked shallow, so history measurements are lower-bound observations. The live runtime requires an Airtable configuration; the in-memory adapter is a real test seam, not the production persistence choice. No environment values or credentials were inspected or recorded.
