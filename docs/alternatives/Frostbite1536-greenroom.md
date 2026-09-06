# Frostbite1536/greenroom

**Source:** <https://github.com/Frostbite1536/greenroom> · **Live:** <https://greenroom-hq.com/>
**Found via:** Jeremy Limitless asked for it to be added after the survey preview was shared in the Kill My SaaS Discord
**Analyzed:** 2026-08-17 at commit `7a5777f8`

## Stack
Next.js 16 and React 19 in TypeScript, with Prisma mapping a relational PostgreSQL model and stored uploads represented in the database. Styling is custom CSS. The deploy configuration targets Vercel. Authentication uses scrypt password credentials with self-service signup, login, and reset, while explicitly gated signed persona sessions keep the hosted demo easy to enter.

## Scale
Approximately 113,385 lines of source and test code across 583 files. The visible checkout contains 465 commits, 2 distinct commit authors, and a commit span of 2026-08-09..2026-08-17. Git reports this clone is shallow, so the commit count is a lower bound and the author count covers visible history only.

## Feature coverage
Verified against the Prisma model, route handlers, service modules, generated OpenAPI document, assistant boundary, and executable tests.

| Area | Coverage | Code evidence |
|---|---:|---|
| CFP intake | ✓ | Versioned `FormConfig`/`FormField` records, public draft/resume/submit routes, conditional fields, attachments, close/cap checks, and confirmation are wired end to end. |
| Review rounds & scoring | ✓ | Evaluation plans, criteria, explicit assignments, score capture, progress, recusal, and result views are implemented. |
| Anonymized review | ✓ | `EvaluationPlan.isBlind` is enforced while building reviewer-visible assignments; the reviewer projection omits speaker identity rather than relying on the UI to hide it. |
| Decisions & notifications | ✓ | Individual and bulk decisions persist audit evidence, dispatch templated notices, and create the accepted session and onboarding work. |
| Agenda / scheduling | ✓ | Rooms, tracks, slots, manual moves, automatic placement, publication, and organizer schedule views are implemented. |
| Conflict detection | ✓ | Placement checks detect room and shared-speaker overlaps and keep conflicting automatic placements out of the agenda. |
| Speaker portal & tasks | ✓ | The portal exposes profile editing, assigned task forms, resources, file delivery, and session ownership. |
| Content deliverables | ✓ | Abstract attachments, speaker decks, stored files, replacement state, and organizer review/download paths are implemented. |
| Comms / templates | ✓ | Editable templates, audience dispatch, merge rendering, delivery state, and stored message history are present. |
| Public event pages | ✓ | Published schedule, session, speaker, and resource views are derived from publication-gated records. |
| Embeddable widgets | ✓ | Public schedule and speaker projections have dedicated embed routes and generated snippets. |
| Public REST API | ✓ | A versioned read-only `/api/v1` surface, per-event hashed credentials, an OpenAPI 3.1 document, and a rendered API reference are implemented. |
| AI features | ✓ | OpenAI Responses calls draft decision notes and speaker-resource pages; routes return suggestions for human review and never persist or publish model output automatically. |
| Speaker CRM | ✗ | `SpeakerProfile` is tied to event participation; no cross-event directory, sourcing pipeline, segments, or outreach CRM was found. |
| Sponsors | ✗ | No sponsor or exhibitor entity, intake workflow, management surface, or public partner wall was found. |

## Structural choices worth recording

- The relational model keeps forms, reviews, programme, speaker tasks, stored files, API credentials, and audit records event-scoped, with service functions enforcing the cross-table transitions.
- The public API is deliberately narrow and read-only. Its contract and human-readable reference are generated from the same source, while organizer mutations stay on authenticated application routes.
- AI is a suggestion boundary rather than an agent: the client has no mutation tools, conversation state, or automatic save path, and each feature supplies its own bounded output schema.
- The Airtable mirror and generic Accelevents push are one-way operator-triggered projections. They were not counted as bidirectional Airtable or the survey's preview/reconcile Accelevents integration.

## Shipped that Cicero did not

- Password signup, login, and reset backed by versioned scrypt credentials, in addition to the gated one-click demo personas.
- AI-drafted personal decision notes and speaker-resource wiki pages, returned as editable suggestions with explicit human save/publish steps.

## Cicero shipped that this did not

- A cross-event speaker CRM with import, custom fields, reversible merges, dynamic and curated segments, and sourcing.
- Sponsor/exhibitor management, publication-gated partner surfaces, and the exhibitor-hall map.
- Consent-aware SMS, post-conference recording publication, Streamable-HTTP MCP, and signed outbound webhooks.
- Bidirectional Airtable reconciliation and reversible CRM merges.

## Notes
The live URL and repository were supplied together in the Discord request. The deployed site was not fetched or used as evidence; this survey reads the public source at the pinned commit. No secret-bearing values were inspected.
