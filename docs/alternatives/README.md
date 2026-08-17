# Alternative designs

Other people's Sessionboard clones, built against the same frozen brief. One file per project in
this directory; this page is the index and the comparison.

Several teams solving one specification is a natural experiment, and the interesting output is not
a ranking — it is the set of different structural choices made for the same requirement. These
notes describe; they do not grade.

## Status

**32 repositories analyzed**, each read from source at a pinned commit rather than from its README.

| | Count |
|---|---|
| Submissions found | 41 |
| Source repositories located | 33 |
| Repositories analyzed | 32 |
| Found but not analyzed | 9 |

The nine not analyzed, with reasons — an honest denominator matters more than a big numerator:

- **1 repository unreachable.** `everyai-com/grandstage-app` was shared publicly but GitHub returns
  Not Found; it is either private or deleted.
- **8 submissions with a live deployment but no locatable public source.** Board to Death, Greenroom
  (Faris Hussain), Marquee (Stage 11 Agentics), Milk (Tyler), OpenSession (Malik), ProgramKit
  (andheller), Ajay K's `session.drawset.com`, and SuperStage (Ali Zaid). Only the deployed URL was
  shared. Deployed sites were **not** fetched or probed — this survey reads code, and no code was
  available.

Discovery is recorded in [`discovery-log.md`](discovery-log.md). The survey was specified in
[`../handoff/alternative-designs-survey.md`](../handoff/alternative-designs-survey.md).

## Derived from this survey

The prose on this page is hand-written. Everything below is generated from
[`data/projects.json`](data/projects.json) and [`data/features.json`](data/features.json) by
`bun run alternatives:build` — do not hand-edit it, and rerun the build after changing the data.
`bun run alternatives:check` fails CI if a generated file is stale.

The public reading copy is at <https://cicero-field-survey.elehche.workers.dev/> and links back to
the companion submission at <https://cicero-submission.elehche.workers.dev/>.

| | |
|---|---|
| [`feature-matrix.md`](feature-matrix.md) | All 71 features × all 32 projects, unfiltered. |
| [`visual/index.html`](visual/index.html) | The same grid, browsable, with filtering and rollups. |
| [`../07-comparative-requirements.md`](../07-comparative-requirements.md) | `AD-1`…`AD-48` — what the field built that Cicero did not. |
| [`data/survey.json`](data/survey.json) | Machine-readable rollup: counts, scale, stack, area totals. |

To add a project to the survey, use the `survey-alternative-designs` skill in
[`../../.agents/skills/`](../../.agents/skills/survey-alternative-designs/SKILL.md). It carries the
security constraints, the note template, and the data contract.

The 32 analyzed projects span 43–1,600 files (median ≈ 380), 1–5 contributors, and commit histories
that begin no earlier than 2026-08-08 — everyone built inside the same short window.

## Features others shipped that Cicero did not

**This is the list the survey exists to produce.** Consolidated across all 32 projects,
deduplicated, each attributed to the projects that have it. Ordered by how many independent teams
arrived at the same thing — convergence is the signal.

### Shipped by many teams

1. **Whole-event cloning / reusable event templates.** Copy forms, tracks, rooms, scorecards, task
   and message templates, and optionally the team, into a new event. Several implementations preview
   the copy before applying, and deliberately exclude operational history.
   — `agrimsingh/conference-engine`, `jpoehnelt/session-party`, `maddiedreese/ProgramLoom`,
   `TheThingInTheThing/namos-sessions-webapp`, `adityak6798/ManageMyConference`

2. **Speaker availability / blackout windows as a scheduling constraint.** Collected during CFP or
   in the portal as dates, times, or dayparts, then surfaced as explicit conflicts against the
   agenda. Cicero detects room and speaker double-booking but has no concept of a speaker being
   unavailable at a time they were never scheduled.
   — `nayamoss/namos-sessions-public`, `TheThingInTheThing/namos-sessions-webapp`,
   `0xOsprey/saas-killa`, `yisding/openboard.events`

