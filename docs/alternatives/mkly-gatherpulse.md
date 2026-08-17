# mkly/gatherpulse

**Source:** <https://github.com/mkly/gatherpulse> · **Live:** none found
**Found via:** pre-cloned survey batch
**Analyzed:** 2026-08-16 at commit `ecd5561`

## Stack
Next.js 16 and React 19, TypeScript, Prisma 7 over PostgreSQL, Tailwind CSS 4 with shadcn/Base UI components, and Better Auth magic links with optional TOTP two-factor authentication.

## Scale
Approximately 137,666 lines of source and test code across 892 files. The checkout contains ≥118 commits (shallow clone), 1 distinct commit author, and a reachable commit span of 2026-08-09..2026-08-12.

## Feature coverage
Verified against routes, services, persistence, and tests rather than the README.

| Area | Coverage | Code evidence |
|---|---:|---|
| CFP intake | ✓ | Versioned multi-step definitions, conditional visibility, open/close and access policies, expiring drafts, public submission, applicant edits, categories, and limits are implemented in `src/server/cfp/*` and `/cfp/[publicId]`. |
| Review rounds & scoring | ✓ | `src/server/evaluations/` implements versioned plans, multiple rounds, weighted rubrics, reviewer committees, explicit and automatic assignments, draft/final evaluations, recusal, progression, and results. |
| Anonymized review | ✓ | Rounds persist `IDENTIFIED`, `BLIND`, or `ANONYMIZED` visibility; `reviewer-workspace.ts` removes speaker sections and identities before building the reviewer view. |
| Decisions & notifications | ✓ | `evaluations/decisions.ts` enforces final-round completeness and revision rules; `cfp/decision-notifications.ts` queues idempotent, rendered accept/reject deliveries. |
| Agenda / scheduling | ✓ | Agenda placements, proposals, exports, an organizer agenda workspace, and publication are backed by `src/server/agenda/*` and persisted placement rows. |
| Conflict detection | ✓ | `agenda/conflicts.ts` detects event-boundary, room, track, and speaker overlaps with timezone-aware explanations. |
| Speaker portal & tasks | ✓ | Passwordless speaker sessions expose profile editing, submissions, resources, assignments, reminders, task responses, approvals, revisions, and file comments. |
| Content deliverables | ✓ | Versioned speaker-task submissions, direct file requests, authenticated downloads, approval states, replacement policies, exports, and storage adapters are wired through `src/server/files/` and `src/server/speakers/`. |
| Comms / templates | ✓ | Versioned templates, token rendering, audience resolution, bulk dispatch, per-recipient delivery attempts, retries, decision notices, and session calendars are implemented in `src/server/communications/`. |
| Public event pages | ✓ | Published program views and public event resource pages read only the latest published snapshot. |
| Embeddable widgets | ✓ | Agenda/session and speaker views, feeds, itinerary ICS, and an iframe auto-resize loader are exposed under `/embed/[eventSlug]` and `/embed/gatherpulse.js`. |
| Public REST API | ✓ | Public agenda/session/speaker routes plus API-token-protected submission, speaker, and session routes are implemented under `/api/v1`; request contracts live in `src/server/developer-api/`. |
| AI features | ✗ | No model provider, AI service, or user-triggered inference path appears in application code; references to “AI” are fixture text or unrelated abbreviations. |
| Speaker CRM | ✓ | Event contacts, organization-level directory segments, custom fields, spreadsheet import, speaker-interest forms, and an auditable prospect-stage pipeline have services and organizer screens. |
| Sponsors | ✓ | Sponsor/exhibitor groups, ordered tiers, members, publish/close intake forms, public partner submissions, and accept/reject review flows are implemented. |

## Structural choices worth recording

- The data model is highly normalized and version-oriented: CFP forms and policies, submission revisions, speaker profiles, program sessions, templates, integration mappings, and published programs all keep separate version rows.
- Publication creates an immutable JSON snapshot in `PublishedProgramVersion`; public pages, feeds, and API reads consume that snapshot rather than live organizer tables.
- Organization membership and event membership are separate, allowing one organization directory and authorization layer to span multiple events.
- Next.js pages and actions call domain-specific server modules in `src/server/*`; the public/private developer API is another adapter over the same repositories.
- Participant portals are configurable records of their own, separate from both the organizer application and CFP form definitions.

## Shipped that Cicero did not

- Optional passwordless TOTP two-factor authentication, including backup codes, failed-attempt lockout, one-time-code replay protection, and reauthentication before security changes.
- Public sponsor/exhibitor intake forms whose submissions can be reviewed into tiered partner groups and linked contacts.
- Single-use, expiring file-fulfillment links that let an arbitrary contact or contact group satisfy a file request without entering the speaker portal.
- Immutable, numbered published-program snapshots with explicit publish, republish, and unpublish history; Cicero publishes current rows rather than preserving whole-program publication snapshots.

## Cicero shipped that this did not

- Advisory AI review suggestions and AI agenda proposals with deterministic no-key fallbacks.
- SMS delivery with consent, E.164 normalization, OTP verification, quiet hours, and per-notification channel preferences.
- Post-conference recording publication behind session and recording publication gates.
- A Streamable-HTTP MCP server and role-scoped agent skills over the event API.

## Notes
No live deployment URL is present in repository configuration or documentation. The repository documents Vercel and self-hosted Node operation. Commit history is a lower bound because this checkout is shallow.
