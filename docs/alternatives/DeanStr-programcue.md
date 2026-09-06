# DeanStr/programcue

**Source:** <https://github.com/DeanStr/programcue> · **Live:** <https://programcue.com/>
**Found via:** Dean shared the public repository after being tagged in the narrow survey-refresh request in the Kill My SaaS Discord
**Analyzed:** 2026-08-17 at commit `8c0092a4`

## Stack
React Router 8 and React 19 in TypeScript on Cloudflare Workers. D1 holds a large relational schema written through explicit SQL services and mirrored by Drizzle types; R2 stores files, Queues carry durable work, and an event-scoped Durable Object broadcasts realtime invalidations. Better Auth supplies magic-link plus optional Google and Microsoft sign-in. The application also integrates Airtable, Accelevents, Resend, direct calendar providers, several model providers, and a versioned REST/OpenAPI surface.

## Scale
Approximately 396,170 lines of source and test code across 1,192 files. The shallow checkout contains 50 visible commits by 1 commit author spanning 2026-08-16..2026-08-17, so the commit count is a lower bound and the author count covers visible history only.

## Feature coverage
Verified against the route registry, D1 migrations, service boundaries, provider adapters, Worker bindings, UI workspaces, and executable tests.

| Area | Coverage | Code evidence |
|---|---:|---|
| CFP intake | ✓ | Versioned forms, conditional pages and fields, email verification, drafts, co-speakers, attachments, publish gates, and public application routes are implemented. |
| Review rounds & scoring | ✓ | Plans, rounds, assignments, caps, conflicts, mixed-type criteria, discussion, moderation, AI suggestions, score revisions, and outcomes are wired through reviewer and chair workspaces. |
| Anonymized review | ✓ | Anonymous-round reads use blinded proposal projections and recheck event, role, assignment, and round state at the write boundary. |
| Decisions & notifications | ✓ | Individual and bulk decisions, waitlists, release state, accepted-speaker invitations, durable communications, and outbound webhook events share audited operations. |
| Agenda / scheduling | ✓ | Versioned schedules, drag/drop, automatic placement, publication, direct sessions, rooms, tracks, undo, and reconciliation are implemented. |
| Conflict detection | ✓ | Persisted room, speaker, track, availability, capacity, and policy conflicts are recomputed against schedule revisions and enforced during moves. |
| Speaker portal & tasks | ✓ | Participant dashboards expose profiles, invitations, task dependencies, comments, evidence, resources, calendar connections, and completion undo. |
| Content deliverables | ✓ | R2 multipart uploads, versions, signature/scan state, approval, comments, export, recordings, and cleanup/retry workflows are implemented. |
| Comms / templates | ✓ | Versioned rich-text templates, triggers, recipient queries, previews, Resend receipts, suppression, retry, unsubscribe, and operational reconciliation are present. |
| Public event pages | ✓ | A versioned event microsite publishes programme, session, speaker, sponsor, recording, custom page, social-card, calendar, and itinerary surfaces. |
| Embeddable widgets | ✓ | Managed public programme and speaker embeds have versioned configuration, status, preview, and script/iframe delivery paths. |
| Public REST API | ✓ | `/api/v1`, public projections, per-event expiring keys, a generated OpenAPI contract, Scalar reference, and signed outbound webhooks are implemented. |
| AI features | ✓ | A streaming organizer assistant invokes governed read and proposal tools, persists threads, and requires explicit approval before executing mutation proposals; separate review-assessment flows remain advisory. |
| Speaker CRM | ✓ | The organization-level Speaker Network supports import, fields, deduplication/merge, event linking, filtering, history, and roster handoff. |
| Sponsors | ✓ | Sponsor records, tiered public snapshots, event-site publication, recordings, and public partner rendering are present. |

## Structural choices worth recording

- The system uses D1 as the normal authority but can move an event's programme authority to Airtable. Provider writes, projections, hashes, run state, retries, and explicit recovery keep a partial external failure from silently creating two truths.
- Most mutations are revision-checked D1 transactions. A per-event Durable Object broadcasts committed invalidations over WebSockets; it does not own the database write, so realtime collaboration still has an optimistic revision boundary.
- Mutations that touch external systems become durable operations with idempotency keys, Queue delivery, retry/cancellation, evidence rows, and an Operation Centre rather than fire-and-forget fetches.
- Privacy retention is an irreversible event transition. Transactional redaction ends by setting an immutable completion tombstone, and D1 triggers reject future writes that would reintroduce participant PII.
- The AI assistant separates read tools from proposed mutations. Human approval creates an audited execution, and rejected or revised proposals never masquerade as committed product state.

## Shipped that Cicero did not

- Bidirectional Airtable authority with conflict fencing, projection reconciliation, retries, recovery, and an explicit migration back to D1.
- A streaming in-product AI assistant with governed tools and approval-gated mutation proposals.
- Direct Google and Microsoft calendar connections that create and reconcile provider events, beyond downloadable or subscribable iCalendar.
- Reviewer discussion threads attached to assigned proposals and governed by round/role visibility.
- Conflict-aware agenda undo: move, place, and unassign operations return a revision-bound token and refuse to reverse across intervening schedule changes.
- Transactional participant-retention completion with an immutable tombstone and database triggers that prevent PII from returning.
- Whole-event cloning, restorable content revisions, expiring itinerary-share links, Accelevents preview/reconcile export, organization-level team administration, social sign-in, and mixed-type scorecards.

## Cicero shipped that this did not

- An organizer-uploaded exhibitor-hall PDF with a dedicated public/embed map surface.
- Consent-aware SMS with E.164 normalization, OTP verification, and quiet-hour delivery.
- A role-scoped Streamable-HTTP MCP server and installable agent skills; MCP packages are declared, but no server route or tool surface was found in application code.
- Reversible CRM merges. Program Cue merges duplicate contacts and fences the retired identity, but no unmerge/restore transition was found.

## Notes
The public source and landing URL were supplied in Discord. An access-controlled evaluation path was also mentioned there, but this survey neither retained nor used any access credential; only the public repository was read. The live site was not fetched. No secret-bearing values were inspected.
