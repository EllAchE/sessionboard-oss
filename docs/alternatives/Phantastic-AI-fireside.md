# Phantastic-AI/fireside

**Source:** https://github.com/Phantastic-AI/fireside · **Live:** https://onfireside.com
**Found via:** pre-discovered batch manifest
**Analyzed:** 2026-08-16 at commit aedc8b6d4feb2ed74f66f3e7eff4d395f36f5d75

## Stack
Server-rendered Hono on Cloudflare Workers, TypeScript with small progressive-enhancement JavaScript islands, raw Cloudflare D1 SQL, R2, Workers AI, custom CSS, and cookie sessions reached through passwords, magic links, or Google sign-in; no client framework or ORM.

## Scale
Roughly 50,903 lines across TS/JS/SQL/CSS/HTML; 118 files excluding `.git`; ≥50 commits (shallow clone); 1 distinct author in retained history; 2026-08-12..2026-08-15.

## Feature coverage
Verified against raw schema, query chokepoints, workflows, and registered Hono routes.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | Public event CFP routes create drafts, validate the event’s configurable questions, attach participants/files, submit, and provide signed edit flows. |
| Review rounds & scoring | ✓ | Per-round scorecards, round-specific configuration/dates, weighted scale/select/text criteria, assignment, staged scores, immutable submission, recusal, nudges, round history, and guarded next-round opening are implemented. |
| Anonymized review | ✓ | The review query initializes `authors` to null and only performs the separate participant/name query when that round’s `blind` configuration is false; title search never joins identities. |
| Decisions & notifications | ✓ | Accept/waitlist/reject is staged with a version-matched letter; a separate guarded release commits the full cohort before optional email delivery and records portal delivery regardless. |
| Agenda / scheduling | ✓ | Organizer agenda workflows place, move, resize, cancel, publish, and revise sessions, with public agenda/session/ICS views. |
| Conflict detection | ✓ | A D1 room-overlap trigger and workflow-level speaker-overlap guard reject conflicting placements on every write. |
| Speaker portal & tasks | ✓ | The portal exposes profiles, messages, tasks, helpers acting on a speaker’s behalf, task completion, reminders, and per-event work. |
| Content deliverables | ✓ | File-request tasks upload R2 objects, retain every deck version, provide comments, deadline changes/reminders, organizer file views, and rotatable no-login share links. |
| Comms / templates | ~ | Decision letters, room messages, task reminders, schedule notices, staging, send confirmation, and history work; decision copy is code-defined and general messages are composed ad hoc, with no reusable editable template library. |
| Public event pages | ✓ | Public event home, CFP, agenda, session, speaker gallery/profile, personal schedule, connect, Q&A, recordings, and ICS routes are implemented. |
| Embeddable widgets | ✓ | Agenda and speaker views support public iframe mode, including prefiltered day/track examples and calendar-link outputs from an organizer embed screen. |
| Public REST API | ✗ | The only `/api` route is the signed-in identity check; program automation is exposed through MCP rather than a versioned REST/OpenAPI surface. |
| AI features | ✓ | Workers AI powers an event-aware attendee Q&A/concierge with budget tracking; embeddings, neighbors, and theme caches support discovery/recommendation behavior. |
| Speaker CRM | ✓ | A cross-event roster, notes, tags, segments, pipeline cards, merge handling, imports, relationship history, follow state, and CRM UI are implemented. |
| Sponsors | ✗ | No sponsor/exhibitor domain entity or sponsor-management/public wall is implemented. |

## Structural choices worth recording
- Most pages are server-rendered HTML forms and links; narrowly scoped text-loaded islands add interactions such as stars, review autosave, CFP steps, concierge prompts, and copy controls.
- Important invariants live in D1 triggers and guarded batches: legal submission transitions, room overlap, stale-state checks, and cohort counts are database-enforced rather than UI conventions.
- Review rounds are numbered state on the event, while per-round scorecards and configuration are JSON maps; review rows are keyed by proposal, reviewer, and round so advancing creates a fresh immutable layer.
- Decisions and outbound messages are deliberately two acts: staging mutates state and writes the exact letter; release atomically marks the version-matched cohort delivered before best-effort email copies.
- The attendee social model—stars, connections, shared overlap, follow state, embeddings, neighbor/theme caches, and Q&A—lives beside conference operations in the same database rather than in a separate attendee product.

## Shipped that Cicero did not
- An attendee social layer with connection requests, mutual acceptance, shared starred-session overlap, speaker following, and personalized discovery data.
- An event-aware attendee Q&A/concierge backed by Workers AI, with deterministic instant answers where possible and persisted spend budgets for model calls.
- Rotatable no-login links for one requested deliverable, exposing the current file, version history, and comment context to AV/web collaborators.

## Cicero shipped that this did not
- A versioned public REST API with scoped keys and generated OpenAPI.
- Reusable editable communication templates with merge-field preview and audience campaigns.
- Sponsor/exhibitor entities and a public sponsor wall.
- An advisory AI agenda placement builder.
- Five distinct widget layouts with a JavaScript auto-resizing embed loader.

## Notes
The live host is present in both the README and Worker routing code. The retained Git history is shallow. MCP is implemented as hand-written JSON-RPC over `POST /mcp`; it was not counted as a REST API. No credentials from repository documentation are reproduced here.
