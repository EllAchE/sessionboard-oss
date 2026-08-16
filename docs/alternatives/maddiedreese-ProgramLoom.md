# maddiedreese/ProgramLoom

**Source:** https://github.com/maddiedreese/ProgramLoom · **Live:** https://app.programloom.com
**Found via:** pre-discovered batch manifest
**Analyzed:** 2026-08-16 at commit 0411789b457d14449d47fb7cad6783f5afbc82eb

## Stack
React 19, React Router 7, and Vite, TypeScript, Hono on Cloudflare Workers, raw D1 SQL rather than an ORM, Cloudflare D1/R2/Queues, custom CSS, passwordless magic-link sessions, scoped API tokens, and OAuth 2.1 clients.

## Scale
Roughly 79,278 lines across TS/TSX/JS/SQL/CSS/HTML; 340 files excluding `.git`; ≥50 commits (shallow clone); 1 distinct author in retained history; 2026-08-11..2026-08-12.

## Feature coverage
Verified against Hono routes, migrations, Worker libraries, and React production surfaces.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | Multi-step public forms, custom fields/conditions, publish windows, drafts, edit links, attachments, confirmation, and a public CFP directory are implemented. |
| Review rounds & scoring | ✓ | Multiple named rounds, per-round reviewer pools/capacity, weighted numeric/select scorecards, assignment, draft/submit, recusal, aggregates, and routing are persisted and exposed in organizer/reviewer UIs. |
| Anonymized review | ✓ | `review_rounds.is_blind` controls the reviewer query; blind reads omit speaker-section fields and never load proposal people. |
| Decisions & notifications | ✓ | Staged accept/waitlist/decline decisions, decision history, secure action tokens, templates, scheduled/bulk communications, and delivery events are implemented. |
| Agenda / scheduling | ✓ | Organizer agenda routes and UI create/move/cancel/publish agenda items, calendar records, and revisions across multi-day events. |
| Conflict detection | ✓ | Schedule validation records and surfaces room/speaker conflicts and blocks unsafe publication. |
| Speaker portal & tasks | ✓ | Speaker profiles, onboarding task assignments, reminders, notification preferences, portal resources, and organizer readiness/control-room views are wired. |
| Content deliverables | ✓ | Files and versions, comments, content revisions, export records, share links, content-state management, and speaker file requests are implemented. |
| Comms / templates | ✓ | Editable templates, recipient audiences, scheduled communications, retries, delivery events, notification center/preferences, and calendar lifecycle messages are implemented. |
| Public event pages | ✓ | Public program, CFP directory/forms, sessions, speakers, agenda, itinerary, and interest pages are present. |
| Embeddable widgets | ✓ | Five configurable widgets have iframe/`embed.js` output plus JSON, XML, and iCalendar feeds. |
| Public REST API | ✓ | Versioned endpoints, API tokens, OpenAPI 3.1, usage/rate-limit records, signed webhooks, OAuth 2.1 PKCE, refresh rotation, and MCP/query endpoints are implemented. |
| AI features | ✓ | Organizer-triggered advisory proposal assessments call the configured model, persist reasoning/strengths/risks separately, cap usage, and permit audited human override without making a decision. |
| Speaker CRM | ✓ | Organization-wide contacts, custom fields/values, import, notes, pipeline cards/history, dynamic/curated segments, campaigns, interest forms, and event links are implemented. |
| Sponsors | ✗ | No sponsor/exhibitor entity or public sponsor wall is implemented. |

## Structural choices worth recording
- A single Hono Worker serves API routes and Vite assets while React owns the client application; domain behavior is organized by route/library files over direct D1 statements rather than a service/ORM layer.
- Reusable event templates snapshot tracks, rooms, CFP forms, review rounds, scorecards, tasks, communications, widgets, and settings, then apply that snapshot during event creation.
- Reviewer routing is a persisted rule engine: prioritized AND/OR condition groups select a round and reviewer pool, support exclusions/tags, preview effects, and record each routing run/result.
- The developer platform is a product subsystem of its own: API tokens, OAuth clients/codes/refresh tokens, webhook subscriptions/deliveries, usage records, download grants, OpenAPI, MCP, and structured query all share authorization scopes.
- AI review remains advisory but is durable and auditable: assessments retain model output in their own table, while human overrides add explicit score/reason/actor fields.

## Shipped that Cicero did not
- Reusable whole-event templates that copy program settings, rooms/tracks, CFP structure, review rounds/scorecards, tasks, communications, and widgets into a new event.
- OAuth 2.1 authorization-code flow with PKCE S256, confidential/public client management, refresh-token rotation, discovery, and revocation.
- Conditional reviewer-routing rules with nested condition groups, priorities, exclusions, tags, dry-run preview, and recorded routing results.

## Cicero shipped that this did not
- Sponsor/exhibitor entities and a published-only sponsor wall.
- An advisory AI agenda placement builder in addition to AI review.
- SMS consent, E.164 normalization, OTP verification, quiet hours, opt-out, and delivery state.

## Notes
The repository records separate marketing and application hosts; the application URL is used above. The retained Git history is shallow. No sponsor implementation was found in schema, Worker routes, or UI code; CRM pipeline records were not treated as sponsor entities.
