# Cicero — submission (short form)

> **Dated competition artifact.** This copy was refreshed on 17 August 2026 against the latest
> merged product baseline. The evidence record separates current-source verification from the older
> hosted revision. Use [`../README.md`](../README.md), [`README.md`](README.md), and the latest CI run
> for the maintained operating state.

**Live demo:** <https://cicero-three.vercel.app>

**Readable HTML:** <https://cicero-submission.elehche.workers.dev/submission/summary.html>

**Repository mirror:** [`submission/summary.html`](submission/summary.html)

**Field survey:** <https://cicero-field-survey.elehche.workers.dev/>

**Source:** <https://github.com/EllAchE/sessionboard-oss>

**License:** MIT

This is the compact public version of the
[`full submission narrative`](06-submission-narrative.md). Copy-ready application responses are in
[`06-submission-form-answers.md`](06-submission-form-answers.md), and the dated browser and deployment
proof is in [`06-submission-evidence.md`](06-submission-evidence.md).

## What it is

Cicero is a self-hostable, open-source event and speaker management system. It carries a conference
from event setup and a public call for speakers, through multi-round review and decisions, into a
conflict-aware agenda, speaker onboarding, communications, and a published public programme with
live embeds.

The brief says the incumbent contains features the team does not use, so Cicero optimizes for
coverage of the real workflow rather than menu-for-menu parity. The product thesis is: **keep the
human in control, but remove the clerical work.** AI may suggest review notes or agenda placements,
but cannot accept a talk or publish a schedule. Task reminders are drafted and reviewed rather than
silently sent.

## The requested feature set

The replacement spine works end to end: event taxonomy and branding; multi-form CFP builder with
custom fields, conditional logic and routing; cold public submission with in-flow account creation,
draft/resume and portal redirect; speaker profile, files, tasks, resources and availability windows;
multi-round review with weighted score, dropdown and text criteria; accept/decline decisions;
drag-and-drop scheduling with room, track, speaker and availability conflicts plus revocable draft
share links; email templates, send log and updating `.ics` invitations; milestone-aware
outstanding-task dashboards; public event/session/speaker pages, agenda starring, a personal
itinerary, seven embeds and portable feeds; and the required one-way accepted-speaker Accelevents
client with a deterministic credential-free demo mode.

MIT source, Docker Compose, Postgres, MinIO-compatible storage, magic-link roles, and a seeded demo
make the product testable without buying another service.

## What we added beyond the brief

The most important additions are operational rather than decorative:

- assisted chasing from every outstanding-task row, with server-enforced preview and stale-state
  refusal;
- whole-event duplication that carries reusable forms, taxonomy, tasks, review setup and templates
  into a clean edition while excluding people, submissions, files, credentials, logs and sync state;
- keyboard-first organizer workflows inspired by Linear: `⌘K`/`Ctrl-K` navigation plus queue and
  review shortcuts for repeated triage, scoring, staging, and decisions;
- a persistent Actions panel, demo-first role entry, live sample embeds, and quick actions with
  discoverable keyboard bindings;
- speaker double-booking, availability windows, event-level warn/block conflict policy, and private
  draft-programme previews;
- versioned speaker files and comments, numbered restorable content revisions, and post-conference
  recordings;
- browser-local, event-scoped attendee schedules plus JSON, XML and subscribable `.ics` output from
  the same embed configuration;
- SMS consent/verification/preferences/quiet hours and no-login unsubscribe;
- cross-event speaker CRM, sponsor/exhibitor data, and a public exhibitor-map embed;
- organizer Updates, accurate overdue pacing, advisory event milestones, review permalinks,
  decision-note exports, unified Messages navigation, and full speaker-portal assistance;
- REST/OpenAPI with readable and Scalar references, browser CORS, signed webhooks, MCP and agent
  workflows, per-event `llms.txt`, Airtable mirroring, and safe preview/apply/idempotency patterns.

## What we deliberately left for later

We excluded payments because the brief says they are not needed. We did not build autonomous
per-person chasing because real operations evidence favored escalation by a named human. Intelligent
agenda optimization needs demand, audience-overlap, venue-capacity, and schedule-quality data before
its output can be evaluated. Automatic post-event messaging needs opt-in timing, preference
enforcement, and an editable purpose. Interactive exhibitor maps and presigned uploads were also
unnecessary for the first release.

Mobile responsiveness received less design and verification time on the dense organizer workflows,
where power users are most likely to review, triage, and schedule on a desktop. The higher-priority
mobile case is attendee-facing output—especially agenda, itinerary, and speaker embeds inside event
websites—and those surfaces still need a focused device and host-site compatibility pass.

The most useful proposed integration is provider-neutral external task sync, with Linear first and
Jira, Asana, Trello, and GitHub Issues following. Cicero would remain the source of conference task
truth while an operations team works in its existing project. Stable IDs, explicit state mappings,
webhooks, reconciliation, and loop prevention are required. The first version should send canonical
links—not silently copy speaker PII, files, or comments into third parties.

Event cloning is now shipped. The next trust and operations work is an append-only Updates source,
headshot consent bound to the exact published file version, scoped dual-attributed organizer
assistance, and provider-neutral task sync with Linear first.

## Architecture and evidence

The UI and public API call one shared service layer; the UI never calls its own HTTP routes. That
keeps deadlines, authorization, publication filters, conflicts, and idempotency consistent across
human and automated entry points. Core programme fields are typed Postgres columns; flexible form
answers use JSONB. Magic links are short-lived and single-use, with guarded on-screen access for
reserved seeded identities.

On 2026-08-16, the then-current source was production-built in Docker, migrated, seeded, and walked
in a browser. The 2026-08-17 refresh audited merged product changes through `d9231a4`, regenerated
the standalone reading copies, and reran the source checks recorded in the evidence document. A live
recheck returned HTTP 200 for the demo, public agenda, and agenda API with five sessions in three
rooms, but confirmed that the host is still on an older `/admin` organizer and landing-page revision
than current `/organizer` source. The core demo works; the new features above remain current-source
claims until a fresh application deployment closes that gap.
