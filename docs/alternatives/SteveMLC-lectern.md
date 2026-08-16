# SteveMLC/lectern

**Source:** <https://github.com/SteveMLC/lectern> · **Live:** <https://lectern.lectern-go7.workers.dev>
**Found via:** pre-cloned survey batch
**Analyzed:** 2026-08-16 at commit `de72998`

## Stack
One Cloudflare Worker running Hono plus a Vite/React 19 SPA, TypeScript, a repository layer over Cloudflare D1 (SQLite), R2 assets, Tailwind CSS 4, organizer bearer-passcode auth, signed speaker/reviewer capability links, and optional password-based submitter accounts.

## Scale
Approximately 30,677 lines of source and test code across 211 files. The checkout contains ≥79 commits (shallow clone), 1 distinct commit author, and a reachable commit span of 2026-08-12..2026-08-14.

## Feature coverage
Verified against shared domain functions, D1 queries, Hono routes, and React screens.

| Area | Coverage | Code evidence |
|---|---:|---|
| CFP intake | ✓ | Multiple public CFP forms, editable/reorderable typed fields, conditional show/hide rules shared with the API, open/close windows, length and submission limits, drafts, reminders, optional accounts, capability-link submissions, and speaker deduplication are implemented. |
| Review rounds & scoring | ✓ | Round-scoped criteria, reviewer pools, caps, explicit/automatic assignment, reviewer queues, recusal, weighted scorecards, progress, and editable submitted reviews are backed by D1 routes and the reviewer portal. |
| Anonymized review | ✓ | Each round has `blind_mode`; reviewer-queue queries omit speaker identity in blind rounds, while score submission rechecks the assignment and round. |
| Decisions & notifications | ✓ | Guarded approve/maybe/deny transitions persist committee reasoning, convert accepted submissions idempotently, draft speaker-facing copy, and deliver reviewed messages through the outbox. |
| Agenda / scheduling | ✓ | Direct invited sessions, session editing, drag/drop and exact slot controls, filters, publication, public projections, and per-session/event/itinerary ICS are implemented. |
| Conflict detection | ✓ | Shared domain code detects room and speaker overlaps; the D1 agenda update path recalculates and returns live conflicts. |
| Speaker portal & tasks | ✓ | Signed portals expose profile/proposal edits, workflow tasks, custom portal-form responses, resources, files, comments, and private session invites. |
| Content deliverables | ✓ | R2-backed assets carry task/session context, versions, organizer/speaker comments, and download routes; sessions also have version history and content-approval states. |
| Comms / templates | ~ | Bulk personalized email, portal invitations, reminders, schedule notices, decision copy, delivery receipts, and optional Resend delivery work. The `message_templates` table has no CRUD/query path and the two preview “templates” are hard-coded kinds, so there is no working reusable template manager. |
| Public event pages | ✓ | `/e/:slug` renders event/CFP state, searchable schedule, session details, speaker gallery, and a browser-local personal itinerary from public D1 projections. |
| Embeddable widgets | ✓ | Dedicated iframe-safe schedule, sessions, and speaker-gallery HTML routes support filtering and are previewed by the embed builder. |
| Public REST API | ✓ | The same Hono API used by the SPA exposes public event/program JSON and authenticated organizer/speaker/reviewer operations; `/api/docs` provides a machine-readable route index. |
| AI features | ✓ | Bounded Anthropic calls can draft decision feedback, schedule notices, and reviewer scorecards; every flow has a deterministic fallback and requires human editing/submission. |
| Speaker CRM | ~ | The organizer speaker directory supports CSV import, direct creation, workflow statuses, logistics notes, search/filter, and updates, but it is event-scoped and has no cross-event contact layer, segments, or sourcing pipeline. |
| Sponsors | ✗ | “Sponsor session” is a direct session label only; no sponsor/exhibitor entity, contact, tier, intake, or public wall exists. |

## Structural choices worth recording

- The React SPA is a client of the Hono API; one Cloudflare Worker serves both API and built assets, keeping that HTTP boundary same-origin.
- Shared pure domain functions own CFP windows, conditional-field pruning, review aggregation, decisions, acceptance, communication personalization, and schedule conflicts; handlers inject storage and clocks.
- `LecternRepo` is the persistence boundary. D1 is the complete product backend; the separate Airtable repository is explicitly a limited proof adapter, while production mirroring is an integration out of D1.
- D1 uses normalized operational tables, while R2 holds binary speaker assets. Session content is revisioned independently from the originating proposal and can be restored.
- Organizer access is a deployment passcode, reviewer and speaker access is capability-link based, and submitters may choose password accounts without making them mandatory for public intake.

## Shipped that Cicero did not

- Numbered program-session content versions with an organizer restore action and a separate draft/in-review/approved publication state, while preserving the original proposal unchanged.
- AI-drafted decision emails and scheduled-session notices from an organizer's internal note, with required portal/checklist or slot facts injected even if the model omits them and a human-controlled send step.
- A schema-adopting Airtable mirror across ten operational tables (events, tracks, rooms, speakers, submissions, reviews, sessions, agenda, tasks, and messages), with stored external IDs and guarded orphan/duplicate cleanup; Cicero's mirror covers three entity types.

## Cicero shipped that this did not

- A full cross-event speaker CRM with custom fields, imports, reversible merges, segments, campaigns, and sourcing; Lectern's event speaker directory is partial coverage.
- Sponsor/exhibitor records, tiered publication, public walls, embeds, and REST output.
- A reusable, versioned communication-template library and audience-based campaign composer; Lectern has working sends but no template-management path.
- An advisory AI agenda-placement builder; Lectern's AI assists communication and review but does not propose a schedule.
- Signed outbound webhooks, Streamable-HTTP MCP, role-scoped agent skills, and post-conference recording publication.

## Notes
The live URL is stated in the repository README, Worker routes, and production scripts. External email and AI behavior is configuration-dependent; the fallback and review paths remain functional without those providers. Commit history is a lower bound because this checkout is shallow.
