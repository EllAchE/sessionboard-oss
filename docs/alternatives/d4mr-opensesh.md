# d4mr/opensesh

**Source:** git@github.com:d4mr/opensesh.git · **Live:** https://app.opensesh.io

**Found via:** Pre-discovered repository batch supplied for this survey.

**Analyzed:** 2026-08-16 at commit 35450414ef90dbf552c8d74c9c6613fac1223e23

## Stack

pnpm workspace monorepo; TanStack Start, React 19, and TypeScript; Effect-based domain and repository services; Drizzle ORM with PostgreSQL; Tailwind CSS, shadcn/ui, and Radix; Better Auth with email/password, organizations, and MCP OAuth; deployed to Cloudflare Workers with Hyperdrive, R2, and Queues.

## Scale

- 1,155 files excluding `.git`; approximately 95,728 lines across the principal source, style, and SQL file types.
- ≥61 commits (shallow clone), by 1 distinct commit author, spanning 2026-08-13..2026-08-14.

## Feature coverage

- **CFP intake — ✓.** Public event/form routes render stored form fields, conditional logic, participants, and submission validation; server functions persist submissions through the domain repositories.
- **Review rounds and scoring — ✓.** Configurable rounds, weighted criteria, assignments, recusal, and reviewer queues are implemented and queried by the reviewer UI.
- **Anonymized review — ✓.** Blind rounds pass submissions through server-side redaction that removes participants and known identity strings from the returned title and description.
- **Decisions and notifications — ✓.** Decision state is distinct from informing applicants; the UI and server path can queue decision mail and retain delivery logs.
- **Agenda and scheduling — ✓.** Organizers can edit placements, create named agenda drafts, compare a draft with the current schedule, and publish a JSON agenda snapshot.
- **Conflict detection — ✓.** Scheduling code detects room and speaker overlaps and presents them in the agenda workflow.
- **Speaker portal and tasks — ✓.** The portal includes a resource hub, profiles, task templates and instances, portal forms, and assigned file requests.
- **Content deliverables — ✓.** File requests use object storage and retain versions, comments, review state, and organizer/speaker workflows.
- **Comms and templates — ✓.** Templates, campaigns, recipient snapshots, reminders, queueing, and delivery logs have working server paths.
- **Public event pages — ✓.** Public agenda, session, speaker, gallery, and personal-itinerary routes read the published event projection.
- **Embeddable widgets — ✓.** Saved widgets produce iframe embeds as well as JSON and subscribable iCalendar endpoints.
- **Public REST API — ✓.** A bearer-key `/api/v1` API exposes broad event-domain resources, CORS behavior, and an OpenAPI document.
- **AI features — ✓.** Anthropic-backed review assistance and agenda-rule generation are implemented; agenda generation also has a deterministic solver fallback.
- **Speaker CRM — ✓.** Organization-level contacts have stages and notes and can be linked to event-specific contacts.
- **Sponsors — ✗.** No sponsor or exhibitor model, service, route, or user interface was found in the application source.

## Structural choices worth recording

- An accepted submission remains the session projection: scheduling fields live on `submissions`, and a manually created session is represented by a submission without a source form.
- Publication copies the mutable schedule into `events.publishedAgenda` and tracks whether later edits make that snapshot dirty.
- Effect domain and repository services are shared by TanStack server functions, the REST API, and the MCP surface.
- The contact model separates organization-level CRM records from their event-specific links.

## Shipped that Cicero did not

- Persisted, named agenda draft variants can be duplicated, discarded, compared with the live schedule, and selectively accepted.
- The embed builder directly exposes JSON and subscribable iCalendar URLs for each saved widget, in addition to iframe markup.
- The MCP integration includes an OAuth 2.1 authorization server with dynamic client registration, PKCE, consent, and discovery endpoints.

## Cicero shipped that this did not

- Sponsor and exhibitor CRM, including a public sponsor wall.
- Consent-aware SMS with OTP verification, unsubscribe handling, and quiet-hour scheduling.
- Post-conference recording records and publication gates.

## Notes

The live URL is recorded in repository configuration. The public “agenda coming soon” state is the unpublished branch of a working publication flow, not a scheduling placeholder. History statistics are lower bounds because the supplied clone is shallow.
