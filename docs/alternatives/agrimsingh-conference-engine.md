# agrimsingh/conference-engine

**Source:** https://github.com/agrimsingh/conference-engine · **Live:** https://conference-engine.65labs.org
**Found via:** assigned local survey batch (discovery already complete)
**Analyzed:** 2026-08-16 at commit `90078bf0bcda`

## Stack
Next.js 16 App Router and React 19, TypeScript, direct prepared SQL without an ORM, Cloudflare D1 (SQLite) plus R2 and a per-event Durable Object, Tailwind CSS 4, and passwordless one-time-link sessions with hashed event API tokens.

## Scale
Approximately 97,896 lines across tracked TypeScript, JavaScript, CSS, and SQL; 820 files excluding `.git`; ≥56 commits (shallow clone); 2 distinct commit authors; commit span 2026-08-10..2026-08-16.

## Feature coverage
Verified against route handlers, domain modules, migrations, and tests rather than project descriptions.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | Relational CFP forms/fields, form revisions, conditional visibility, drafts, uploads, lifecycle limits, and public submit/finalize routes implement the intake path. |
| Review rounds & scoring | ✓ | Evaluation plans carry dates, reviewer caps and pools; typed criteria and per-criterion responses feed weighted scores, assignments, recusals, reminders, and CSV exports. |
| Anonymized review | ✓ | `src/lib/evaluation/blind.ts` removes submitter name/email and identity-bearing answers before the reviewer payload; each round owns its `blind_review` setting. |
| Decisions & notifications | ✓ | Single and bulk decision routes share transition logic, render saved event templates, send idempotent notifications, and retain delivery/envelope history and retry state. |
| Agenda / scheduling | ✓ | A drag-and-drop board, direct placement routes, deterministic auto-placement, service blocks, bulk publication, and calendar lifecycle updates provide the scheduling workflow. |
| Conflict detection | ✓ | Client and Durable Object enforcement use the same interval rules for room and speaker conflicts and optionally hard-block overlapping tracks. |
| Speaker portal & tasks | ✓ | Magic-link portal access exposes profile editing, proposal acknowledgement/edit/withdraw/handoff, resources, structured action tasks, and task completion. |
| Content deliverables | ✓ | Typed deliverables have R2 assets, versions, comments, organizer/speaker review actions, ZIP export, and revision/approval heads for session and speaker content. |
| Comms / templates | ✓ | Event-editable templates, decision and reminder delivery, send history, retries, calendar invitations, and organizer/reviewer/speaker notices are wired through the email layer. |
| Public event pages | ✓ | Published schedule, session detail, speaker directory/detail, itinerary, and calendar feeds are served from event-slugged public routes. |
| Embeddable widgets | ✓ | The embed builder creates filtered schedule widgets and exposes iframe/loader, JSON, HTML, XML, and iCalendar delivery routes. |
| Public REST API | ✓ | A keyed read API serves submissions, schedule, and speakers; a separately documented event-token admin API performs decisions, placement, speaker management, and other writes. |
| AI features | ✗ | No model provider, prompt, inference call, or AI persistence path exists in the code or dependencies. |
| Speaker CRM | ✓ | Account-level contacts support import preview/commit, tags, activities, segments, merges, pipeline stages/history, event push, bulk email, and per-event speaker CRM records. |
| Sponsors | ✗ | No sponsor or exhibitor schema, route, or public rendering path is implemented. |

## Structural choices worth recording

- Most domain persistence is explicit D1 SQL behind focused `src/lib` modules rather than an ORM; API handlers and Server Components call those modules directly.
- A per-event Durable Object serializes schedule, publication, content-approval, room, and settings mutations. It also broadcasts invalidations over WebSockets to the program cockpit.
- Public read APIs and a broader organizer/agent write API are separate contracts with separate OpenAPI documents; event personal-access tokens cannot manage their own successors.
- The data model keeps forms relational, proposal answers as JSON, and published session/speaker content behind versioned revision heads and explicit approvals.
- Event cloning is configuration-only by construction: identifiers are remapped while submissions, people, memberships, reviewers, and delivery history are excluded.

## Shipped that Cicero did not

- Configuration-only event cloning from the create-event UI/API, copying forms and fields, scorecards, rooms, tracks, task templates, message templates, and schedule policy while excluding participant and operational history.
- Per-event serialized schedule/configuration writes with WebSocket invalidation broadcasts through a Cloudflare Durable Object; Cicero has no realtime schedule stream or Durable Object coordination layer.

## Cicero shipped that this did not

- Advisory AI review and AI agenda proposals, including deterministic no-key fallbacks.
- Sponsor/exhibitor records and a publication-gated public sponsor wall.
- SMS delivery with consent, verification, delivery state, and quiet hours.
- Signed outbound webhooks and a Streamable-HTTP MCP surface with role-scoped agent skills.

## Notes
The live URL is recorded because it appears in repository configuration and documentation; it was not fetched. Text mentioning AI was not counted because there is no implementing provider or execution path. History counts are lower bounds because the clone is shallow.
