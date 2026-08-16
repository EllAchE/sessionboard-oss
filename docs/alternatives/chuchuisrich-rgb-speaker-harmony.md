# chuchuisrich-rgb/speaker-harmony

**Source:** git@github.com:chuchuisrich-rgb/speaker-harmony.git · **Live:** None recorded in the repository

**Found via:** Pre-discovered repository batch supplied for this survey.

**Analyzed:** 2026-08-16 at commit bad9cf0dbc46ed9576933821753229f0a70487f5

## Stack

TanStack Start with React 19 and TypeScript; client context state and `localStorage` with Airtable REST synchronization and no ORM; Tailwind CSS 4 and Radix; no authentication layer.

## Scale

- 97 files excluding `.git`; approximately 9,218 lines across the principal TypeScript, TSX, and CSS file types.
- 66 commits, by 4 distinct commit authors, spanning 2026-08-08..2026-08-10.

## Feature coverage

- **CFP intake — ✓.** A fixed public CFP validates inputs and creates linked speaker and abstract records through the application store and Airtable synchronization path.
- **Review rounds and scoring — ~.** Score history increments a round number, but there is no configured round workflow, reviewer identity, assignment queue, or criterion model.
- **Anonymized review — ✗.** Organizer review rows display speaker names and email addresses, with no blind-review projection.
- **Decisions and notifications — ~.** Acceptance can trigger a real Resend-backed message, but rejection has no notification path and reminder actions are explicitly mocked.
- **Agenda and scheduling — ✓.** Organizers can drag sessions among a fixed set of rooms and slots, and placements are persisted.
- **Conflict detection — ~.** A conflict count checks the same speaker in the same slot, but does not implement complete room/speaker/track validation.
- **Speaker portal and tasks — ~.** A status-gated, direct-speaker-ID view shows a fixed checklist and profile fields, without authentication or persisted task records.
- **Content deliverables — ~.** Upload controls record filenames for headshots and slides, but do not upload file bytes or retain versions and review state.
- **Comms and templates — ~.** Acceptance and reminder copy is present, but only acceptance is wired to delivery; reminder actions are mock behavior.
- **Public event pages — ~.** The root landing page and two embed views are public, but there is no independent event publication model or full public event-site projection.
- **Embeddable widgets — ✓.** Speaker-gallery and schedule iframe generators have corresponding public render routes.
- **Public REST API — ✗.** The Airtable proxy is an internal synchronization route, not an authenticated, versioned public domain API.
- **AI features — ~.** The labeled AI scoring function is an explicit deterministic mock heuristic and does not call a model.
- **Speaker CRM — ✗.** The store contains single-event speaker records but no cross-event contact lifecycle or CRM workflow.
- **Sponsors — ✗.** No sponsor or exhibitor data model or workflow was found.

## Structural choices worth recording

- The client context is the optimistic source of UI state, persists to `localStorage`, and then performs nonblocking synchronization to three Airtable tables.
- Tracks, session formats, rooms, and time slots are fixed source enums for one event rather than tenant-configured records.
- Speaker tasks are derived from profile fields such as biography, headshot filename, slide filename, and calendar-export state instead of stored task instances.

## Shipped that Cicero did not

None found at the code-verification standard used for this survey.

## Cicero shipped that this did not

- Anonymized reviewer queues, reviewer assignments, and configurable weighted scorecards.
- Authenticated speaker workspaces with persisted tasks and real versioned file deliverables.
- A versioned public REST/OpenAPI surface, cross-event speaker CRM, and sponsor/exhibitor workflows.
- Complete schedule conflict validation and an explicit publishable agenda projection.
- Model-backed review and scheduling assistance.

## Notes

The supplied clone reports that it is not shallow, so its 66 reachable commits are reported as an exact count. File controls store names rather than uploaded content, and the reminder actions identify themselves as mock behavior. The generated speaker-gallery embed renders the email field held on each speaker record.
