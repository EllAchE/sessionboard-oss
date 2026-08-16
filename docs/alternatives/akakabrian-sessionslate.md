# akakabrian/sessionslate

**Source:** <https://github.com/akakabrian/sessionslate> · **Live:** none found
**Found via:** provided survey batch; discovery was completed before analysis
**Analyzed:** 2026-08-16 at commit `aac9749`

## Stack

Next.js 16 and React 19 in a pnpm TypeScript monorepo, with a separate worker process. Drizzle ORM targets PostgreSQL; `pg-boss` supplies durable background jobs. The UI uses CSS Modules and a local component package. Submitter authentication uses email/password accounts, Argon2id password hashes, and database-backed server sessions.

## Scale

About 90,100 lines across tracked TypeScript, JavaScript, CSS, and SQL files; 927 tracked files; ≥52 commits (shallow clone); 3 distinct commit authors; commit span 2026-08-11..2026-08-12.

## Feature coverage

- ✓ **CFP intake:** versioned form definitions, conditional fields, publication state, a public form, authenticated proposal management, and server-side submission commands are connected end to end.
- ✓ **Review rounds and scoring:** review rounds, assignment setup, versioned rubrics, draft/submit/reopen operations, mixed response types, and round outcomes all have persistence and handlers.
- ✓ **Anonymized review:** the review projection returns `submitter: null` for anonymous rounds, and the reviewer flow consumes that projection.
- ✓ **Decisions and notifications:** versioned decisions feed speaker handoff, while prepared communication plans snapshot recipients and rendered messages before release and delivery.
- ✓ **Agenda and scheduling:** organizers configure venues, rooms, tracks, sessions, and a working schedule; drag-and-drop and deterministic automatic planning both write through schedule commands, followed by an explicit publication-plan/apply step.
- ✓ **Conflict detection:** placement evaluation checks speaker and room overlaps, availability, capacity, and audience/track warnings, with hard conflicts separated from overridable warnings.
- ✓ **Speaker portal and tasks:** speakers can confirm assignments, manage their profile and logistics, work assigned tasks, and obtain assignment calendar files.
- ✓ **Content deliverables:** task evidence supports uploads, file revisions, comments, finalization, downloads, and an organizer ZIP export.
- ✓ **Comms and templates:** versioned templates, recipient selection, preview/preparation, held-message release, retries, delivery timelines, and calendar effects are implemented.
- ✓ **Public event pages:** the published program has session, agenda, and speaker views backed by the immutable published schedule.
- ✓ **Embeddable widgets:** the embed builder produces configurable iframe views and basic HTML, JSON, XML, and iCalendar handoffs with field, track, and color options.
- ✓ **Public REST API:** versioned `/api/v1` routes cover intake, reviews, scheduling, communication deliveries, content, and calendars; an OpenAPI route is generated from the same contracts.
- ✗ **AI features:** no model-backed implementation was found; the automatic schedule planner is deterministic rather than presented as AI.
- ~ **Speaker CRM:** per-event person contacts, a speaker roster, and CSV import exist, but there is no cross-event directory with custom fields, segments, sourcing, and reversible identity merges.
- ✗ **Sponsors:** no sponsor or exhibitor domain, organizer workflow, or public surface was found.

## Structural choices worth recording

- Domain work is organized as contracts, application commands/queries, and PostgreSQL adapters. The same versioned, idempotent operations are exposed to UI, REST, and MCP callers.
- Submission form definitions and answers are normalized into versioned field and answer rows rather than keeping the form payload primarily in JSON.
- Scheduling uses a mutable working version followed by a digest-bound publication plan and explicit apply operation; public reads only consume the resulting immutable publication.
- A separate `pg-boss` worker owns asynchronous communication delivery, while the web application prepares durable recipient and message snapshots.
- Readiness is computed from first-class blocker identities and task state rather than stored as a single mutable readiness flag.

## Shipped that Cicero did not

- Self-service password accounts for submitters, backed by Argon2id and server sessions; Cicero's account flow is magic-link-only.
- Rubric criteria with numeric, single-select, and free-text response types in the same scorecard; Cicero's rubric criteria accept numeric scores and a review-level comment.
- A configurable XML representation of the published program alongside HTML, JSON, and iCalendar outputs; Cicero does not expose an XML program feed.

## Cicero shipped that this did not

- Model-assisted review analysis and agenda generation.
- A cross-event speaker CRM with custom fields, segments, sourcing stages, imports, and reversible merges.
- Sponsor and exhibitor management with public sponsor surfaces.
- SMS communication with consent, verification, and quiet-hour enforcement.
- Signed outbound webhooks and recording-management workflows.
- Accelevents synchronization and an Airtable mirror.
- A public itinerary with an attendee-managed personal schedule.

## Notes

The repository does not record a stable deployment URL; a temporary tunnel string in captured evidence was not treated as a live deployment. The file and LOC totals use tracked files only and exclude `.git`. History is depth-limited, so the commit count is a lower bound.
