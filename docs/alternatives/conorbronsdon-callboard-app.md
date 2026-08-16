# conorbronsdon/callboard-app

**Source:** <https://github.com/conorbronsdon/callboard-app> · **Live:** <https://demo.callboardhq.com>
**Found via:** provided survey batch; discovery was completed before analysis
**Analyzed:** 2026-08-16 at commit `08725c0`

## Stack

React Router 8 framework mode with React 19, Vite 8, and TypeScript 5.9, deployed as a Cloudflare Worker. Drizzle ORM targets Cloudflare D1/SQLite and files are stored in R2. Styling is Tailwind CSS 4. Authentication uses emailed magic links, one-time auth-token rows, and database sessions. Cloudflare Workers AI supplies the model-backed review triage.

## Scale

About 121,500 lines across tracked TypeScript, JavaScript, CSS, and SQL files; 611 tracked files; 24 commits; 1 distinct commit author; commit span 2026-08-12..2026-08-13.

## Feature coverage

- ✓ **CFP intake:** a versioned form builder, public multi-step draft flow, custom validation, submitter ownership, edit/withdraw actions, and file questions are wired to D1 and R2.
- ✓ **Review rounds and scoring:** organizers configure multiple rounds and weighted rubrics, provision reviewers, assign submissions, and aggregate submitted scores.
- ✓ **Anonymized review:** blind-round loaders project content and participant count without submitter or speaker identity, while non-blind rounds use the identified projection.
- ✓ **Decisions and notifications:** disposition batches are previewed, queued, committed, and delivered with frozen recipient/copy records and retry state.
- ✓ **Agenda and scheduling:** rooms, tracks, blocks, sessions, drag-and-drop placement, deterministic auto-placement, draft/published state, and calendar output are implemented.
- ✓ **Conflict detection:** server-side checks cover speaker and room overlaps, availability, room capacity, and related warnings before placement and publication.
- ✓ **Speaker portal and tasks:** speakers use a magic-link portal for profile, submission, session, resource, and task workflows.
- ✓ **Content deliverables:** tasks can require links or R2-backed files; organizer review, comments, file versions, downloads, and ZIP archives are present.
- ✓ **Comms and templates:** reusable templates, audience selection, previews, queued sends, retries, and delivery history are connected to the mailer.
- ✓ **Public event pages:** server-rendered event, schedule, session, and speaker pages use only published records and include calendar downloads and personal-schedule behavior.
- ✓ **Embeddable widgets:** four saved widget types—agenda, schedule, speakers, and gallery—have configurable presentation, public tokens, iframe code, and a loader script.
- ✓ **Public REST API:** event-scoped API keys and granular scopes protect versioned `/v1` CRUD/read routes; the developer UI and OpenAPI document come from a shared catalogue.
- ✓ **AI features:** Workers AI generates advisory submission-triage records with model metadata, freshness state, error state, and separate human review data.
- ✓ **Speaker CRM:** the organization-level directory has contacts, tags, notes, custom fields, saved segments, imports, a sourcing pipeline, and a contact-merge workflow.
- ✗ **Sponsors:** no sponsor or exhibitor schema, organizer workflow, API resource, or public widget was found.

## Structural choices worth recording

- A single `sessions` table represents both CFP submissions and scheduled sessions, using `isAbstract` and lifecycle fields instead of separate submission and session aggregates.
- React Router route modules colocate loader/action authorization with each server-rendered screen; reusable domain services sit under `app/lib`.
- D1 batch operations provide atomic multi-statement changes in places where an interactive transaction would otherwise be used, while R2 holds private file bytes.
- The public API catalogue is the source for route metadata, API-key scopes, the developer UI, and OpenAPI output.
- MCP is a separate Worker that calls the public API instead of sharing the application's database bindings.

## Shipped that Cicero did not

- An event-scoped `/e/:slug/llms.txt` generated from that event's live public state, open forms, and published sessions; Cicero's `/llms.txt` describes the deployment-wide surface only.
- Attributed title/description revision history for proposals and sessions, including organizer restore controls; Cicero versions uploaded deliverables but not proposal/session content edits.
- Explicit headshot-publication consent bound to the current uploaded artifact, with public queries and merge/re-upload paths preventing consent from carrying to a different file; Cicero publishes a confirmed speaker's headshot without a separate artifact-specific consent state.

## Cicero shipped that this did not

- Sponsor and exhibitor management with public sponsor surfaces.
- AI-assisted agenda construction; Callboard's model use is limited to review triage, while agenda auto-placement is deterministic.
- SMS communication with consent, verification, and quiet-hour enforcement.
- Signed outbound webhooks and recording-management workflows.
- Accelevents synchronization and an Airtable mirror.
- A first-party itinerary embed; Callboard's personal schedule is on its public pages, outside its four widget types.

## Notes

The live URL is recorded in the repository README and deployment checks; it was not fetched during this survey. This clone contains the repository's full 24-commit history rather than a shallow boundary. The file and LOC totals use tracked files only and exclude `.git`.