3. **Richer embed output formats.** JSON, XML, subscribable iCalendar, and script-loader snippets
   emitted from the same widget configuration, alongside the iframe. This confirms a gap we had
   already recorded against ourselves.
   — `mrmichael73/greenroom-kms` (script/iframe/JSON/XML/iCal), `d4mr/opensesh`,
   `iankar8/event-manager-os`, `westoque/session-hero`, `akakabrian/sessionslate` (XML program feed)

4. **Revision history with organizer restore.** Attributed, numbered snapshots of proposal and
   session titles/abstracts that an organizer can roll back.
   — `conorbronsdon/callboard-app`, `westoque/session-hero`, `SteveMLC/lectern`,
   `realgenekim/curtain-call-cfp` (append-only whole-application history with time travel)

5. **Bidirectional Airtable sync.** Cicero's Airtable integration is one-way. Others reconcile in
   both directions with field ownership, conflict handling, retries, and dead letters.
   — `openrostrum/openrostrum` (three-way reconciliation, signed webhooks, mass-deletion circuit
   breaker), `jpoehnelt/session-party`, `guangyusong/opencallboard` (delete-free confirmed diff),
   `SteveMLC/lectern` (ten-table mirror), `red/omotenashi` (Airtable as the system of record)

6. **Authentication beyond magic links.** Cicero is magic-link-only by design (`T-4a`); five teams
   read the brief as permitting more.
   — `akakabrian/sessionslate` (Argon2id passwords), `twilwa/session-bored` (Better Auth passwords),
   `M31-Labs/rostrum` (WebAuthn passkeys + GitHub/Google OAuth), `adityak6798/ManageMyConference`
   (Google OAuth with PKCE and account linking), `mkly/gatherpulse` (optional TOTP 2FA with backup
   codes)

7. **Real-time collaborative agenda over Durable Objects + WebSockets.** A per-event Cloudflare
   Durable Object serializes schedule writes and broadcasts invalidations, so several operators can
   drag the grid at once.
   — `agrimsingh/conference-engine`, `caseymanos/opensession`, `jpoehnelt/session-party`,
   `thedatadavis/seshmesh`

8. **In-product streaming AI assistant with tool use.** A chat surface inside the organizer app that
   drives the same tool registry the MCP server exposes, with persisted threads and an approval step
   before mutations. Cicero's AI is advisory-only and out-of-band.
   — `CampbellVentures/smolboard`, `getzenai/untitledconference`,
   `nayamoss/namos-sessions-public`, `Phantastic-AI/fireside`

9. **Tokenized no-login share links.** Expiring, revocable links that expose a proposal, deliverable,
   or report to someone without an account.
   — `iankar8/event-manager-os` (guest advisors with comments), `Phantastic-AI/fireside`
   (rotatable per-deliverable), `mkly/gatherpulse` (single-use file fulfillment),
   `adityak6798/ManageMyConference` (expiring report shares with scheduled delivery)

### Shipped by two teams

10. **OAuth 2.1 authorization server for MCP** — dynamic registration, PKCE, consent, discovery,
    refresh rotation. Cicero's MCP is token-scoped without an authorization-code flow.
    — `d4mr/opensesh`, `maddiedreese/ProgramLoom`

11. **Per-event `llms.txt`** generated from current public state, for AI agents reading the event.
    — `conorbronsdon/callboard-app`, `red/omotenashi`

12. **Accelevents integration** with preview/apply diffs against a real external event platform.
    — `iankar8/event-manager-os`, `jpoehnelt/session-party`

13. **Privacy export and erasure** — self-service data export and transactional deletion.
    — `caseymanos/opensession` (bounded JSON export by email), `yisding/openboard.events`
    (contact/org export, erasure, scheduled retention cleanup)

14. **Organization-level team administration** above the event — roles, invitations, per-event access
    grants, audit trail. Cicero scopes membership to the event.
    — `yisding/openboard.events`, `CampbellVentures/smolboard`, `adityak6798/ManageMyConference`

