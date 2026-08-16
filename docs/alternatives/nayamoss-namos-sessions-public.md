# nayamoss/namos-sessions-public

**Source:** `git@github.com:nayamoss/namos-sessions-public.git` · **Live:** none found
**Found via:** provided repository batch
**Analyzed:** 2026-08-16 at commit `c5e8234`

## Stack

React 18 and Vite, written in TypeScript; Convex is the primary database/function layer, behind a repository adapter that also has an Airtable implementation; there is no conventional ORM. Tailwind CSS 3 and Radix-based components provide styling, Clerk provides authentication, and React Email can deliver through Resend, Amazon SES, or Nodemailer transports.

## Scale

Approximately 45,967 source lines across 538 files excluding `.git`; ≥9 (shallow clone) commits, 1 distinct commit author, spanning 2026-08-13..2026-08-15.

## Feature coverage

| Area | Coverage | Code-verified implementation |
| --- | --- | --- |
| CFP intake | ✓ | Event forms, public submission routes, drafts, validation, participant collection, and uploads are connected to Convex mutations. |
| Review rounds and scoring | ✓ | Evaluation plans support multiple rounds, weighted criteria, assignments, reviewer queues, and progress reporting. |
| Anonymized review | ✓ | The reviewer projection removes names and identity-bearing answer keys before returning assigned submissions. |
| Decisions and notifications | ✓ | Accept/decline decisions update submission state and create operational tasks; decision email has a separate preview/send flow. |
| Agenda and scheduling | ✓ | Schedule records, rooms, tracks, day/week views, placement, and portal itinerary reads are implemented. |
| Conflict detection | ✓ | Schedule checks cover rooms, speakers, tracks, and conflicts against submitted speaker availability. |
| Speaker portal and tasks | ✓ | The portal exposes profile, availability, submissions, schedule, documents, and assigned operational tasks. |
| Content deliverables | ✓ | `speaker_documents`, Convex storage functions, and portal document screens implement file collection and status tracking. |
| Comms and templates | ✓ | Reusable email templates, renderer/transports, previews, reviewer reminders, and message history are connected. |
| Public event pages | ✓ | `/e/:eventSlug` routes expose agenda, sessions, speakers, and personal itinerary views from public feed functions. |
| Embeddable widgets | ✓ | Stored embed configurations drive six public widget views with a preview/configuration surface. |
| Public REST API | ~ | `convex/publicEventsApi.ts` and the documented API page implement API-key access to an events collection, but no comparable session, speaker, or agenda resources were found. |
| AI features | ✓ | The operations agent uses event-scoped read tools, persisted runs/timeline/token usage, clarification, and organizer-approved task proposals. |
| Speaker CRM | ~ | Event speakers have rich profiles and operational status, but the data remains event-scoped and lacks Cicero-style organization contacts, imports, merge history, and dynamic/curated segments. |
| Sponsors | ✓ | Sponsor tiers, sponsor records, contacts, tasks, and sponsor-linked submissions have schema, Convex functions, and organizer screens. |

## Structural choices worth recording

- A repository/data adapter separates the UI and domain services from Convex and an optional Airtable-backed implementation.
- The principal data boundary is an event rather than an organization; no organization membership table mediates the program data.
- Forms embed event-specific schemas while reusable field definitions live in a separate catalog.
- Operations-agent runs, events, usage, settings, and action proposals are first-class persisted records rather than transient chat output.
- Speaker availability is stored as structured constraints and participates directly in scheduling conflict results.

## Shipped that Cicero did not

- Structured speaker availability collected during submission and in the portal, with date/time/daypart constraints surfaced as explicit agenda conflicts.
- An in-product operations agent with managed or organizer-supplied provider configuration, event-scoped read tools, persisted run timelines and token accounting, clarification, and content-hash-bound task proposals that only organizers can apply.

## Cicero shipped that this did not

- A versioned, multi-resource public REST API and OpenAPI contract covering event program resources rather than only event listing.
- An organization-level speaker CRM with CSV import, duplicate detection, reversible merges, sourcing, and dynamic and curated segments.
- Consent-aware SMS, phone verification, quiet hours, and per-channel notification preferences.
- Signed outbound webhooks with recorded attempts and retry controls.
- Post-conference recording ingestion and publication controls.

## Notes

The repository identifies itself as a public mirror of a private production repository, and no deployment URL is included. The history count is therefore reported as a shallow-clone lower bound. Partial API and CRM markings reflect the actual resource functions and data boundaries, not the breadth implied by screen labels.
