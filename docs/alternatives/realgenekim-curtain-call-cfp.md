# realgenekim/curtain-call-cfp

**Source:** https://github.com/realgenekim/curtain-call-cfp · **Live:** https://curtaincallcfp.com
**Found via:** repository supplied in this survey batch
**Analyzed:** 2026-08-16 at commit 639b741dbd98ae9c5fcf7b6e705d98b96e1d5c21

## Stack

Clojure 1.12 with http-kit, Reitit/Ring, Hiccup server rendering, and Datastar
server-sent events. The default persistence adapter is an append-only JSONL fact log; production
can instead use PostgreSQL through `next.jdbc` and HikariCP. There is no ORM. Styling is custom CSS.
Authentication uses signed sessions with email-token and Google OAuth entry paths. Deployment
artifacts target Google Cloud Run, with optional cloud object storage and several email adapters.

## Scale

Approximately 44,400 lines of application and test code across 418 files. The complete local
history contains 1 commit by 1 contributor, spanning 2026-08-11..2026-08-11.

## Feature coverage

| Area | Coverage | Code-verified behavior |
|---|---:|---|
| CFP intake | ✓ | Organizers build forms and public applicants save drafts, submit proposals, manage co-speakers, and can import a Sessionize speaker profile. |
| Review rounds & scoring | ✓ | Committees, rounds, weighted scorecards, assignments, recusals, progress, and score submission are represented as domain facts and folded into views. |
| Anonymized review | ✓ | Blind-review settings and projection code remove submitter identity from the review surface. |
| Decisions & notifications | ✓ | Accept/reject decisions and the later act of informing applicants are separate commands, with rendered mail and delivery records. |
| Agenda / scheduling | ✓ | Rooms, blocks, placements, locks, publication, manual editing, and deterministic placement suggestions are implemented as commands and projections. |
| Conflict detection | ✓ | Scheduling checks cover room and speaker overlaps plus event-boundary violations before placements are recorded. |
| Speaker portal & tasks | ✓ | Authenticated speakers see profiles, sessions, task checklists, resources, and outstanding work. |
| Content deliverables | ✓ | Speakers upload versioned files, exchange comments, and organizers approve or export deliverables, including ZIP export. |
| Comms / templates | ✓ | Template editing, audience selection, reminder scheduling, delivery adapters, and communications history are connected to domain commands. |
| Public event pages | ✓ | Public agenda, session, speaker, gallery, and personal-schedule pages are rendered from the folded event state. |
| Embeddable widgets | ✓ | Schedule/session/speaker/gallery widgets and an embed builder produce iframe/link output plus data-feed options. |
| Public REST API | ✓ | `/api/v1` exposes documented event resources, API-key administration, ETags, and an incremental changes endpoint. |
| AI features | ~ | MCP and agent command surfaces can operate the application, and scheduling suggestions are deterministic; no in-product model invocation was found. |
| Speaker CRM | ✓ | Cross-event people records support notes, tags, segments, import, outreach, merge, and event/session history. |
| Sponsors | ✗ | No sponsor or exhibitor domain facts, management handlers, or public sponsor output were found. |

## Structural choices worth recording

- The application is event-sourced: commands append immutable facts and folds derive current state.
  JSONL and PostgreSQL are interchangeable storage adapters for the same fact stream.
- Organizer pages are Hiccup-rendered HTML, while Datastar SSE sends HTML fragments and signal
  updates; there is little client-side application state.
- Forms, submissions, reviews, schedules, and communications all use the same command/fact/fold
  mechanism rather than separate CRUD services.
- People are global identities with cross-event history; event-specific speaker records project
  those identities into an event.
- The browser UI, CLI, HTTP agent endpoint, and MCP server converge on shared domain commands.

## Shipped that Cicero did not

- Whole-application append-only event history with replay and an `at-index` time-travel view of the
  program at an earlier fact position.
- A public incremental changes feed with stable monotonically increasing sequence numbers, a
  `since` cursor, and ETag handling.
- Direct Sessionize speaker-profile import from the public CFP flow.

## Cicero shipped that this did not

- Model-backed AI review suggestions and model-backed agenda recommendations.
- Sponsor/exhibitor management and a published sponsor wall.
- SMS consent, verification, quiet-hour enforcement, and SMS delivery workflows.
- Post-conference recording ingestion, matching, approval, and publication.

## Notes

The repository also names a Cloud Run demonstration URL, but the primary production URL above is
the one identified as such in repository configuration/documentation; neither was fetched. The
repository is not marked shallow, so its single-commit history is reported as exact. Agent and MCP
interfaces count as an automation surface, not as model-backed AI by themselves.
