# Cicero — submission (short form)

> **Dated competition artifact.** This copy and its evidence were prepared on 16 August 2026. Use
> [`../README.md`](../README.md), [`README.md`](README.md), and the latest CI run for the maintained
> operating state.

**Live demo:** <https://cicero-three.vercel.app>

**Readable HTML:** <https://cicero-submission.elehche.workers.dev/submission/summary.html>

**Repository mirror:** [`submission/summary.html`](submission/summary.html)

**Field survey:** <https://cicero-field-survey.elehche.workers.dev/>

**Source:** <https://github.com/EllAchE/sessionboard-oss>

**License:** MIT

This is the form-field version of the
[`full submission narrative`](06-submission-narrative.md). The dated browser and deployment proof is
in [`06-submission-evidence.md`](06-submission-evidence.md).

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
draft/resume and portal redirect; speaker profile, files, tasks and resources; named weighted review
across rounds; accept/decline decisions; drag-and-drop scheduling with room, track and speaker
conflicts; email templates, send log and updating `.ics` invitations; outstanding-task dashboards;
public event/session/speaker pages, itinerary and embeds; and the required one-way accepted-speaker
Accelevents client with a deterministic credential-free demo mode.

MIT source, Docker Compose, Postgres, MinIO-compatible storage, magic-link roles, and a seeded demo
make the product testable without buying another service.

## What we added beyond the brief

The most important additions are operational rather than decorative:

- assisted chasing from every outstanding-task row, with server-enforced preview and stale-state
  refusal;
- keyboard-first organizer workflows inspired by Linear: `⌘K`/`Ctrl-K` navigation plus queue and
  review shortcuts for repeated triage, scoring, staging, and decisions;
- persistent workspace readiness and quick actions, explicitly scoped to signed-in/active-event
  context rather than falsely claiming infrastructure health;
- speaker double-booking plus event-level warn/block conflict policy;
- versioned speaker files, comments, and post-conference recordings;
- SMS consent/verification/preferences/quiet hours and no-login unsubscribe;
- cross-event speaker CRM, sponsor/exhibitor data, and a public exhibitor-map embed;
- organizer Updates, review permalinks, decision-note exports, and full speaker-portal assistance;
- REST/OpenAPI, signed webhooks, MCP and agent workflows, Airtable mirroring, and safe
  preview/apply/idempotency patterns for programme automation.

## What we deliberately left for later

We excluded payments because the brief says they are not needed. We did not build autonomous
per-person chasing because real operations evidence favored escalation by a named human. Intelligent
agenda optimization needs demand, audience-overlap, venue-capacity, and schedule-quality data before
its output can be evaluated. Automatic post-event messaging needs opt-in timing, preference
enforcement, and an editable purpose. Interactive exhibitor maps and presigned uploads were also
unnecessary for the first release.

The most useful proposed integration is provider-neutral external task sync, with Linear first and
Jira, Asana, Trello, and GitHub Issues following. Cicero would remain the source of conference task
truth while an operations team works in its existing project. Stable IDs, explicit state mappings,
webhooks, reconciliation, and loop prevention are required. The first version should send canonical
links—not silently copy speaker PII, files, or comments into third parties.

Next after that: event cloning, so an annual conference can preserve taxonomy, forms, tasks, and
templates while starting with clean submissions and participant state.

## Architecture and evidence

The UI and public API call one shared service layer; the UI never calls its own HTTP routes. That
keeps deadlines, authorization, publication filters, conflicts, and idempotency consistent across
human and automated entry points. Core programme fields are typed Postgres columns; flexible form
answers use JSONB. Magic links are short-lived and single-use, with guarded on-screen access for
reserved seeded identities.

On 2026-08-16, the current source was production-built in Docker, migrated, seeded, and walked in a
browser. The hosted demo also served its public agenda, embed, First Settlement event, organizer
login, and agenda API; the API returned HTTP 200 with five sessions in three rooms. The evidence pass
also found that the host is on an older `/admin` organizer revision than current `/organizer` source.
The core demo works, but a fresh deployment is required before claiming the newest ergonomics are
live.
