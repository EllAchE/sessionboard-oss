# mauricedesaxe/openboard

**Source:** <https://github.com/mauricedesaxe/openboard> · **Live:** <https://openboard.alexlazar.dev/>
**Found via:** provided survey batch; discovery was completed before analysis
**Analyzed:** 2026-08-16 at commit `d40c01f`

## Stack

A Vite 8 React 19 single-page application using React Router 8, tRPC 11, TanStack Query, and TypeScript 6, deployed to Cloudflare Workers. Drizzle ORM targets Cloudflare D1/SQLite and R2 stores uploaded files. Scheduling uses FullCalendar; styling is project-local global CSS. Better Auth supplies email one-time-code authentication and database sessions.

## Scale

About 46,200 lines across tracked TypeScript, JavaScript, CSS, and SQL files; 164 tracked files; ≥50 commits (shallow clone); 1 distinct commit author; commit span 2026-08-13..2026-08-16.

## Feature coverage

- ✓ **CFP intake:** CFPs have custom fields, conditional visibility, drafts, publication windows, public submissions, file uploads, and signed-in submitter editing.
- ~ **Review rounds and scoring:** each CFP receives one fixed review round with one integer score and comment; assignments and completion work, but organizers cannot configure multiple rounds or weighted multi-criterion rubrics.
- ✓ **Anonymized review:** reviewer queries select proposal content, track/format, and files without owner or speaker identity; the round is always blind.
- ✓ **Decisions and notifications:** organizers record dispositions, preview messages, queue deliveries, retry failures, and retain delivery state.
- ✓ **Agenda and scheduling:** accepted work can be placed with FullCalendar, service blocks can be added, changes are persisted, and an immutable publication snapshot feeds public schedule outputs.
- ✓ **Conflict detection:** server-side placement checks cover room and speaker overlaps, availability, capacity, and service-block constraints, with an override path for warnings.
- ✓ **Speaker portal and tasks:** signed-in speakers can maintain profile/session data, see assigned tasks and due dates, and submit evidence.
- ✓ **Content deliverables:** task evidence supports forms and files, revisions/supersession, rejection, reopening, waiver/override records, downloads, and organizer review.
- ✓ **Comms and templates:** organizer templates, recipient selection, preview, queued email delivery, retries, and communication history are implemented.
- ~ **Public event pages:** public CFP and published schedule pages exist, but there is no full event landing page, public session-detail surface, or speaker directory.
- ✗ **Embeddable widgets:** no iframe/script widget builder or public widget routes were found.
- ~ **Public REST API:** published schedule JSON and iCalendar endpoints are described by a small OpenAPI 3.1 document, but the API has no authenticated organizer resources or broader event-program model.
- ✗ **AI features:** no model binding or model-backed review or scheduling implementation was found.
- ✗ **Speaker CRM:** contacts are scoped to event workflow records; there is no cross-event directory, fields, segments, sourcing pipeline, or merge flow.
- ✗ **Sponsors:** no sponsor or exhibitor domain, organizer workflow, or public surface was found.

## Structural choices worth recording

- Authenticated application operations use tRPC, while a deliberately narrow, separately routed public REST surface exposes only published schedule representations.
- Each CFP owns one automatically created, always-blind review round instead of a configurable review-round and rubric engine.
- Agenda edits remain working state until publication creates a finalized snapshot; email delivery and calendar-sync work are tracked separately from the snapshot.
- Task completion is an evidence ledger: current evidence can be superseded or rejected, and waiver/override evidence is recorded instead of represented only by a task status.
- FullCalendar is the primary client-side agenda editing model, with authoritative conflict checks repeated on the server.

## Shipped that Cicero did not

- An in-app problem-report flow usable before or after sign-in, with a honeypot, minimum-open-time and rate-limit checks, optional contact consent, redaction of email addresses and six-digit codes, and delivery into a configured Better Stack incident policy.

## Cicero shipped that this did not

- Configurable multi-round review with weighted multi-criterion rubrics.
- Full public event, session, and speaker pages plus configurable iframe widgets.
- A broad versioned REST API with API keys and organizer operations.
- Model-assisted review analysis and agenda generation.
- A cross-event speaker CRM with custom fields, segments, sourcing stages, imports, and reversible merges.
- Sponsor and exhibitor management with public sponsor surfaces.
- SMS communication, signed outbound webhooks, and recording-management workflows.
- Accelevents synchronization, an Airtable mirror, MCP, and packaged agent skills.

## Notes

The live URL is recorded in the README and CI; it was not fetched during this survey. The problem-report integration is optional by deployment configuration, but its client, validation, privacy filtering, and delivery path are implemented rather than stubbed. The file and LOC totals use tracked files only and exclude `.git`. History is depth-limited, so the commit count is a lower bound.
