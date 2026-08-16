# thedatadavis/seshmesh

**Source:** https://github.com/thedatadavis/seshmesh · **Live:** https://seshmesh.christophergdavis.workers.dev
**Found via:** assigned local survey batch (discovery already complete)
**Analyzed:** 2026-08-16 at commit `7795676c0e8e`

## Stack
Hono on Cloudflare Workers with Inertia React 19 and Vite, TypeScript, Drizzle ORM, Cloudflare D1 (SQLite) plus R2 and an agenda Durable Object, hand-written CSS, and first-party PBKDF2 password/session authentication.

## Scale
Approximately 13,397 lines across tracked TypeScript, JavaScript, CSS, and SQL; 185 files excluding `.git`; ≥48 commits (shallow clone); 1 distinct commit author; commit span 2026-08-08..2026-08-15.

## Feature coverage
Verified against Hono handlers, domain modules, schema/migrations, and tests rather than project descriptions.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | Versioned JSON form definitions support typed questions, participant roles, track restrictions and conditional visibility; public-token routes enforce dates, capacity, and multi-submission policy before writing proposals. |
| Review rounds & scoring | ✓ | Review plans contain ordered dated rounds, mixed typed/weighted criteria, reviewer pools, assignments, track coverage, recusals, verdicts, reminders, and results export. |
| Anonymized review | ✓ | Each round carries `anonymized`; reviewer queue/detail projections replace the participant name before returning it while keeping proposal content. |
| Decisions & notifications | ✓ | Decisions are staged in `submission_decisions`, released through a separate action, audited in decision activity, and connected to templated delivery records. |
| Agenda / scheduling | ✓ | Manual placement, deterministic auto-place, list/day/track/room views, publication, calendar sync, and a public schedule are implemented. |
| Conflict detection | ✓ | `findScheduleConflicts` checks duplicate session, room, and all linked-speaker overlaps, and `saveScheduleSlot` rejects conflicting placements server-side. |
| Speaker portal & tasks | ✓ | Participants can claim an identity, edit profiles and proposals, withdraw, view resources, upload assets, comment, and complete structured tasks. |
| Content deliverables | ✓ | R2-backed headshot/slides/supporting uploads enforce ownership and content type, preserve version/supersession chains, accept comments, and support organizer/participant downloads and ZIP export. |
| Comms / templates | ✓ | Editable and operational templates, queued deliveries, retries, decision notices, calendar attachments, task/file reminders, automations, and delivery history are persisted and wired to a provider interface. |
| Public event pages | ✓ | Publication-gated program and speaker pages, public speaker assets, and calendar feeds render from event-scoped read models. |
| Embeddable widgets | ✓ | Five configurable kinds render by opaque token and produce both iframe and loader-script snippets with event/detail/filter/headshot/link controls. |
| Public REST API | ✗ | The Hono router exposes HTML/Inertia form routes and embed/calendar resources, but no versioned JSON REST or OpenAPI surface. |
| AI features | ✗ | The “operations agent” accepts only the exact “What needs attention?” query and deterministically maps database counts to links; no model dependency, prompt execution, or AI persistence exists. |
| Speaker CRM | ~ | A shared `people` identity plus event profiles, CSV import, workflow status, logistics, tasks, sessions, and files provides an event roster, but there is no cross-event CRM UI with merge, notes, segments, or pipeline. |
| Sponsors | ✗ | No sponsor/exhibitor schema, workflow, or public rendering path is implemented. |

## Structural choices worth recording

- One Hono worker owns HTML/Inertia reads and mutations; domain modules accept the Cloudflare environment explicitly and query D1 through Drizzle.
- CFP form definitions are immutable versioned JSON documents, while submissions retain the exact form-version foreign key and their answer blob.
- Global `people` identities are layered with event-scoped profile/workflow rows, separating a person's identity from event bio, logistics, visibility, and readiness.
- A per-event `AgendaCoordinator` Durable Object serializes moves, stores request-id/payload/result triples for replay safety, and broadcasts successful updates over a WebSocket stream.
- The operations-agent screen is a constrained operational read model, not a general or model-backed assistant.

## Shipped that Cicero did not

- Serialized, idempotent agenda moves with a per-event Cloudflare Durable Object and a WebSocket update stream for connected schedule clients.

## Cicero shipped that this did not

- A versioned public REST API with generated OpenAPI, plus the Streamable-HTTP MCP and agent-skill surface.
- Advisory AI review and AI agenda proposals.
- A full cross-event speaker CRM with custom fields, reversible merges, segments, and sourcing pipeline.
- Sponsor/exhibitor records and a publication-gated public sponsor wall.
- SMS delivery and signed outbound webhooks.

## Notes
The live URL is recorded because it appears in the repository; it was not fetched. The deterministic operations screen is recorded as non-AI to distinguish its implemented behavior from its label. History counts are lower bounds because the clone is shallow.
