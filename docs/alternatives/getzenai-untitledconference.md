# getzenai/untitledconference

**Source:** git@github.com:getzenai/untitledconference.git · **Live:** https://untitledconference.com
**Found via:** pre-cloned alternatives survey batch (discovery supplied)
**Analyzed:** 2026-08-16 at commit 6c2bbb8

## Stack
SvelteKit 2 and Svelte 5, TypeScript, Drizzle ORM, PostgreSQL, Tailwind CSS 4 with shadcn-svelte/Bits UI, and Better Auth with passwords, passkeys, organizations, and OAuth-provider support. The Cloudflare deployment also uses Hyperdrive and R2; pg-boss runs queued work outside the request path.

## Scale
Approximately 157,900 lines across TypeScript, Svelte, CSS, and SQL (tests included); 1,347 files excluding `.git`; ≥50 commits (shallow clone); 2 distinct authors in the visible history; visible commit span 2026-08-16..2026-08-16.

## Feature coverage

- **✓ CFP intake.** `cfp-schema.ts`, `cfp-form.ts`, and the public `/c/[slug]/cfp` route implement configurable fixed/custom questions, open/close windows, drafts, conditional fields, co-speakers, submission, editing, withdrawal, and CSV export.
- **✓ Review rounds and scoring.** Independent `review_round` rows, per-round weighted criteria, assignments, auto-distribution, recusal, progress, reviewer queues, and persisted score values are wired through `review-rounds.ts`, `review-management.ts`, and `reviewer.ts`.
- **✓ Anonymized review.** `review_round.anonymized` is enforced in the reviewer read model while organizer reads retain identity; peer-score visibility also supports `blind_until_reviewed`.
- **✓ Decisions and notifications.** Accepted, rejected, waitlisted, and resubmit-with-guidance decisions are persisted by `decisions.ts`; `decision-notifications.ts` queues decision-specific messages and the dispatcher records delivery state.
- **✓ Agenda and scheduling.** A drag-and-drop board persists tentative and confirmed talks, breaks, and sponsor reservations; it also exposes a printable organizer run of show and public agenda/iCalendar output.
- **✓ Conflict detection.** `agenda.ts` computes room and speaker overlaps and alternative-placement clashes, and the board renders them. Placement is intentionally permissive: conflicts are visible rather than universally rejected.
- **✓ Speaker portal and tasks.** The portal exposes owned proposals, profiles, participation confirmation, task lists, and per-task actions; acceptance generates tasks from organizer-managed task templates.
- **✓ Content deliverables.** R2-backed uploads retain versions, approval state, cross-role comments, content revisions, bulk download, and organizer/speaker download authorization.
- **~ Comms and templates.** Transactional decision/confirmation mail, reviewer and deliverable reminders, delivery logs, and filtered bulk speaker mail are working. Message copy is hardcoded or composed ad hoc; no reusable communication-template library was found.
- **✓ Public event pages.** Published conference home, agenda, speakers, speaker detail, gallery, itinerary, recordings, CFP, and iCalendar routes read publication-gated data.
- **✓ Embeddable widgets.** The organizer embed screen emits iframe snippets for the public surfaces and the public layout supports an embed mode.
- **✓ Public REST API.** `/api/v1/[...path]` exposes the same tool definitions as REST, publishes OpenAPI 3.1, uses OAuth bearer scopes, and keeps a separate unauthenticated health route.
- **✓ AI features.** A streaming in-app assistant adapts the MCP tool registry for reviewer/organizer chat, supports hosted or organization-selected backends, and gates mutating tool calls behind approval UI and authorization.
- **✓ Speaker CRM.** Organization-wide contacts have notes, tags, cross-event history, saved segments, a sourcing pipeline with stage history, CSV import, and event-roster handoff.
- **~ Sponsors.** Internal sponsor tiers can label submissions and reserve agenda inventory, but sponsor/exhibitor organizations, contacts, assets, and a public sponsor wall were not found.

## Structural choices worth recording

- Conference code is split into SvelteKit route actions, `src/lib/server/conference/*` domain modules, and Drizzle schema modules rather than a single generic CRUD layer.
- Submission answers are normalized into `submission_answer` rows keyed to form fields; Cicero instead keeps stable proposal fields as columns and custom answers in JSONB.
- Tentative and confirmed placements share one table. Conflicts are computed as a read model, and multiple tentative alternatives for one submission are legal.
- The MCP tool registry is protocol-free and reused by MCP, REST/OpenAPI, and the in-app AI assistant, so authorization and tool behavior have one implementation.
- Conferences can point to a predecessor, and a dedicated carry-forward table records invite/discard treatment of prior-edition proposals without copying them into the new event.

## Shipped that Cicero did not

- A first-class `resubmit_with_guidance` proposal decision, including required organizer guidance, a speaker-visible portal state, and a matching notification path.
- A predecessor-linked carry-forward lane where organizers inspect prior-edition proposals and explicitly invite or discard each one.
- A printable organizer run-of-show page that includes scheduled timing, rooms, speakers, abstracts, and authorized deliverable links.
- A streaming, tool-using assistant inside the product that reuses the MCP registry and presents approval cards before mutating calls.

## Cicero shipped that this did not

- Sponsor and exhibitor entities with tiering, assets, publication gates, and a public sponsor wall.
- A reusable communication-template and campaign surface; this project has working mail and ad hoc bulk composition but not saved message templates.
- SMS delivery with consent, E.164 normalization, OTP verification, per-notification opt-out, and quiet hours.
- Signed outbound webhooks with delivery records.

## Notes

The live URL is present in both the repository README and Cloudflare configuration; it was not fetched. The clone is shallow, so commit and contributor observations describe only visible history. Sponsor coverage is intentionally marked partial because sponsor tiers and agenda holds are operational, even though there is no sponsor-management domain. No environment values or credentials were inspected or recorded.
