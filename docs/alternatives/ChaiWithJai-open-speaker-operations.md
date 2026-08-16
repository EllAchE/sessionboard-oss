# ChaiWithJai/open-speaker-operations

**Source:** `git@github.com:ChaiWithJai/open-speaker-operations.git` · **Live:** none found
**Found via:** provided repository batch
**Analyzed:** 2026-08-16 at commit `0960280`

## Stack

A Python 3.11 Django plugin installed into Pretalx; PostgreSQL is the authoritative deployment database with SQLite supported for local development, Django ORM supplies persistence, Redis/Celery support background work, and Django/Pretalx templates with CSS and JavaScript provide the UI. Authentication and event permissions are inherited from Pretalx.

## Scale

Approximately 42,920 source lines across 343 files excluding `.git`; ≥88 commits (shallow clone), 5 distinct commit authors, spanning 2026-08-08..2026-08-12.

## Feature coverage

| Area | Coverage | Code-verified implementation |
| --- | --- | --- |
| CFP intake | ✓ | Pretalx supplies the core proposal flow; the plugin adds conditional routing, form policy, and reviewer provisioning around those persisted records. |
| Review rounds and scoring | ✓ | `program/reviews.py` and plugin models implement pools, rounds, criteria, assignments, weighted answers, recommendations, and revisions. |
| Anonymized review | ✓ | Blinded rounds use a server-rendered review view that excludes speaker identity, with dedicated reviewer-view tests. |
| Decisions and notifications | ✓ | `program/decisions.py` stages rationales in named acceptance waves and applies acceptance or final rejection through Pretalx's native state and mail paths. |
| Agenda and scheduling | ✓ | The plugin augments Pretalx's schedule with quick placement, deterministic assisted proposals, apply operations, and release controls. |
| Conflict detection | ✓ | `program/policy.py` derives room and speaker overlaps and blocks release server-side when they remain. |
| Speaker portal and tasks | ✓ | Checklist, profile, resource, role, evidence, and task workflows extend the native Pretalx speaker portal. |
| Content deliverables | ✓ | Task evidence is versioned and reviewable with comments/change requests; sessions have publication approval and restorable content revisions. |
| Comms and templates | ✓ | Pretalx queued mail/templates are supplemented by reminder rules, receipts/logs, and calendar output. |
| Public event pages | ✓ | Pretalx's published schedule is extended with public speaker/session gallery and detail views. |
| Embeddable widgets | ✓ | `public_widgets.py` and its template/static assets implement configurable session, speaker, gallery, and responsive schedule embeds. |
| Public REST API | ~ | The pinned Pretalx dependency provides upstream API behavior, while this plugin adds status/ICS/MCP endpoints; the repository's own implementation does not expose a complete documented program REST contract. |
| AI features | ~ | Buzz/OpenCode profiles and an MCP bridge provide approval-oriented external-agent tooling, but no in-application model invocation or persisted AI suggestion workflow was found. |
| Speaker CRM | ✓ | `crm.py` and plugin models implement organization contacts, imports, duplicate/merge handling, segments, pipeline/history, outreach, event links, and historical conference identities. |
| Sponsors | ✗ | No sponsor or exhibitor model, workflow, organizer screen, or public surface was found in the plugin. |

## Structural choices worth recording

- The product is a Pretalx plugin: it reuses upstream event, proposal, speaker, schedule, permission, and mail models rather than reimplementing the conference core.
- Plugin-owned operational models remain event-scoped and point to Pretalx records where possible.
- Workflow actions use explicit preview/confirmation state and persisted receipts before or after mutating native Pretalx state.
- Imported historical conference data is kept as a provenance-bearing source corpus, distinct from the mutable organizer CRM overlay.
- Release gates wrap Pretalx's schedule and publication actions so policy remains server-enforced.

## Shipped that Cicero did not

- A cross-conference historical program corpus with series/edition/speaker/talk/credit records, field provenance, source identities, and auditable link, split, and relink operations into the organizer CRM.
- Named acceptance waves: chairs stage accept decisions and rationales into a chosen wave, then explicitly release that wave into native Pretalx acceptance and notification while waitlist and final rejection remain separate operations.

## Cicero shipped that this did not

- Sponsor and exhibitor records, deliverables, organizer management, and a public sponsor wall.
- A complete versioned public REST API with an OpenAPI contract implemented by the project itself.
- Native in-application AI review assistance and agenda suggestions; this repository's AI path is external agent tooling.
- Consent-aware SMS delivery, number verification, quiet hours, and per-channel notification preferences.
- Post-conference recording ingestion and publication controls.

## Notes

No deployment URL is stored in the repository. Core CFP, authentication, and part of the public/API behavior come from the pinned Pretalx dependency; the coverage table distinguishes those inherited working paths from plugin-owned code. Commit history is a shallow-clone lower bound.
