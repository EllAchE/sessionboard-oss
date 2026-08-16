# caseymanos/opensession

**Source:** https://github.com/caseymanos/opensession · **Live:** https://opensessionboard.com/
**Found via:** pre-discovered batch manifest
**Analyzed:** 2026-08-16 at commit 87981a4c9239eeaa2be6ac42bb9c154afe89cde2

## Stack
React 19 and Vite, TypeScript, Hono on Cloudflare Workers, raw SQL/repository code rather than an ORM, Airtable as authoritative program storage with Cloudflare D1 projections, Durable Objects, R2, Queues, custom CSS/UI packages, magic-link sessions, and scoped API keys.

## Scale
Roughly 195,653 lines across TS/TSX/JS/SQL/CSS/HTML; 560 files excluding `.git`; ≥50 commits (shallow clone); 1 distinct author in retained history; 2026-08-10..2026-08-12.

## Feature coverage
Verified against Worker services/routes, domain packages, migrations, and production UI paths.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | The organizer can version, publish, and close a form; public endpoints load the form and create/resume/edit submissions with server validation, Turnstile, reservations, and private uploads. |
| Review rounds & scoring | ~ | Reviewer groups, assignments, rubric versions/snapshots, criteria, weighted scores, draft/submitted reviews, conflict disclosure, and decisions work, but the model requires exactly one active rubric and has no named multi-round progression. |
| Anonymized review | ✓ | The reviewer contract and workspace project proposal reference, title, abstract, track, and criteria without submitter/speaker identity; contact reads are used for reviewer membership, not proposal authorship. |
| Decisions & notifications | ✓ | Accept/waitlist/decline decision commands persist through the authority layer and bind a template snapshot; versioned templates and preview/confirm campaign delivery are implemented. |
| Agenda / scheduling | ✓ | An event-bound `AgendaCoordinator` serializes place/move/remove/publish commands, persists schedule versions, and broadcasts committed changes. |
| Conflict detection | ✓ | The schedule domain raises structured hard conflicts for overlapping rooms and participants and blocks publication while conflicts remain. |
| Speaker portal & tasks | ✓ | Invitation redemption, portal bootstrap, speaker profile updates, task definitions/assignments, readiness, completion review, and reminders have real endpoints and services. |
| Content deliverables | ✓ | Private R2 upload intents/finalization, task-attached file responses, replacement/version handling, and organizer review are implemented. |
| Comms / templates | ✓ | Versioned editable email templates, merge-schema validation, sanitized preview, audience planning, confirmation, queued delivery, provider events, and suppressions are wired. |
| Public event pages | ✓ | Published public schedule, itinerary, speaker directory, and speaker profiles are rendered from publication projections. |
| Embeddable widgets | ✗ | The `embeds` feature flag exists but defaults false, and no public embed route or widget implementation is registered. |
| Public REST API | ✓ | Scoped API keys, OpenAPI 3.1 generated from the route catalog, API docs, paginated read endpoints, and a submission update endpoint are implemented. |
| AI features | ✗ | No review, schedule, or attendee AI implementation is present. |
| Speaker CRM | ✗ | Contacts and event-contact projections support operational identity, but there is no CRM pipeline, segmentation, import/merge workspace, or CRM UI. |
| Sponsors | ✗ | No sponsor/exhibitor model or organizer/public sponsor surface is implemented. |

## Structural choices worth recording
- Airtable is the authoritative program store. A `BaseAuthority` Durable Object serializes commands, writes Airtable, projects `p_*` read tables into D1, and owns reconciliation/recovery when authority and projection diverge.
- A separate Durable Object is bound to each event schedule. It serializes commands, performs conflict checks against one version, broadcasts committed changes over WebSockets, and uses alarms to resume pending authority writes.
- Each reviewer assignment stores a rubric snapshot, so later rubric changes do not silently reinterpret submitted scores; the tradeoff is a single-active-rubric model rather than explicit rounds.
- Public schedule/speaker pages read publication projections with cache tags and explicit invalidation messages instead of querying the mutable authority on each request.
- Privacy deletion is deliberately not a partial API mutation: the code exports an organization-scoped subject record and directs deletion through a coordinated authority/R2/provider/projection workflow.

## Shipped that Cicero did not
- An owner-authorized privacy export endpoint that resolves one email across account, submissions, reviews, tasks, files, and message projections into a bounded JSON package.
- Per-event real-time schedule updates through a Durable Object WebSocket stream, with committed schedule versions broadcast to connected organizer clients.

## Cicero shipped that this did not
- Named multi-round review progression and configurable blind-review modes.
- Five embeddable public program widgets with an iframe/JavaScript embed path.
- Advisory AI review and AI schedule proposals.
- A cross-event speaker CRM and sourcing pipeline.
- Sponsor/exhibitor management and a public sponsor wall.
- A Streamable HTTP MCP surface and role-scoped agent skills.

## Notes
The live demo and API URLs are recorded in the repository README. The retained Git history is shallow, so scale history is a lower bound. The committed feature-flag catalog explicitly leaves embeds off; fixture-only screens were not counted as shipped production features.
