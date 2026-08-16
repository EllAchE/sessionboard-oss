# blockbrain-ai/speakerops

**Source:** https://github.com/blockbrain-ai/speakerops · **Live:** https://www.speakerops.org
**Found via:** pre-discovered batch manifest
**Analyzed:** 2026-08-16 at commit c479ec2fb254c748cd5e87e6f0c3677371c4c66b

## Stack
React 18 and Vite SPA, TypeScript, Hono on Cloudflare Workers, Drizzle ORM, Cloudflare D1 (SQLite) plus R2 and Queues, custom CSS/Lumen components, magic-link session cookies, and scoped API keys.

## Scale
Roughly 193,083 lines across TS/TSX/JS/SQL/CSS/HTML; 950 files excluding `.git`; ≥50 commits (shallow clone); 1 distinct author in retained history; 2026-08-12..2026-08-16.

## Feature coverage
Verified against route handlers, commands, stores, schema, and UI code.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | Versioned forms, normalized fields/rules, a public CFP runtime, draft/submit handling, uploads, deadlines, rate limiting, and Turnstile are wired through `modules/forms` and `modules/publicCfp`. |
| Review rounds & scoring | ~ | `eval_rounds`, weighted criteria, assignments, abstention, score rollups, bulk assignment, and score export work. The organizer flow manages the active/fallback rubric and does not expose a complete advance-through-multiple-rounds lifecycle. |
| Anonymized review | ✓ | `eval_rounds.hide_speakers` is configurable, and `getEvalAssignmentProposal` strips speaker records in the server DTO before the evaluator receives it. |
| Decisions & notifications | ✓ | Single and bulk accept/reject/waitlist commands materialize or withdraw program artifacts; the decision hand-off pins exact submission IDs to matching templates and requires preview before queued send. |
| Agenda / scheduling | ✓ | Admin schedule list/place/move/unschedule commands and a schedule studio persist placements. |
| Conflict detection | ✓ | Schedule commands reject room and speaker overlaps and placements outside configured agenda hours with structured conflicts. |
| Speaker portal & tasks | ✓ | Acceptance provisions portal access, participant profiles, task templates, speaker tasks, completion, readiness, admin completion, portal forms, and resources. |
| Content deliverables | ✓ | R2-backed headshot/slides uploads plus reusable file requests and per-participant fulfillments are connected to the portal and admin file screens. |
| Comms / templates | ✓ | Editable rich-text templates, merge fields, audience selection, preview, durable outbox jobs, delivery events, and ICS records are implemented. |
| Public event pages | ✓ | Published-only public hub, sessions, speakers, agenda, itinerary, and gallery routes share a stored program snapshot. |
| Embeddable widgets | ✓ | Six chrome-less `/embed/:slug/*` routes and an iframe configurator use the published program read model. |
| Public REST API | ✓ | Scoped keys, a large OpenAPI document, domain endpoints, and a first-party SDK/CLI are implemented. |
| AI features | ✗ | No model-backed or deterministic AI review/agenda feature is present in application code. |
| Speaker CRM | ✗ | People and event participation support the program workflow, but there is no cross-event CRM, sourcing pipeline, segments, or merge workflow. |
| Sponsors | ✗ | No sponsor/exhibitor entity or sponsor-management surface is implemented. |

## Structural choices worth recording
- The product is a Cloudflare-native monorepo: a React SPA calls a Hono Worker, with D1 as the application store, R2 for files, and Queues/outbox records for provider work.
- Domain modules are split into route, command, and store files. Most stores have both memory and D1 implementations, letting tests exercise the same command layer without a Worker database.
- CFP structure is normalized into form versions, fields, rules, and answer rows rather than keeping all custom answers in one submission JSON column.
- Accepting a proposal idempotently materializes the program session, participant accounts, speaker tasks, and portal invitation; changing away from accepted dematerializes only artifacts no longer shared by another active session.
- Public pages and embeds read one explicit program-publication snapshot rather than querying the mutable schedule directly.

## Shipped that Cicero did not
- A first-party TypeScript SDK and non-interactive `speakerops` CLI cover scoped administrative commands, JSON output, stable exit codes, and OpenAPI discovery.

## Cicero shipped that this did not
- A complete organizer-visible multi-round review lifecycle rather than one active/fallback rubric.
- Advisory AI review and AI schedule proposals.
- A cross-event speaker CRM with fields, imports, merges, segments, and sourcing pipeline.
- Sponsor/exhibitor management and its published sponsor wall.
- SMS consent, verification, quiet hours, and delivery tracking.
- A Streamable HTTP MCP server and role-scoped agent skills.

## Notes
The live URL is recorded in the repository README. The retained Git history is shallow, so commit and author observations apply only to the available 50 commits. Feature verdicts above come from application code; planning and audit documents were not used as implementation proof.
