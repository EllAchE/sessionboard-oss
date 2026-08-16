# guangyusong/opencallboard

**Source:** `git@github.com:guangyusong/opencallboard.git` · **Live:** https://opencallboard.com
**Found via:** provided repository batch
**Analyzed:** 2026-08-16 at commit `a131cca`

## Stack

React 19 on Vite, written in JavaScript; a Cloudflare Worker supplies the API, raw SQL targets Cloudflare D1 without an ORM, R2 stores files, and Cloudflare Queues carry email jobs. Plain CSS styles the application. Authentication is a custom one-time-link and secure-session system with organizer accounts and role-scoped speaker/reviewer grants.

## Scale

Approximately 26,712 source lines across 103 files excluding `.git`; ≥13 (shallow clone) commits, 1 distinct commit author, spanning 2026-08-11..2026-08-13.

## Feature coverage

| Area | Coverage | Code-verified implementation |
| --- | --- | --- |
| CFP intake | ✓ | Public form, draft/resume, submission, participant, routing, validation, and idempotency handlers write normalized D1 records. |
| Review rounds and scoring | ✓ | D1-backed rounds, criteria, assignments, reviewer grants, drafts/final reviews, and decisions are connected through worker routes and the evaluation UI. |
| Anonymized review | ~ | Reviewer reads omit joined participant records and the UI hides participant-labeled answers in blind rounds, but the generic submission response still includes raw `answers` and `submitterPersonId`. |
| Decisions and notifications | ✓ | The decision handler updates the proposal, promotes an accepted session, creates onboarding work, and integrates with communication templates/outbox. |
| Agenda and scheduling | ✓ | D1 session resources, placement/move screens, schedule release state, and public agenda output are implemented. |
| Conflict detection | ✓ | The worker derives room, participant, and track overlaps from persisted sessions and exposes them through an organizer-only endpoint. |
| Speaker portal and tasks | ✓ | One-time role grants lead to scoped profile, submission, session, task, resource, portal-form, and file-request flows. |
| Content deliverables | ✓ | R2-backed scoped uploads, file requests, file metadata/status, and speaker task completion have server handlers and portal UI. |
| Comms and templates | ✓ | D1 templates, previews, outbox approvals, attempts, reminders, Queue delivery, calendar attachments, and multiple real mail transports are implemented. |
| Public event pages | ✓ | Unauthenticated CFP and five program routes render sessions, agenda, itinerary, speaker list, and gallery from public D1 payloads. |
| Embeddable widgets | ✓ | Stored embed definitions drive the same five public layouts and provide responsive preview and embed-code screens. |
| Public REST API | ✓ | `public/openapi.json` documents the broad event-scoped API, API-token scopes, pagination, optimistic concurrency, public CFP, program, evaluation, portal, comms, webhook, and integration routes implemented by the worker. |
| AI features | ~ | The review assist is a working deterministic text-length heuristic explicitly labeled as local demo guidance; it does not invoke a model or use a server workflow. |
| Speaker CRM | ~ | The CRM screen implements CSV import, tags, notes, pipeline, filters, segments, duplicate merge, and event linking, but those records use the frontend aggregate and are not represented by normalized D1 resources in the deployed path. |
| Sponsors | ~ | Event settings and generic portal group forms can select and collect sponsor/exhibitor groups, but the dashboard counts are fixed and no sponsor entity or management workflow exists. |

## Structural choices worth recording

- The Worker is a single explicit HTTP boundary over normalized D1 tables, with raw SQL, role scopes, optimistic versions, and stable keyset cursors.
- The frontend retains a localStorage demo aggregate and hydrates role-specific server resources when the shared D1 deployment is available.
- Browser sessions and expiring API tokens share the same event-scoped authorization layer; one-time speaker/reviewer grants store hashes rather than reusable plaintext credentials.
- Public pages are aliases of stored embed configurations, so one public payload/layout system serves both standalone and embedded presentation.
- External writes use preview, explicit confirmation text, configuration versions, idempotency hashes, per-operation receipts, and deployment flags.

## Shipped that Cicero did not

- An exact, delete-free Airtable outbound diff with per-record create/update/skip actions, an explicit confirmation gate, stable idempotency keys, and retained run and operation history.
- Deployable AWS SES infrastructure for a reusable shared configuration set plus isolated per-product identities/senders, including DKIM outputs, account-level suppression, encrypted bounce/complaint feedback, and delivery metrics.

## Cicero shipped that this did not

- Server-persisted organization-level speaker CRM data with custom fields, sourcing, reversible merges, and dynamic and curated segments.
- First-class sponsor/exhibitor records, deliverables, organizer workflows, and a public sponsor wall.
- Model-backed review and agenda assistance with explicit AI notices; OpenCallboard's review helper is deterministic demo guidance.
- Server-enforced anonymization that strips all identity-bearing submission fields before reviewer delivery.
- Consent-aware SMS, phone verification, quiet hours, and per-channel notification preferences.
- Post-conference recording ingestion and publication controls.

## Notes

The live URL and OpenAPI URL are stored in the repository. The application is mid-migration from a complete local aggregate to normalized shared D1 resources; coverage is marked partial where a polished screen still depends on that local-only state. Webhook records and retry UI exist, but provider delivery is explicitly mock-only, so they are not treated as equivalent to Cicero's signed outbound webhooks. Commit history is a shallow-clone lower bound.
