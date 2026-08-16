# CampbellVentures/smolboard

**Source:** https://github.com/CampbellVentures/smolboard · **Live:** https://www.smolboard.app
**Found via:** repository supplied in this survey batch
**Analyzed:** 2026-08-16 at commit 0f05f7f47ef954caf16f869e55c68ecd3aad6b95

## Stack

PylonSync 0.4.17 provides the full-stack entity store, functions, live client synchronization,
authentication, and deployment runtime. The application and React 19 UI are TypeScript. There is
no separate ORM or SQL database layer in the repository; persisted entities are declared in the
Pylon application manifest. Styling uses Tailwind CSS 4 and Radix primitives. Pylon authentication
supports organizer password/magic-code access and speaker magic-code access.

## Scale

Approximately 42,500 lines of application and test code across 405 files. The shallow clone
contains ≥50 commits by 1 visible contributor, spanning 2026-08-12..2026-08-13.

## Feature coverage

| Area | Coverage | Code-verified behavior |
|---|---:|---|
| CFP intake | ✓ | Public forms support drafts, configurable/conditional fields, routing and handoff mappings, co-presenter invitations, and final submission. |
| Review rounds & scoring | ✓ | Review rounds, weighted criteria, assignments, recusals, scores, comments, progress, and optional peer-review visibility are backed by entities and functions. |
| Anonymized review | ✓ | Round settings and review queries omit participant identity for blind review. |
| Decisions & notifications | ✓ | Decision state changes, bulk accept/reject operations, notification templates, and queued email functions are implemented. |
| Agenda / scheduling | ✓ | Rooms, tracks, sessions, placement functions, manual agenda editing, publishing, and automatic scheduling are connected to the UI. |
| Conflict detection | ✓ | Placement functions check room and speaker overlaps, and the agenda surfaces the returned conflicts. |
| Speaker portal & tasks | ✓ | Speakers use a magic-code portal for profile work, sessions, resources, task completion, and invitations. |
| Content deliverables | ✓ | Upload requests, versioned deliverables, comments, approvals, session-content revisions, restore, and bulk download are implemented. |
| Comms / templates | ✓ | Templates, recipient selection, reminders, calendar invitations, queued sends, and delivery state are exposed through organizer functions. |
| Public event pages | ✓ | Public event, schedule, session, and speaker pages read published entity state. |
| Embeddable widgets | ✓ | Five iframe-oriented public widgets support theme, accent, branding, and view-specific configuration. |
| Public REST API | ~ | Two anonymous JSON-producing Pylon functions expose public schedules and speakers and appear in generated OpenAPI, but there is no broad resource-oriented REST surface. |
| AI features | ✓ | Model calls perform proposal triage, and a streaming in-app copilot executes a bounded tool-use loop over persisted threads; the same tool set is also exposed through MCP. |
| Speaker CRM | ✓ | Contact stages, profiles, notes, segments, imports, merges, outreach, and cross-event associations are implemented. |
| Sponsors | ✗ | No sponsor or exhibitor entity, organizer workflow, or published sponsor surface was found. |

## Structural choices worth recording

- A root `app.ts` manifest declares entities, indexes, row policies, functions, routes, cron jobs,
  authentication, and storage for the whole application.
- Event-owned records denormalize `orgId`, allowing Pylon row policies to enforce workspace access
  without relational joins. Workspace owner/admin roles are distinct from speaker access.
- Browser actions and agent operations share function-level tools over the same live entity store;
  the UI receives synchronized updates instead of maintaining a conventional REST cache.
- Configurable forms, conditional visibility, routing, and downstream handoff maps are stored as
  JSON definitions, while submissions retain a participant snapshot.
- Session content has a draft revision pointer and a separately pinned approved revision, so
  speaker edits do not immediately replace published text.

## Shipped that Cicero did not

- A streaming in-app organizer copilot with persisted threads and a tool-use loop that can inspect
  submissions, record decisions, schedule sessions, queue email/nudges, and send invitations; its
  bounded tools are shared with the MCP endpoint.
- Workspace-level owner/admin authorization and team invitations enforced through row-level entity
  policies, in addition to event-scoped records.
- A two-step session-content publication gate that keeps an approved revision pinned while later
  speaker edits remain draft until an organizer explicitly approves them.

## Cicero shipped that this did not

- Sponsor/exhibitor management and a published sponsor wall.
- SMS consent, verification, quiet-hour enforcement, and SMS delivery workflows.
- Post-conference recording ingestion, matching, approval, and publication.
- A broad versioned REST API for organizer and public resources rather than two public function
  endpoints.

## Notes

The deployment URL is declared in repository documentation and was not fetched. Commit and
contributor figures describe only the visible shallow history. The public JSON functions are useful
machine-readable feeds, but are marked partial for the matrix's “Public REST API” area because they
do not expose the application's wider resource model.
