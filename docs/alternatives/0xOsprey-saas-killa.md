# 0xOsprey/saas-killa

**Source:** https://github.com/0xOsprey/saas-killa · **Live:** https://saas-killa.0xosprey.com/
**Found via:** assigned local survey batch (discovery already complete)
**Analyzed:** 2026-08-16 at commit `b68f286a0c5d`

## Stack
Next.js 15 App Router and React 19, TypeScript, Drizzle ORM, PostgreSQL, Tailwind CSS 4 plus local UI primitives, and passwordless single-use magic-link sessions.

## Scale
Approximately 51,162 lines across tracked TypeScript, JavaScript, CSS, and SQL; 304 files excluding `.git`; ≥50 commits (shallow clone); 2 distinct commit authors; commit span 2026-08-11..2026-08-12.

## Feature coverage
Verified against Server Actions, query modules, schema/migrations, and end-to-end tests rather than project descriptions.

| Area | Status | Code evidence |
|---|---|---|
| CFP intake | ✓ | The public CFP writes first-class proposal fields and configurable typed questions/answers, enforces event dates, creates author links, and supports later speaker edits. |
| Review rounds & scoring | ✓ | Review rounds own dates, close state, criteria, weights, reviewer pools, assignments, recusals, typed responses, and round-scoped human/AI reviews. |
| Anonymized review | ✓ | Blind rounds are the default; blind queue queries avoid joining authors, and identity is fetched separately only for a non-blind round. AI inputs use a speaker-free `BlindSubmission` type. |
| Decisions & notifications | ✓ | Organizer decision actions transition submissions and separately send accept/reject mail, with email-log idempotency and speaker calendar notices. |
| Agenda / scheduling | ✓ | Organizer schedule pages provide room/time placement, automatic scheduling, service blocks, schedule views, filters, publication, personal calendars, and ICS feeds. |
| Conflict detection | ✓ | `src/lib/conflicts.ts` reports speaker and room overlap, declared-unavailability overlap, and declined or withdrawn placements; auto-scheduling uses the same half-open interval rule. |
| Speaker portal & tasks | ✓ | Speaker pages cover profile, proposals, availability, content, posters, custom portal pages, and structured task completion; organizer pages can assign and remind. |
| Content deliverables | ✓ | Typed upload records, version chains, comments, review status, content revisions, field locks, organizer file views, and speaker slide/poster/headshot workflows are connected. |
| Comms / templates | ✓ | Audience-filtered bulk email supports merge fields, rendered preview, preset templates, send logs, retries, decision messages, reminders, and calendar updates. |
| Public event pages | ✓ | Public agenda and details, speakers, posters, and awards pages are publication-gated and backed by database reads. |
| Embeddable widgets | ✓ | Agenda and speaker widgets ship as CORS JSON, safe DOM-building loader script, and iframe pages, with organizer-selected fields and filters. |
| Public REST API | ✓ | Versioned public event, session, and speaker list/detail routes use pagination and CORS; an OpenAPI document is committed under `public/api/v1`. |
| AI features | ✓ | Configurable Anthropic evaluator personas score blind proposal inputs with a shared rubric and tool-call schema; results are stored as attributed AI review rows and remain non-decisive. |
| Speaker CRM | ✓ | Contacts support notes, tags, dynamic segments, pipeline stages/cards/history, import, and event-facing speaker profile and content workflows. |
| Sponsors | ✗ | No sponsor/exhibitor entity or public sponsor surface exists; the embed test treats `sponsors` as an unknown widget kind. |

## Structural choices worth recording

- The deployment is intentionally single-event: `getEvent()` selects the first event row, and the schema comment identifies one event per deployment.
- Core proposal attributes are columns; custom CFP answers, rubric responses, persona weights, locks, and revisions use JSON/child tables according to their access patterns.
- AI evaluator personas own bot user identities and write ordinary round-scoped review rows. Their scores therefore participate in the effective aggregate, although only human actions change proposal status; Cicero stores AI advice outside human aggregates.
- Uploads use an application-managed file directory and guarded download route rather than R2/S3/database blob fallback.
- Route-specific Server Actions and query modules form the application boundary; there is no shared HTTP/service-layer split between the UI and public API.

## Shipped that Cicero did not

- Awards with organizer nominations, committee rubric ballots, attendee community voting, finalist/winner publication, tallying, and winner notifications.
- An embargo-aware public poster hall where speakers upload or link poster media, organizers assign boards, and signed-in visitors bookmark posters.
- Speaker-declared availability windows with organizer editing and schedule warnings when a placement overlaps an unavailable period.

## Cicero shipped that this did not

- Multi-event scoping and an event switcher within one deployment.
- Sponsor/exhibitor records and a publication-gated public sponsor wall.
- SMS delivery with consent, E.164 normalization, OTP verification, and quiet hours.
- Signed outbound webhooks and a Streamable-HTTP MCP surface with role-scoped agent skills.

## Notes
The live URL is recorded because it appears in the repository; it was not fetched. The AI evaluator influences aggregate scoring but does not call decision actions. History counts are lower bounds because the clone is shallow.
