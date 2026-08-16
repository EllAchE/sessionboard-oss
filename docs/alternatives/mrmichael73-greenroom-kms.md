# mrmichael73/greenroom-kms

**Source:** https://github.com/mrmichael73/greenroom-kms · **Live:** https://killmysaas.greenroom-events.workers.dev
**Found via:** repository supplied in this survey batch
**Analyzed:** 2026-08-16 at commit 4c6a29335cce7bb6a5c27d629f736b40e2622d86

## Stack

A single TypeScript Cloudflare Worker uses Hono 4, Cloudflare D1/SQLite, and direct SQL rather than
an ORM. Uploads use R2 when configured and a D1-backed fallback otherwise. Pages are hand-rendered,
escaped HTML with small inline scripts and custom CSS; there is no client framework. Authentication
is a custom email/password flow using WebCrypto PBKDF2 hashes and signed session cookies.

## Scale

Approximately 19,700 lines of application code across 43 files. The complete local history
contains 25 commits by 1 contributor, spanning 2026-08-10..2026-08-10.

## Feature coverage

| Area | Coverage | Code-verified behavior |
|---|---:|---|
| CFP intake | ✓ | Public CFP routes implement drafts, configurable and conditional form fields, deadlines, co-speakers, validation, and final submission. |
| Review rounds & scoring | ✓ | Review rounds, weighted criteria, reviewer pools, assignments, recusals, scores, and review progress use persisted D1 records. |
| Anonymized review | ✓ | Blind-round review queries and rendering suppress applicant identity. |
| Decisions & notifications | ~ | Decision updates and applicant notification are separate operations, but rendered messages stop in an inspection outbox with no delivery transport. |
| Agenda / scheduling | ✓ | Rooms, tracks, sessions, manual placement, agenda publication, and a first-fit automatic scheduler update D1 state. |
| Conflict detection | ✓ | Placement checks detect room and speaker overlaps, with an explicit organizer override path for a warned placement. |
| Speaker portal & tasks | ✓ | Speakers can manage profile data, sessions, assigned tasks, resources, and uploads through event-scoped portal routes. |
| Content deliverables | ✓ | Versioned files, comments, approvals, content revisions, restore, and ZIP export are implemented. |
| Comms / templates | ~ | Template editing, campaigns, recipient resolution, reminders, and an organizer-visible outbox are implemented; no transport sends those messages beyond the application. |
| Public event pages | ✓ | Public event, session, speaker, agenda, itinerary, gallery, personal-schedule, and calendar pages query approved data. |
| Embeddable widgets | ✓ | Five widgets are configurable by track, fields, accent, and custom CSS, with script-loader, iframe, JSON, XML, and iCalendar outputs. |
| Public REST API | ✗ | Machine-readable widget/calendar feeds exist, but no general versioned REST resource API or OpenAPI surface was found. |
| AI features | ~ | “AI triage” is a deterministic keyword/length heuristic and automatic scheduling is a first-fit algorithm; no model call was found. |
| Speaker CRM | ✓ | Contacts, stages, notes, tags, segments, CSV import, merge, outreach, and cross-event/session history are wired to organizer routes. |
| Sponsors | ✗ | No sponsor or exhibitor table, route, or public sponsor presentation was found. |

## Structural choices worth recording

- The entire application is one server-rendered Cloudflare Worker organized into Hono route
  modules; mutations follow POST/redirect/GET and domain queries use direct D1 SQL.
- The relational D1 schema is the central domain contract, with flexible form answers kept in an
  `answers_json` column alongside first-class proposal fields.
- Authorization combines a global user role with event-membership rows checked by route middleware.
- File metadata and versions live in D1; bytes go to R2 when available and otherwise use an
  explicit D1 storage fallback.
- Communications are rendered and persisted to an outbox for inspection rather than handed to an
  external delivery provider.

## Shipped that Cicero did not

- An embed studio that emits script-loader HTML, basic iframe HTML, JSON, XML, and iCalendar from
  the same widget configuration, including track/field filters and custom CSS.

## Cicero shipped that this did not

- A broad versioned REST API with generated OpenAPI documentation.
- Model-backed AI review suggestions and model-backed agenda recommendations.
- Sponsor/exhibitor management and a published sponsor wall.
- External email delivery adapters rather than an inspection-only outbox.
- SMS consent, verification, quiet-hour enforcement, and SMS delivery workflows.
- A hosted MCP server and repository-packaged agent skills.
- Post-conference recording ingestion, matching, approval, and publication.

## Notes

The deployment URL comes from repository configuration/documentation and was not fetched. The
repository is not marked shallow, so its history figures are exact. Deterministic heuristics are
recorded as partial AI coverage rather than model-backed AI, and widget data formats are not counted
as a general REST API.
