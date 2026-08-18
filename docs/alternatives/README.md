# Alternative designs

Other people's Sessionboard clones, built against the same frozen brief. One file per project in
this directory; this page is the index and the comparison.

Several teams solving one specification is a natural experiment, and the interesting output is not
a ranking — it is the set of different structural choices made for the same requirement. These
notes describe; they do not grade.

## Status

**35 repositories analyzed**, each read from source at a pinned commit rather than from its README.

| | Count |
|---|---|
| Submissions found | 45 |
| Source repositories located | 36 |
| Repositories analyzed | 35 |
| Found but not analyzed | 10 |

The ten not analyzed, with reasons — an honest denominator matters more than a big numerator:

- **1 repository unreachable.** `everyai-com/grandstage-app` was shared publicly but GitHub returns
  Not Found; it is either private or deleted.
- **9 submissions without locatable public source.** Board to Death, Greenroom (Faris Hussain),
  Marquee (Stage 11 Agentics), ChartStead (Tyler), OpenSession (Malik), ProgramKit (andheller), Ajay
  K's `session.drawset.com`, SuperStage (Ali Zaid), and Bodhi's request. Eight have a name and/or
  deployed URL; Bodhi asked to join the list without sharing either source or deployment. Deployed
  sites were **not** fetched or probed — this survey reads code, and no code was available.

Discovery is recorded in [`discovery-log.md`](discovery-log.md). The survey was specified in
[`../handoff/alternative-designs-survey.md`](../handoff/alternative-designs-survey.md).

## Derived from this survey

The prose on this page is hand-written. The linked matrix, visual, comparative requirements, and
machine-readable rollup are generated from [`data/projects.json`](data/projects.json) and
[`data/features.json`](data/features.json) by `bun run alternatives:build` — do not hand-edit those
derived files, and rerun the build after changing the data. `bun run alternatives:check` fails CI
if a generated file is stale.

The public reading copy is at <https://cicero-field-survey.elehche.workers.dev/> and links back to
the companion submission at <https://cicero-submission.elehche.workers.dev/>.

| | |
|---|---|
| [`feature-matrix.md`](feature-matrix.md) | All 77 features × all 35 projects, unfiltered. |
| [`visual/index.html`](visual/index.html) | The same grid, browsable, with filtering and rollups. |
| [`../07-comparative-requirements.md`](../07-comparative-requirements.md) | `AD-1`…`AD-53` — what the field built that Cicero did not, and which of them Cicero has closed since. |
| [`data/survey.json`](data/survey.json) | Machine-readable rollup: counts, scale, stack, area totals. |

To add a project to the survey, use the `survey-alternative-designs` skill in
[`../../.agents/skills/`](../../.agents/skills/survey-alternative-designs/SKILL.md). It carries the
security constraints, the note template, and the data contract.

The 35 analyzed projects span 43–1,600 files (median ≈ 466), 1–5 contributors, and commit histories
that begin no earlier than 2026-08-08 — everyone built inside the same short window.

## Features others shipped that Cicero did not

**This is the list the survey exists to produce.** Consolidated across all 35 projects,
deduplicated, each attributed to the projects that have it. Ordered by how many independent teams
arrived at the same thing — convergence is the signal.

