# yisding/openboard.events

**Source:** https://github.com/yisding/openboard.events · **Live:** https://openboard.events
**Found via:** repository supplied in this survey batch
**Analyzed:** 2026-08-16 at commit 78c15029d8405e2e4494ffad36f38b69d969d1ec

## Stack

Next.js 15 and React 19 in TypeScript, deployed to Cloudflare Workers through OpenNext. Drizzle ORM
maps a PostgreSQL database accessed through Neon's serverless driver; object uploads use Cloudflare
R2. The UI uses custom global and component CSS. Better Auth supplies the administrator account
flow, while the speaker portal uses a separate email-code/session flow.

## Scale

Approximately 171,000 lines of application and test code across 1,600 files. The shallow clone
contains ≥60 commits by 1 visible contributor, spanning 2026-08-15..2026-08-16.

## Feature coverage

| Area | Coverage | Code-verified behavior |
|---|---:|---|
| CFP intake | ✓ | Public submission routes use versioned, sectioned forms with configurable fields, validation, deadlines, draft/final states, limits, and routing rules. |
| Review rounds & scoring | ✓ | Review plans create rounds, weighted criteria, reviewer assignments, score revisions, recusals, progress views, and configurable committee-average visibility. |
| Anonymized review | ✓ | Review-round settings suppress author identity, and field classification defaults unknown fields to identity-sensitive rather than exposing them. |
| Decisions & notifications | ✓ | Decision revisions are separate from notification jobs; queue/outbox code records delivery attempts and supports bulk informing. |
| Agenda / scheduling | ✓ | Sessions, rooms, tracks, placements, placement history, manual moves, and automatic placement are backed by database mutations and queries. |
| Conflict detection | ✓ | Placement validation detects room, speaker, and track conflicts and additionally evaluates speaker unavailability and room capacity. |
| Speaker portal & tasks | ✓ | Contacts authenticate into an event-scoped portal for profiles, sessions, resources, forms, and assigned tasks. |
| Content deliverables | ✓ | File requests, uploads, versions, comments, approval state, and bulk export are implemented against R2-backed storage. |
| Comms / templates | ✓ | Templates, target selection, reminders, transactional outbox dispatch, retries, delivery logs, and calendar messages have working server paths. |
| Public event pages | ✓ | Published event, schedule, session, and speaker pages query approved event data rather than fixtures. |
| Embeddable widgets | ✓ | Event widgets have dedicated embed routes and configuration for schedule, sessions, speakers, and related public views. |
| Public REST API | ✓ | Versioned public API handlers expose event, submission, speaker, task, schedule, statistics, and communications-log resources. |
| AI features | ✗ | No model invocation or model-backed review, scheduling, or organizer assistant was found; incidental fixture text is not an AI feature. |
| Speaker CRM | ✓ | Contact records, event roster state, notes, tags, imports/exports, deduplication, and CRM mutations are connected to the organizer UI. |
| Sponsors | ✗ | No sponsor or exhibitor domain model, management route, or published sponsor surface was found. |

## Structural choices worth recording

- An organization layer sits above events. Organization membership and event access use separate
  tables and authorization guards, allowing organization roles and per-event grants to coexist.
- Submission data is hybrid-normalized: common proposal fields are first-class columns, custom
  answers are rows in `submission_answers`, and each submission retains its form-version snapshot.
- Features are vertical slices containing contracts, server operations, UI, and tests. The React
  client normally reaches those operations through `/api/internal` JSON endpoints and React Query.
- Administrator and speaker identities deliberately use different authentication/session paths.
- User-facing requests enqueue work into an outbox, while a separate jobs worker handles delivery,
  cleanup, retention, and other background processing.

## Shipped that Cicero did not

- Organization-level team administration with owner/organizer/reviewer roles, invitations,
  per-event access grants, and an organization audit trail.
- Self-service contact and organization JSON exports, transactional contact erasure, and scheduled
  retention cleanup.
- Scheduling constraints for speaker blackout windows and room capacity versus expected session
  attendance, enforced by both the placement validator and automatic placer.

## Cicero shipped that this did not

- Model-backed AI review suggestions and the advisory agenda builder.
- Sponsor/exhibitor records and a published sponsor wall.
- SMS consent, verification, quiet-hour enforcement, and SMS delivery workflows.
- A hosted MCP server plus repository-packaged organizer/speaker agent skills.
- Post-conference recording ingestion, matching, approval, and publication.

## Notes

The live URL is recorded in repository documentation and deployment configuration; it was not
fetched. Commit and contributor figures describe only the visible shallow history. Billing code is
present, but it was not treated as a survey differentiator because availability is configuration-
dependent and it is outside the comparison matrix.
