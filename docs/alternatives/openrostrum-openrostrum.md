# openrostrum/openrostrum

**Source:** https://github.com/openrostrum/openrostrum · **Live:** https://openrostrum.com
**Found via:** assigned local survey batch (discovery already complete)
**Analyzed:** 2026-08-16 at commit `1bd2a9ba1e4d`

## Stack
React Router 7 Framework Mode and React 19, TypeScript, Drizzle ORM, Cloudflare D1 (SQLite) with R2 blobs, Tailwind CSS 4 plus custom primitives, and first-party PBKDF2 password/session authentication.

## Scale
Approximately 132,686 lines across tracked TypeScript, JavaScript, CSS, and SQL; 909 files excluding `.git`; ≥156 commits (shallow clone); 3 distinct commit authors; commit span 2026-08-11..2026-08-14.

## Feature coverage
Verified against route loaders/actions, domain modules, schema, and tests rather than project descriptions.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | `app/cfp/*`, the form/field tables, the admin form editor, and the public multi-step `submit.*` routes implement versioned dynamic forms, participant/session steps, validation, and submission persistence. |
| Review rounds & scoring | ✓ | `evaluation_plans`, `evaluation_rounds`, round questions/evaluators, evaluation answers, and the evaluation/review routes implement dated rounds and weighted scorecards. |
| Anonymized review | ✓ | `app/routes/reviews.$id.tsx` resolves blindness per assigned round and omits participant identity from the server payload; organizer result reads remain identified. |
| Decisions & notifications | ✓ | `app/domain/accept.ts` owns status transitions, and the submissions route requires a rendered accept/decline preview before the send action writes email-outbox records. |
| Agenda / scheduling | ✓ | `app/agenda/board.tsx` provides drag-and-drop placement and `app/agenda/lib.ts` provides placement, lane, and deterministic auto-build logic. |
| Conflict detection | ✓ | `detectConflicts` checks strict room and speaker overlap; the board marks affected sessions and the publish dialog enumerates unresolved conflicts. |
| Speaker portal & tasks | ✓ | Event-configurable portals expose profile, submissions, participation controls, tasks, and shared files; `tasks` and `task_assignments` back organizer and participant actions. |
| Content deliverables | ✓ | `app/domain/files.ts` and the file routes implement typed R2 uploads, version chains, review state, comments, downloads, and ZIP export. |
| Comms / templates | ✓ | Editable email templates, an idempotent outbox, history, decision and task/draft reminders, unsubscribe suppression, and calendar-invite revisions are connected to Resend or a log transport. |
| Public event pages | ✓ | Public sessions, speakers, gallery, schedule, and itinerary routes share the published-program projection in `app/lib/program.ts`. |
| Embeddable widgets | ✓ | Configured `sessions`, `speakers`, `agenda`, `itinerary`, and `gallery` embeds render through `/embed/:publicId`, with filtering, hidden fields, accent color, and copyable embed code. |
| Public REST API | ✓ | The Hono `/api/v1` surface exposes events, sessions, contacts/speakers, lookups, and files behind scoped API tokens; serializers force PII masking and the surface is explicitly read-only. |
| AI features | ✓ | `app/domain/ai-review.ts` runs optional bulk review suggestions through an injected provider, persists them separately in `ai_reviews`, and excludes them from human evaluation aggregates. |
| Speaker CRM | ✓ | The organization-wide CRM implements directory import, custom fields, reversible contact merges/aliases, notes, dynamic segments, and pipeline stages/history. |
| Sponsors | ✗ | No sponsor or exhibitor entity, organizer workflow, or public sponsor surface is implemented. |

## Structural choices worth recording

- React Router loaders and actions are the application boundary. Domain writes live mainly in `app/domain`, reusable reads and projections in `app/lib`, and external systems behind injected `app/ports` interfaces.
- Forms, fields, and answers are normalized tables; the submission keeps workflow columns first-class, while arbitrary answers and immutable revisions live in child tables.
- The public pages, widgets, and data feeds all consume one published-program projection, limiting visibility-rule drift between delivery formats.
- The compatibility API follows Sessionboard-shaped routes and organization/event-scoped tokens, but intentionally implements reads only and masks contact data in a central serializer.
- Airtable synchronization is isolated to the configured demo organization and uses link snapshots for three-way reconciliation rather than treating Airtable as the primary store.

## Shipped that Cicero did not

- A demo-organization-scoped, bidirectional Airtable synchronizer: it pulls remote descriptive and selected workflow edits, resolves changes against stored snapshots, accepts signed Airtable webhook pings, polls as a fallback, refreshes webhook expiry, and stops mass remote deletions with a circuit breaker. Cicero's Airtable integration is a one-way mirror.

## Cicero shipped that this did not

- Sponsor/exhibitor records and a publication-gated public sponsor wall.
- An advisory AI agenda proposal flow in addition to AI review.
- SMS delivery with consent, E.164 normalization, OTP verification, and quiet-hours enforcement.
- Signed outbound webhooks and a Streamable-HTTP MCP surface with role-scoped agent skills.

## Notes
The live URL is recorded because it appears in the repository; it was not fetched. The Airtable delta above is deliberately limited to the demo-organization scope enforced by `app/sync/runner.ts`. History counts are lower bounds because the clone is shallow.
