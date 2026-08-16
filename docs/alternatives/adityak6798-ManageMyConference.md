# adityak6798/ManageMyConference

**Source:** <https://github.com/adityak6798/ManageMyConference> · **Live:** <https://project-greenroom-api.adityak6798.workers.dev>
**Found via:** pre-cloned survey batch
**Analyzed:** 2026-08-16 at commit `2e9e71d`

## Stack
Cloudflare Workers with Hono and a Vite/React 19 SPA, TypeScript, Drizzle ORM over Cloudflare D1 (SQLite), R2-backed assets, plain CSS, and emailed-code sessions with optional Google OAuth; Zod contracts generate OpenAPI.

## Scale
Approximately 233,075 lines of source and test code across 856 files. The checkout contains ≥442 commits (shallow clone), 2 distinct commit authors, and a reachable commit span of 2026-08-11..2026-08-15.

## Feature coverage
Verified against domain/application services, D1 adapters, HTTP routes, and browser code.

| Area | Coverage | Code evidence |
|---|---:|---|
| CFP intake | ✓ | The CFP domain implements versioned configurable fields, conditional routing, publication snapshots, open/close windows, anonymous submission, account-owned drafts and resubmission, participants, and public/organizer routes. |
| Review rounds & scoring | ✓ | `application/review` and `domain/review` implement plans, multiple controlled rounds, rubric criteria, assignments, progress, weighted evaluations, recusal, decision history, and dispositions. |
| Anonymized review | ✓ | Reviewer projections mask submitter identity and email-typed answers before returning queues; blind/identity settings are captured with rounds and assignments. |
| Decisions & notifications | ✓ | Review decisions are revisioned and feed lifecycle-triggered, idempotent communication deliveries using stored rendered copy and retryable attempts. |
| Agenda / scheduling | ✓ | Draft revisions, manual placement, assisted draft generation, schedule materialization, publication commands, and reconciliation live in `application/agenda` and its D1 repository. |
| Conflict detection | ✓ | Agenda domain functions calculate placement conflicts and the service refuses or reports room/speaker overlaps when reconciling schedules. |
| Speaker portal & tasks | ✓ | Content services expose speaker profiles, collaborators, invitations, task templates/assignments, due-date reminders, resources, and speaker-facing workspace routes. |
| Content deliverables | ✓ | R2 assets, versioned deliverables, history, workflow states, bulk ZIP download, speaker imports, and content-remix output have adapters, services, routes, and UI. |
| Comms / templates | ✓ | Editable/versioned templates, previews, stored rendered deliveries, immutable attempts, retry, task and CFP deadline triggers, calendar messages, and an outbox worker are implemented. |
| Public event pages | ✓ | Published event projections and an organization-level Sites system serve branded portals, custom pages, linked programs, registration, and versioned privacy consent. |
| Embeddable widgets | ✓ | Saved, configurable embeds and public embed routes are implemented through `EmbedService`, `d1-embed-repository.ts`, and the publishing workspace. |
| Public REST API | ✓ | Hono exposes the product through a broad Zod-validated API; `packages/contracts` generates the checked-in OpenAPI document and the Worker serves `/openapi.json` and `/docs`. |
| AI features | ✓ | Reviewer suggestions use an Anthropic provider when configured and a deterministic provider otherwise; suggestions remain separate drafts until a reviewer applies them. |
| Speaker CRM | ✓ | Contact directory/import, organizations, configurable prospect stages, interest conversion, campaigns, engagement, and outreach are implemented in `application/crm`. |
| Sponsors | ✗ | No sponsor or exhibitor entity, persistence, service, API route, or management surface was found. |

## Structural choices worth recording

- The repository uses explicit domain, application, adapter, and HTTP-transport layers. Domain code does not know Hono or D1; application services depend on repository ports with D1 and in-memory implementations.
- The React SPA calls the Hono API for its own data. The Worker serves the SPA assets and API on one origin, unlike Cicero's Server Components/Actions path that bypasses its HTTP API.
- A separate contracts workspace owns Zod wire schemas and generated OpenAPI, making the API contract a build-checked package shared by server and browser.
- Cross-domain composition is done through narrow public interfaces and “template slices”; event templates capture and apply those slices without reading another domain's tables directly.
- D1 migrations use triggers and table guards for invariants such as review-plan locks, lifecycle transitions, version integrity, and immutable consent history.

## Shipped that Cicero did not

- Organizer-defined event roles with selectable capabilities, per-record-field hide/edit policies, member assignment, event field locks, and a “preview as role” result.
- Versioned event templates that capture selected CFP, review, content, agenda, communications, and publishing slices, preview their effects, and apply them to another event.
- Organization-level branded Sites that compose multiple CFP/interest/portal programs, custom HTML pages, custom registration fields, and versioned privacy-notice consent at one public address.
- Saved reports with expiring public shares and timezone-aware scheduled delivery of expiring report links.
- Google OAuth with persisted attempts, PKCE S256, state verification, provider-account linking, and concurrent-callback handling.

## Cicero shipped that this did not

- Sponsor and exhibitor records with publication gating, tiered public walls, embeds, and REST reads.
- SMS as a second communication channel with consent, verification, quiet hours, and preference management.
- Post-conference recording publication with separate session and recording visibility gates.
- A Streamable-HTTP MCP server and event-scoped agent-mail workflow with content-bound send confirmation.

## Notes
The live URL is recorded because `apps/api/wrangler.toml` contains it as `PUBLIC_BASE_URL` and the same Worker is configured to serve the SPA assets. Several external providers have deterministic adapters or configuration-dependent paths; coverage above counts the product behavior proven by code, not a claim that every external credential path has been exercised. Commit history is a lower bound because this checkout is shallow.