### Shipped by one team each

15. **Awards** — nominations, committee rubric ballots, attendee voting, published tallies and winner
    notifications. — `0xOsprey/saas-killa`
16. **Embargo-aware poster hall** with board assignments and visitor bookmarks. — `0xOsprey/saas-killa`
17. **Versioned external policy language** for CFP routing, form visibility, review governance, and
    schedule conflicts, with persisted rule traces. — `M31-Labs/rostrum`
18. **Automatic reviewer-company conflict recusal** enforced at assignment, queue, and scoring.
    — `M31-Labs/rostrum`
19. **Hash-chained audit ledger** plus checksummed whole-workspace export/import with uploads.
    — `M31-Labs/rostrum`
20. **Attendee social layer** — mutual connections, shared starred-session overlap, speaker follows.
    — `Phantastic-AI/fireside`
21. **Attendee-facing Q&A concierge** with per-event usage budgets. — `Phantastic-AI/fireside`
22. **Named acceptance waves** that stage decisions and release them as a batch, separately from
    waitlist and rejection. — `ChaiWithJai/open-speaker-operations`
23. **Cross-conference historical program corpus** with field provenance and auditable
    link/split/relink into CRM. — `ChaiWithJai/open-speaker-operations`
24. **Primary-manager delegation** for a session, including non-speaking managers, with an
    organizer-mediated handoff that preserves the incumbent until acceptance. — `EquipeAI/stagestack`
25. **Approval-gated AI import planning** across CSV/XLS/XLSX/ODS, then deterministic idempotent
    application of the selected operations. — `EquipeAI/stagestack`
26. **Resubmit-with-guidance as a first-class decision**, with required organizer guidance and its own
    portal state. — `getzenai/untitledconference`
27. **Predecessor-linked carry-forward lane** for inviting or discarding prior-edition proposals.
    — `getzenai/untitledconference`
28. **Printable organizer run-of-show** with authorized deliverable links. — `getzenai/untitledconference`
29. **Named agenda draft variants** — duplicate, discard, diff against live, selectively accept.
    — `d4mr/opensesh`
30. **Organizer-defined roles with per-field hide/edit policies** and preview-as-role.
    — `adityak6798/ManageMyConference`
31. **Organization-level branded multi-program sites** with custom pages and versioned privacy
    consent. — `adityak6798/ManageMyConference`
32. **First-party TypeScript SDK and CLI** over the same OpenAPI contract, with stable exit codes.
    — `blockbrain-ai/speakerops`
33. **Deployable AWS SES infrastructure stacks** with DKIM, suppression, encrypted bounce/complaint
    feedback, and delivery metrics. — `guangyusong/opencallboard`
34. **Public incremental changes feed** with monotonic sequence numbers, a `since` cursor, and ETags.
    — `realgenekim/curtain-call-cfp`
35. **Direct Sessionize speaker-profile import** from the public CFP flow. — `realgenekim/curtain-call-cfp`
36. **Fail-closed audit persistence** on private token-scoped REST reads — the read fails if the audit
    write fails. — `red/omotenashi`
37. **Mixed-type rubric criteria** (numeric, single-select, and free text in one scorecard).
    — `akakabrian/sessionslate`
38. **AI-seeded scorecards that the server refuses** until every unchanged suggestion is confirmed or
    edited. — `twilwa/session-bored`
39. **Cancellable queued decision notices** with an audit reason and recipient correction before a
    reviewed replacement is sent. — `twilwa/session-bored`
40. **Persistent cross-device attendee schedules** for signed-in attendees, with anonymous fallback to
    local storage. — `twilwa/session-bored`
41. **Self-expiring per-visitor demo sandbox** with rate limits, a global cap, and recurring purge.
    — `westoque/session-hero`
