# MoizIbnYousaf/open-events

**Source:** <https://github.com/MoizIbnYousaf/open-events> · **Live:** <https://openevents.engineer/>
**Found via:** Noah asked for the live submission to be added in the Kill My SaaS Discord and had previously shared its public repository
**Analyzed:** 2026-08-17 at commit `be4f203c`

## Stack
Vite and React 19 in TypeScript with TanStack Router and Query, backed by a Hono Cloudflare Worker. Drizzle maps a D1 relational schema and R2 holds uploaded files. Clerk protects organizer access, while bounded signed email links create submitter, reviewer, and speaker sessions. Resend handles durable email delivery, and OpenRouter can power the public-context Orby help assistant.

## Scale
Approximately 153,777 lines of source and test code across 726 files. The complete checkout contains 49 commits by 1 commit author spanning 2026-08-16..2026-08-17. Git reports that the clone is not shallow.

## Feature coverage
Verified against the domain invariants, Drizzle schema and migrations, application services, Hono routes, React workspaces, and executable tests.

| Area | Coverage | Code evidence |
|---|---:|---|
| CFP intake | ✓ | Frozen numbered form versions, pages, conditional/routing rules, drafts, caps, email access, co-speakers, attachments, server-side validation, and submission are implemented. |
| Review rounds & scoring | ✓ | Configurable rounds, criteria, committee membership, assignment, caps, scoring, recusal, progress, and advancement are present. |
| Anonymized review | ✓ | `blindedSubmissionsFor` derives the proposals hidden by anonymous rounds and the reviewer projection applies that set before returning assignment cards. |
| Decisions & notifications | ✓ | Append-only decisions, acceptance/session creation, invite delivery, message capture/Resend modes, and retryable delivery jobs are wired together. |
| Agenda / scheduling | ✓ | Invited and accepted sessions, rooms, tracks, drag placement, deterministic assisted placement, publication, and iCalendar output are implemented. |
| Conflict detection | ✓ | Shared domain functions detect room, speaker, and track overlaps before assisted placement and report the same conflict set to the organizer. |
| Speaker portal & tasks | ✓ | Signed speaker access exposes decisions, profiles, resources, tasks, form tasks, messages, files, readiness, and session information. |
| Content deliverables | ✓ | Typed upload slots, R2 objects, retained versions, headshot handling, organizer file views, and download authorization are implemented. |
| Comms / templates | ✓ | Captured and Resend delivery modes, templates, immutable jobs, budgets, confirmation records, provider receipts, and verified inbound webhooks are present. |
| Public event pages | ✓ | Published schedule, session, speaker, profile, and programme pages are implemented with publication and media gates. |
| Embeddable widgets | ✓ | Managed embed records render public programme views through a dedicated `/embed/:id` route. |
| Public REST API | ✗ | The Hono JSON routes serve the application and public browser surfaces, but no versioned external programme API, API-key boundary, or OpenAPI contract was found. |
| AI features | ✓ | Orby calls OpenRouter with the current public event context and page path, answers across attendee/speaker/reviewer/organizer workflows, and refuses to claim access to private state. |
| Speaker CRM | ✗ | Contacts, contributors, and speaker profiles are event/workflow records; no cross-event directory, segments, sourcing, or outreach CRM was found. |
| Sponsors | ✗ | No sponsor/exhibitor entity, organizer workflow, intake, tier, or public partner surface was found. |

## Structural choices worth recording

- Published CFP form versions are immutable in both service code and D1 triggers. Submissions pin the version and content hash they were validated against, so later form edits do not reinterpret old answers.
- Domain modules hold deterministic rules for form routing, scoring eligibility, blindness, agenda placement, and conflicts; Hono routes mainly authenticate actors, parse inputs, and call those services.
- Email delivery has explicit capture, test, and live modes plus durable per-recipient/environment budgets. Provider webhook evidence is append-only and intentionally stores no message body or recipient.
- Orby is a bounded help assistant, not an agent. Its prompt contains public event facts and route guidance, excludes private account and decision state, and falls back safely when no model key is configured.

## Shipped that Cicero did not

- A role-aware support assistant grounded in current public event facts and the page being viewed, available across attendee, submitter, speaker, reviewer, and organizer journeys.
- Database-enforced immutable CFP publication snapshots: D1 triggers refuse edits and deletion under a published version, while submissions retain their exact version and content hash.

## Cicero shipped that this did not

- A versioned public REST/OpenAPI surface, signed outbound webhooks, and Streamable-HTTP MCP with role-scoped agent skills.
- A cross-event speaker CRM with import, custom fields, reversible merges, segments, and sourcing.
- Sponsor/exhibitor management, a public partner wall, and the exhibitor-hall map.
- Consent-aware SMS and post-conference recording publication.

## Notes
The live URL was supplied in the add request and the public repository was shared earlier by the same participant. The deployed site was not fetched or used as evidence. No secret-bearing values were inspected. The exact 49-commit count comes from a complete clone.
