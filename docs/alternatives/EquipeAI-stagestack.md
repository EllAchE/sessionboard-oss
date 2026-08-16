# EquipeAI/stagestack

**Source:** `git@github.com:EquipeAI/stagestack.git` · **Live:** https://stagestack.dev
**Found via:** provided repository batch
**Analyzed:** 2026-08-16 at commit `d3ed11f`

## Stack

TanStack Start and React 19 on Vite, written in TypeScript; Convex supplies the database and server functions without a separate ORM; Tailwind CSS 4 and a vendored component system provide styling; Clerk provides authentication. The workspace also includes a server-side import worker, Resend delivery, and Vercel/Convex deployment configuration.

## Scale

Approximately 150,914 source lines across 1,137 files excluding `.git`; ≥126 commits (shallow clone), 1 distinct commit author, spanning 2026-08-09..2026-08-15.

## Feature coverage

| Area | Coverage | Code-verified implementation |
| --- | --- | --- |
| CFP intake | ✓ | `convex/model/cfp.ts` and `cfpForms.ts` implement published forms, conditional sections, drafts, deadlines, uploads, and routed submission. |
| Review rounds and scoring | ✓ | `convex/model/reviews.ts` implements rounds, weighted scorecards, reviewer assignment/distribution, conflicts of interest, and completion tracking. |
| Anonymized review | ✓ | The review query builds a blind projection that removes speakers and identity-bearing form sections before returning reviewer data; tests exercise the boundary. |
| Decisions and notifications | ✓ | Decisions can be staged and explicitly released; release promotes sessions and creates invitation and email work. |
| Agenda and scheduling | ✓ | `agenda.ts` and `agendaPlanner.ts` implement board placement plus deterministic suggestion, preview, and apply operations. |
| Conflict detection | ✓ | Release readiness derives room and speaker blockers and track warnings, and the server release path enforces the blockers. |
| Speaker portal and tasks | ✓ | `portal.ts` and `tasks.ts` implement confirmation/decline, slot acknowledgement, assigned work, and separate manager access. |
| Content deliverables | ✓ | `taskFiles.ts`, `tasks.ts`, and session content history implement versioned uploads, comments, review/change requests, approvals, and content revisions. |
| Comms and templates | ✓ | `comms.ts`, `templates.ts`, jobs, and reminders implement reusable templates, Resend sends, logs, calendar messages, and reminder digests. |
| Public event pages | ✓ | The public event route renders the explicitly published program snapshot by event slug. |
| Embeddable widgets | ✓ | `embeds.ts` and the public widget route implement configurable agenda, session, speaker, gallery, and itinerary layouts. |
| Public REST API | ✓ | `convex/http.ts` serves the published program as public JSON with CORS, plus program/embed iCalendar feeds. |
| AI features | ✓ | `apps/worker/src/import-agent.ts` uses an LLM to plan spreadsheet imports, while selected operations execute later through deterministic Convex capabilities. |
| Speaker CRM | ✓ | `contacts.ts` implements organization-level contacts, tags, notes, pipeline history, saved audiences, imports, duplicate handling, merge, and outreach. |
| Sponsors | ✗ | No sponsor or exhibitor entity, workflow, query, or public surface was found. |

## Structural choices worth recording

- Convex model modules own policy and invariants; exported Convex functions are deliberately thin capability wrappers over them.
- Contacts belong to an organization and can be reused across its events, while event roles and program records remain event-scoped.
- One immutable `publishedPrograms` snapshot feeds the public page, widgets, JSON endpoint, and iCalendar output.
- A session's primary manager is modeled separately from its speaking participants and can be handed off through an organizer-mediated workflow.
- Spreadsheet interpretation runs as a job in a separate worker; the model proposes operations but cannot write application state directly.

## Shipped that Cicero did not

- Primary-manager delegation for a session: a non-speaking submitter can manage speakers and work, and an organizer-mediated verified-email handoff preserves the current manager until the new manager accepts.
- An approval-gated AI spreadsheet importer for CSV, XLS, XLSX, and ODS that plans contacts, tracks, tags, proposals, and sessions; organizers select operations and deterministic, idempotent capabilities execute them.

## Cicero shipped that this did not

- Sponsor and exhibitor records, deliverables, organizer management, and a public sponsor wall.
- Consent-aware SMS delivery with number verification, quiet hours, and per-channel notification preferences.
- Signed outbound webhook subscriptions and delivery/retry history.
- Post-conference recording ingestion, publication approval, and public recording display.

## Notes

The live URL is stated in the repository README. The checkout is shallow, so history counts are lower bounds. Feature calls above use the Convex model and test implementations rather than README claims; no sponsor implementation was present in schema, functions, or routes.