42. **Sponsor tiers with contacts, onboarding tasks, and form routing** — the only sponsor
    implementation deeper than Cicero's in any dimension. — `TheThingInTheThing/namos-sessions-webapp`
43. **Public sponsor/exhibitor intake forms** reviewed into tiered partner groups. — `mkly/gatherpulse`
44. **Immutable numbered program publication snapshots** with publish/republish/unpublish history.
    — `mkly/gatherpulse`
45. **Headshot publication consent bound to the current file**, unable to carry through replacement.
    — `conorbronsdon/callboard-app`
46. **Two-step content publication gate** pinning an approved revision while later speaker edits stay
    draft. — `CampbellVentures/smolboard`
47. **In-app problem reporting** with anti-bot checks, privacy redaction, and delivery to an incident
    policy. — `mauricedesaxe/openboard`
48. **AI-drafted decision emails and schedule notices** that preserve required portal/checklist facts
    and require human send approval. — `SteveMLC/lectern`

## Features Cicero shipped that others did not

Counted across the 32 analyzed projects — how many of them lack each thing.

| Cicero capability | Absent in |
|---|---|
| Sponsors / exhibitors with a publication-gated public wall | 30 of 32 |
| Consent-aware SMS (E.164 normalization, OTP verification, quiet hours) | 26 of 32 |
| Streamable-HTTP MCP server with role-scoped agent skills | 18 of 32 |
| Post-conference recording ingestion with publication gates | 17 of 32 |
| Signed outbound webhooks | 16 of 32 |
| Cross-event speaker CRM (segments, sourcing) | 15 of 32 |
| Versioned public REST API with a generated OpenAPI contract | 12 of 32 |
| Reversible CRM merges | 9 of 32 |

Sponsors is the clearest differentiator: 26 of 32 projects have no sponsor entity at all, 3 have
scaffolding only, and 3 shipped it. Nobody skipped CFP intake or agenda scheduling — those are the
floor everyone cleared.

Two caveats on reading this table. It measures presence, not quality, and it is a comparison against
32 hackathon-window projects, not against the commercial products in this space. And several Cicero
capabilities in it remain **unproven against paid third-party accounts** — outbound email
(`T-6`/`C-3`), SMS, and R2 storage have never been exercised end-to-end with live credentials. Those
rows say we built it, not that we watched it work.

## Comparison matrix

Projects down the side, feature areas across the top — with 32 projects, the brief's orientation
does not fit on a page. `✓` shipped and verified in code, `~` partial (schema without queries, UI
without a server action, a handler returning a fixture), `✗` absent, `?` could not determine.