Everything here describes Cicero as it stood when the field was read on 2026-08-16 and in the
narrow 2026-08-17 refresh. **Seven of the 53 have been closed since**, and are marked in place below rather than deleted — the attribution and
the fact that the field arrived at the gap first are both worth keeping. `AD-4` is the one item the
survey mis-scored: `lib/services/content.ts` already recorded, listed, diffed and restored
revisions, and [#200](https://github.com/EllAchE/sessionboard-oss/pull/200) added the monotonic
revision number the item actually names.

| | | |
|---|---|---|
| `AD-1` | Whole-event cloning / reusable event templates | [#199](https://github.com/EllAchE/sessionboard-oss/pull/199) |
| `AD-2` | Speaker availability / blackout windows | [#194](https://github.com/EllAchE/sessionboard-oss/pull/194) |
| `AD-3` | Richer embed output formats | [#210](https://github.com/EllAchE/sessionboard-oss/pull/210) |
| `AD-4` | Revision history with organizer restore | [#200](https://github.com/EllAchE/sessionboard-oss/pull/200) |
| `AD-9` | Tokenized no-login share links | [#201](https://github.com/EllAchE/sessionboard-oss/pull/201) |
| `AD-11` | Per-event `llms.txt` | [#188](https://github.com/EllAchE/sessionboard-oss/pull/188) |
| `AD-37` | Mixed-type rubric criteria | [#212](https://github.com/EllAchE/sessionboard-oss/pull/212) |

The per-project notes in this directory are *not* rewritten when Cicero closes a gap. Each one is a
reading of one repository at one pinned commit, and a sentence like "Cicero's Airtable integration
is one-way" is a record of what was true on the day it was written. The table above and
[`../07-comparative-requirements.md`](../07-comparative-requirements.md) are the current-state
answer; the ranked pick-up order is [`../08-field-backlog.md`](../08-field-backlog.md).

### Shipped by many teams

1. **Whole-event cloning / reusable event templates.** Copy forms, tracks, rooms, scorecards, task
   and message templates, and optionally the team, into a new event. Several implementations preview
   the copy before applying, and deliberately exclude operational history.
   — `agrimsingh/conference-engine`, `jpoehnelt/session-party`, `maddiedreese/ProgramLoom`,
   `TheThingInTheThing/namos-sessions-webapp`, `adityak6798/ManageMyConference`,
   `DeanStr/programcue`
   **Closed since:** `lib/services/event-clone.ts` plans a structure-only clone and
   `app/organizer/duplicate/` previews it before applying
   ([#199](https://github.com/EllAchE/sessionboard-oss/pull/199)).

2. **Speaker availability / blackout windows as a scheduling constraint.** Collected during CFP or
   in the portal as dates, times, or dayparts, then surfaced as explicit conflicts against the
   agenda. Cicero detects room and speaker double-booking but has no concept of a speaker being
   unavailable at a time they were never scheduled.
   — `nayamoss/namos-sessions-public`, `TheThingInTheThing/namos-sessions-webapp`,
   `0xOsprey/saas-killa`, `yisding/openboard.events`
   **Closed since:** a `speaker_unavailability` window declared in the portal is enforced through
   the same agenda guard as double-booking
   ([#194](https://github.com/EllAchE/sessionboard-oss/pull/194)).

3. **Richer embed output formats.** JSON, XML, subscribable iCalendar, and script-loader snippets
   emitted from the same widget configuration, alongside the iframe. This confirms a gap we had
   already recorded against ourselves.
   — `mrmichael73/greenroom-kms` (script/iframe/JSON/XML/iCal), `d4mr/opensesh`,
   `iankar8/event-manager-os`, `westoque/session-hero`, `akakabrian/sessionslate` (XML program feed)
   **Closed since:** `app/embed/[slug]/[view]/[format]/route.ts` renders one widget configuration as
   `feed.json`, `feed.xml` and a subscribable `feed.ics`
   ([#210](https://github.com/EllAchE/sessionboard-oss/pull/210)).

4. **Revision history with organizer restore.** Attributed, numbered snapshots of proposal and
   session titles/abstracts that an organizer can roll back.
   — `conorbronsdon/callboard-app`, `westoque/session-hero`, `SteveMLC/lectern`,
   `realgenekim/curtain-call-cfp` (append-only whole-application history with time travel),
   `DeanStr/programcue`
   **Mis-scored, and closed since:** record → list → diff → restore already existed in
   `lib/services/content.ts`; the monotonic revision number and agenda/sponsor coverage landed in
   [#200](https://github.com/EllAchE/sessionboard-oss/pull/200).

5. **Bidirectional Airtable sync.** Cicero's Airtable integration is one-way. Others reconcile in
   both directions with field ownership, conflict handling, retries, and dead letters.
   — `openrostrum/openrostrum` (three-way reconciliation, signed webhooks, mass-deletion circuit
   breaker), `jpoehnelt/session-party`, `guangyusong/opencallboard` (delete-free confirmed diff),
   `SteveMLC/lectern` (ten-table mirror), `red/omotenashi` (Airtable as the system of record),
   `DeanStr/programcue` (Airtable can become the event's programme authority)

6. **Authentication beyond magic links.** Cicero is magic-link-only by design (`T-4a`); several
   teams read the brief as permitting passwords or social sign-in too.
   — `akakabrian/sessionslate` (Argon2id passwords), `twilwa/session-bored` (Better Auth passwords),
   `M31-Labs/rostrum` (WebAuthn passkeys + GitHub/Google OAuth), `adityak6798/ManageMyConference`
   (Google OAuth with PKCE and account linking), `mkly/gatherpulse` (optional TOTP 2FA with backup
   codes), `Frostbite1536/greenroom` (scrypt passwords), `DeanStr/programcue` (Google and Microsoft
   sign-in)

7. **Real-time collaborative agenda over Durable Objects + WebSockets.** A per-event Cloudflare
   Durable Object broadcasts committed schedule invalidations so several operators can drag the
   grid at once. Most implementations serialize commands in the object; Program Cue pairs
   optimistic D1 revisions with the realtime channel.
   — `agrimsingh/conference-engine`, `caseymanos/opensession`, `jpoehnelt/session-party`,
   `thedatadavis/seshmesh`, `DeanStr/programcue`

8. **In-product streaming AI assistant with tool use.** A chat surface inside the organizer app
   streams model output, invokes governed tools, persists threads, and requires approval before
   mutations. Several share that registry with MCP; Program Cue ships the governed in-product
   surface without an MCP endpoint. Cicero's AI is advisory-only and out-of-band.
   — `CampbellVentures/smolboard`, `getzenai/untitledconference`,
   `nayamoss/namos-sessions-public`, `Phantastic-AI/fireside`, `DeanStr/programcue`

9. **Tokenized no-login share links.** Expiring, revocable links that expose a proposal, deliverable,
   or report to someone without an account.
   — `iankar8/event-manager-os` (guest advisors with comments), `Phantastic-AI/fireside`
   (rotatable per-deliverable), `mkly/gatherpulse` (single-use file fulfillment),
   `adityak6798/ManageMyConference` (expiring report shares with scheduled delivery),
   `DeanStr/programcue` (read-only itinerary shares)
   **Closed since:** `lib/services/share-links.ts` issues expiring, revocable links over six
   programme views, so an unpublished programme can be reviewed without an account
   ([#201](https://github.com/EllAchE/sessionboard-oss/pull/201)).

12. **Accelevents integration** with preview/apply diffs against a real external event platform.
    — `iankar8/event-manager-os`, `jpoehnelt/session-party`, `DeanStr/programcue`

14. **Organization-level team administration** above the event — roles, invitations, per-event
    access grants, audit trail. Cicero scopes membership to the event.
    — `yisding/openboard.events`, `CampbellVentures/smolboard`,
    `adityak6798/ManageMyConference`, `DeanStr/programcue`

### Shipped by two teams

10. **OAuth 2.1 authorization server for MCP** — dynamic registration, PKCE, consent, discovery,
    refresh rotation. Cicero's MCP is token-scoped without an authorization-code flow.
    — `d4mr/opensesh`, `maddiedreese/ProgramLoom`

11. **Per-event `llms.txt`** generated from current public state, for AI agents reading the event.
    — `conorbronsdon/callboard-app`, `red/omotenashi`
    **Closed since:** `app/(public)/[slug]/llms.txt/route.ts`, alongside the site-level `app/llms.txt`
    ([#188](https://github.com/EllAchE/sessionboard-oss/pull/188)).

13. **Privacy export and erasure** — self-service data export and transactional deletion.
    — `caseymanos/opensession` (bounded JSON export by email), `yisding/openboard.events`
    (contact/org export, erasure, scheduled retention cleanup)

21. **Attendee-facing Q&A concierge.** A model-backed help surface grounded in public event facts.
    Fireside adds per-event budgets; Open Events scopes Orby to the current page and refuses claims
    about private state. — `Phantastic-AI/fireside`, `MoizIbnYousaf/open-events`

37. **Mixed-type rubric criteria** (numeric, single-select, and free text in one scorecard).
    — `akakabrian/sessionslate`, `DeanStr/programcue`
    **Closed since:** `scorecard_criterion.type` carries all three, and only numeric criteria feed
    the weighted average ([#212](https://github.com/EllAchE/sessionboard-oss/pull/212)).

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
49. **Direct Google and Microsoft calendar synchronization.** OAuth-connected participant calendars
    receive provider events that are refreshed and reconciled when the programme changes.
    — `DeanStr/programcue`
50. **Reviewer discussion threads attached to proposals.** Assigned reviewers and chairs can discuss
    one proposal inside the review workspace without crossing the round's authorization boundary.
    — `DeanStr/programcue`
51. **Conflict-aware agenda undo.** Place, move, and unassign operations return a one-use,
    revision-bound undo token and refuse reversal after an intervening schedule change.
    — `DeanStr/programcue`
52. **Immutable participant-retention completion.** Transactional redaction ends in a durable
    tombstone, and database triggers reject later writes that would reintroduce participant PII.
    — `DeanStr/programcue`
53. **AI-drafted organizer notes and speaker resource pages.** Model output becomes an editable
    suggestion, with no automatic persistence or publication. — `Frostbite1536/greenroom`

## Features Cicero shipped that others did not

Counted across the 35 analyzed projects — how many of them lack each thing.

| Cicero capability | Absent in |
|---|---|
| Embeddable venue/exhibitor-hall map (organizer PDF upload, public widget) | 35 of 35 |
| Sponsors / exhibitors with a publication-gated public wall | 32 of 35 |
| Consent-aware SMS (E.164 normalization, OTP verification, quiet hours) | 29 of 35 |
| Streamable-HTTP MCP server with role-scoped agent skills | 21 of 35 |
| Post-conference recording ingestion with publication gates | 19 of 35 |
| Signed outbound webhooks | 18 of 35 |
| Cross-event speaker CRM (segments, sourcing) | 17 of 35 |
| Versioned public REST API with a generated OpenAPI contract | 13 of 35 |
| Reversible CRM merges | 12 of 35 |

The exhibitor-hall map remains unique to Cicero in this field. Sponsors is the clearest baseline
differentiator: 28 of 35 projects have no sponsor entity at all, 3 have scaffolding only, and 4
shipped it. Nobody skipped CFP intake or agenda scheduling — those are the floor everyone cleared.

The seven gaps Cicero has closed since the survey are deliberately **not** promoted into this table.
The counts above come from a pass that checked every project for that capability; extras attribution
is positive-only, so "absent in 35 − convergence" would be an upper bound dressed up as a count.

Two caveats on reading this table. It measures presence, not quality, and it is a comparison against
35 hackathon-window projects, not against the commercial products in this space. And several Cicero
capabilities in it remain **unproven against paid third-party accounts** — outbound email
(`T-6`/`C-3`), SMS, and R2 storage have never been exercised end-to-end with live credentials. Those
rows say we built it, not that we watched it work.

## Comparison matrix

Projects down the side, feature areas across the top — with 35 projects, the brief's orientation
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
| [Frostbite1536/greenroom](Frostbite1536-greenroom.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| [DeanStr/programcue](DeanStr-programcue.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| [MoizIbnYousaf/open-events](MoizIbnYousaf-open-events.md) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |

Area totals across the 35:

| Area | ✓ | ~ | ✗ |
|---|---|---|---|
| CFP intake | 35 | 0 | 0 |
| Agenda / scheduling | 35 | 0 | 0 |
| Conflict detection | 34 | 1 | 0 |
| Speaker portal & tasks | 34 | 1 | 0 |
| Content deliverables | 34 | 1 | 0 |
| Public event pages | 33 | 2 | 0 |
| Embeddable widgets | 33 | 0 | 2 |
| Decisions & notifications | 32 | 3 | 0 |
| Review rounds & scoring | 31 | 4 | 0 |
| Anonymized review | 31 | 3 | 1 |
| Comms / templates | 30 | 5 | 0 |
| Public REST API | 23 | 5 | 7 |
| Speaker CRM | 20 | 7 | 8 |
| AI features | 17 | 8 | 10 |
| Sponsors | 4 | 3 | 28 |

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