| Project | CFP intake | Review rounds & scoring | Anonymized review | Decisions & notifications | Agenda / scheduling | Conflict detection | Speaker portal & tasks | Content deliverables | Comms / templates | Public event pages | Embeddable widgets | Public REST API | AI features | Speaker CRM | Sponsors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Cicero** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [0xOsprey/saas-killa](0xOsprey-saas-killa.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| [adityak6798/ManageMyConference](adityak6798-ManageMyConference.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| [agrimsingh/conference-engine](agrimsingh-conference-engine.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| [akakabrian/sessionslate](akakabrian-sessionslate.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ~ | ✗ |
| [blockbrain-ai/speakerops](blockbrain-ai-speakerops.md) | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| [CampbellVentures/smolboard](CampbellVentures-smolboard.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✗ |
| [caseymanos/opensession](caseymanos-opensession.md) | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| [ChaiWithJai/open-speaker-operations](ChaiWithJai-open-speaker-operations.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ~ | ✓ | ✗ |
| [chuchuisrich-rgb/speaker-harmony](chuchuisrich-rgb-speaker-harmony.md) | ✓ | ~ | ✗ | ~ | ✓ | ~ | ~ | ~ | ~ | ~ | ✓ | ✗ | ~ | ✗ | ✗ |
| [conorbronsdon/callboard-app](conorbronsdon-callboard-app.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| [d4mr/opensesh](d4mr-opensesh.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| [EquipeAI/stagestack](EquipeAI-stagestack.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| [getzenai/untitledconference](getzenai-untitledconference.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ |
| [guangyusong/opencallboard](guangyusong-opencallboard.md) | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ~ | ~ |
| [iankar8/event-manager-os](iankar8-event-manager-os.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ~ | ✗ |
| [jpoehnelt/session-party](jpoehnelt-session-party.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✗ |
| [M31-Labs/rostrum](M31-Labs-rostrum.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✗ | ✗ |
| [maddiedreese/ProgramLoom](maddiedreese-ProgramLoom.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| [mauricedesaxe/openboard](mauricedesaxe-openboard.md) | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✗ | ~ | ✗ | ✗ | ✗ |
| [mkly/gatherpulse](mkly-gatherpulse.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| [mrmichael73/greenroom-kms](mrmichael73-greenroom-kms.md) | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✗ | ~ | ✓ | ✗ |
| [nayamoss/namos-sessions-public](nayamoss-namos-sessions-public.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ~ | ✓ |
| [openrostrum/openrostrum](openrostrum-openrostrum.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| [Phantastic-AI/fireside](Phantastic-AI-fireside.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| [realgenekim/curtain-call-cfp](realgenekim-curtain-call-cfp.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✗ |
| [red/omotenashi](red-omotenashi.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ~ |
| [SteveMLC/lectern](SteveMLC-lectern.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ~ | ✗ |
| [thedatadavis/seshmesh](thedatadavis-seshmesh.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ~ | ✗ |
| [TheThingInTheThing/namos-sessions-webapp](TheThingInTheThing-namos-sessions-webapp.md) | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ✗ | ✗ | ✓ |
| [twilwa/session-bored](twilwa-session-bored.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| [westoque/session-hero](westoque-session-hero.md) | ✓ | ✓ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ~ | ✓ | ✗ |
| [yisding/openboard.events](yisding-openboard.events.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |

Area totals across the 32:

| Area | ✓ | ~ | ✗ |
|---|---|---|---|
| CFP intake | 32 | 0 | 0 |
| Agenda / scheduling | 32 | 0 | 0 |
| Conflict detection | 31 | 1 | 0 |
| Speaker portal & tasks | 31 | 1 | 0 |
| Content deliverables | 31 | 1 | 0 |
| Public event pages | 30 | 2 | 0 |
| Embeddable widgets | 30 | 0 | 2 |
| Decisions & notifications | 29 | 3 | 0 |
| Review rounds & scoring | 28 | 4 | 0 |
| Anonymized review | 28 | 3 | 1 |
| Comms / templates | 27 | 5 | 0 |
| Public REST API | 21 | 5 | 6 |
| Speaker CRM | 19 | 7 | 6 |
| AI features | 14 | 8 | 10 |
| Sponsors | 3 | 3 | 26 |

## Project template

Each `docs/alternatives/<owner>-<repo>.md` follows this shape:

```markdown
# <owner>/<repo>

**Source:** <url> · **Live:** <url or "none found">
**Found via:** <where, e.g. competition Discord #submissions>
**Analyzed:** <date> at commit <sha>

## Stack
Framework, language, ORM, database, styling, auth.

## Scale
Rough LOC, file count, commits, contributors, span of commit dates.

## Feature coverage
Walk the brief's areas. Verified against code, not against README claims.

## Structural choices worth recording
Where domain logic lives; submission table shape; form engine vs. hardcoded;
AI advisory vs. decisive; anything genuinely different from how Cicero did it.

## Shipped that Cicero did not

## Cicero shipped that this did not

## Notes
Anything that does not fit above. No credentials, no tokens, no scraped private content.
```

## Rules

- Verify against code. A README claim is a claim, not a fact.
- Describe, do not grade. This is other people's work.
- **Never** record demo credentials, tokens, API keys, or `.env` contents — not even redacted.
- Note what could not be determined rather than guessing. An honest `?` is worth more than a
  confident wrong `✓`.
