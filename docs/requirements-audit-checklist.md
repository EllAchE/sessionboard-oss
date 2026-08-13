# Cicero requirements audit checklist

This checklist compares Cicero with the competition's [original brief](reference/source-brief.txt)
and the repository's [normalized requirements ledger](01-requirements.md). It is intended to remain
the scrollable source of truth for what is complete and what still needs work.

## Audit snapshot

- Audited source revision: `416101e` on `main`
- Audited at: 2026-08-13 11:00 EDT / 08:00 PT
- Previous audit: `a52c87c20fd049fa56db0c6b6011fbc741d1309e`, 2026-08-12 23:26 EDT. Every row below
  was re-checked against source at `58d4c94` rather than carried forward; the rows that moved after
  that revision (`F-9`, `S-11`, `S-17`, `V-1`) were each re-checked again as they landed.
- What was checked this run: schema and all thirteen migrations, service layer, organizer and speaker
  UI, the public CFP flow, the `/api/v1` contract and generated OpenAPI, mail transports and ICS
  generation, `wrangler.jsonc`, and the full test suite.
- **The live deployment URL was corrected and re-verified on 2026-08-13.** Cloudflare reports the
  account subdomain as `elehche`, not `lhar8771`; the Worker is live at
  `cicero.elehche.workers.dev`. The home page, seeded demo agenda, and OpenAPI return HTTP 200. The
  First Settlement routes remain unseeded and return 404, as the demo runbook records.
- Uncommitted changes and unmerged branches were not credited.

| Priority | Complete | Partial | Outstanding | Excluded | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Required | 54 | 2 | 2 | — | 58 |
| Important | 27 | 0 | 0 | — | 27 |
| Optional / nice-to-have | 29 | 0 | 2 | — | 31 |
| Bonus | 3 | 1 | 1 | — | 5 |
| Explicitly excluded | — | — | — | 3 | 3 |
| **Total** | **113** | **3** | **5** | **3** | **124** |

Counted from the rows below, not estimated. The three remaining PARTIAL rows are `T-6` and `C-3`
(one deployment switch, see the next section) and the `Z-4` bonus.

Legend:

- `[x] COMPLETE` — the requirement is implemented on the audited revision.
- `[ ] PARTIAL` — useful implementation exists, but the stated requirement is not fully satisfied.
- `[ ] OUTSTANDING` — no sufficient implementation or external delivery evidence was found.
- `[x] EXCLUDED` — the original scope explicitly says not to build it.
- Priorities: `R` required, `I` important, `O` optional, `B` bonus, `X` excluded.

## Release-critical remainder

Four REQUIRED rows are not COMPLETE. Two are external to the repository and two are the same
deployment switch.

- [ ] Configure real outbound transactional email on the deployed instance (`T-6`). The code is
  finished; what is missing is a verified Resend sender domain, a `RESEND_API_KEY` secret on the
  Worker, and a `MAIL_FROM` that is not Resend's shared test sender.
- [ ] `C-3` clears the moment `T-6` does — the ICS itself is correct and tested, but nothing leaves
  the deployed instance today, so no invite lands on a speaker's calendar.
- [ ] Verify the competition entry and its delivery (`D-1`, `D-4`). Neither can be closed from
  inside the repository.

Nothing else at REQUIRED priority is outstanding, and the remaining gaps are the bonus rows
`Z-3`/`Z-4`. `F-9` closed when its starred fields became genuinely required; `S-11` closed when the
portal appearance settings gained a writer, having been credited to a read path that no organizer
surface ever fed; `S-17` closed on re-examination rather than on new code — see its row for why the
contact/group/submission triple belongs to `task.scope` and not to the form.

## 1. Competition deliverables

- [ ] **D-1 · R · OUTSTANDING — Competition entry form.** No submission evidence is stored in the
  repository; verify externally.
- [x] **D-2 · R · COMPLETE — Public open-source repository.** The source is public at
  `EllAchE/sessionboard-oss`.
- [x] **D-3 · R · COMPLETE — Deployed, live, testable site.** Workers deployment and configuration
  are present. Re-verified on 2026-08-13 at the corrected hostname: the home page and public demo
  agenda both return HTTP 200.
- [ ] **D-4 · R · OUTSTANDING — Deliver by Wed Aug 12, 10:00 PM PT.** The stated deadline has passed
  as of this audit. The submission window is reported to still be open; that report is recorded here
  as a fact and not interpreted. No competition-delivery evidence is stored in the repository.
- [ ] **D-5 · O · OUTSTANDING — Token-spend receipts.** No receipts were found; this is external to
  the product.

## 2. Event configuration

- [x] **E-1 · R · COMPLETE — Create an event with name, slug, start, end, and timezone.** `startsAt`
  and `endsAt` are `NOT NULL` timestamps with timezone, added by migration `0007` with a real
  backfill that derives instants from the old date-only columns before setting `NOT NULL`. Both the
  create form and event settings take wall-clock date *and* time, and a date-only value is rejected.
  `startsOn`/`endsOn` survive only as a derived projection.
- [x] **E-2 · I · COMPLETE — Optional event metadata.** Event type, website URL (scheme-restricted to
  http/https), venue and address, and a long-text theme all have columns, validation, and writers in
  event settings. Theme and venue address are settings-only rather than also on the create form.
- [x] **E-3 · I · COMPLETE — Event logo and banner uploads.** Both slots exist with size guidance
  matching the brief (~300×300, ~1500×500), an upload/replace/remove surface in settings, a
  branding-scoped serve route that refuses any file that is not a current branding slot, and public
  rendering on the event page, chrome, and embeds.
- [x] **E-4 · R · COMPLETE — Event-scoped tracks, rooms, tags, and formats.** All four collections are
  configurable; tags are multi-select while track, format, level, and room are single-select.
- [x] **E-5 · O · COMPLETE — Personas and custom field library.** Both are available in settings.
- [x] **E-6 · O · COMPLETE — Multi-event support and event switcher.** Data is event-scoped and users
  can create and switch events.
- [x] **E-7 · O · COMPLETE — Exhibitor / sponsor entities.** Migration `0011` adds a `sponsor` table
  with a `sponsor_kind` enum of `sponsor`/`exhibitor`, and organizer CRUD is complete: list, create,
  edit, remove, drag reorder, logo upload and serve, all capability-gated. The public wall at
  `/{slug}/sponsors` groups both kinds by tier in the organizer's order, behind a nav tab that only
  appears for events that have rows, and serves logos from an unauthenticated route that proves
  access structurally — the file id must currently occupy a sponsor logo slot on that event. There is
  still no embed widget or `/api/v1` exposure, and **a sponsor row has no published column**, so it
  is public as soon as it is saved; both are recorded under [Follow-ups](#follow-ups).
- [x] **E-8 · X · EXCLUDED — Event-team permission grid.** Explicitly outside the requested scope.

## 3. Call-for-speakers forms

- [x] **F-1 · R · COMPLETE — Organizer form builder and multiple forms per event.** CFP and portal
  forms can be created independently.
- [x] **F-2 · R · COMPLETE — Conditional question logic.** Earlier answers can control later field
  visibility, with publish-time validation.
- [x] **F-3 · R · COMPLETE — Category-based reviewer routing.** Migration `0009` adds a single
  `track_reviewer` table, and both halves read it: the assignment planner routes a submission by its
  track, and an uncovered or absent track is reported rather than silently assigned to the whole
  pool. Organizers configure the mapping from a track-routing panel that also surfaces coverage gaps.
  Routing is applied when auto-assign runs on a round, not at the instant of submission.
- [x] **F-4 · R · COMPLETE — Abstract/session target and participant toggle.** Migration `0008` adds
  a `form_target_type` enum (`abstract`/`session`) and a `collects_participants` flag, both exposed
  in the builder. Turning participants off removes the participant stage from the public flow, and
  the API rejects participants on a form that does not collect them.
- [x] **F-5 · R · COMPLETE — Complete abstract field set and constraints.** The six built-ins carry
  the brief's exact constraints — Title 255, Description 5,000 markdown, Format/Track/Tags required,
  Level optional — as shared constants that are written onto the rows, enforced at submit time, and
  clamped if an organizer tries to raise them. Fields remain drag-reorderable with an independent
  required toggle.
- [x] **F-6 · R · COMPLETE — Complete participant field set.** First name, last name, and email are
  locked-required; mobile phone and a 5,000-character markdown biography are toggleable. `user.name`
  is split into `first_name`/`last_name` (migration `0008`, backfilled) and `name` is kept as the
  derived join every other surface renders, recomputed on each write.
- [x] **F-7 · R · COMPLETE — Participant roles and count limits.** `form_participant_role` carries
  per-role min/max with a unique key per form, and `form.max_participants` is the overall cap. The
  builder configures all three, satisfiability is checked at config time and on publish, and one
  shared validator enforces the counts across the public flow, the API, and the portal share path.
- [x] **F-8 · R · COMPLETE — Custom field types and character limits.** Text, rich text/Markdown,
  selection, file, and other types are supported with field limits.
- [x] **F-9 · I · COMPLETE — Welcome-screen configuration.** All four pieces exist — internal name,
  external form title, page heading with the 15-character cap genuinely enforced server-side, and a
  show/hide toggle that drops the welcome stage end to end — and the brief's asterisks are now real.
  One shared rule (`welcomeScreenErrors`) greys out Save in the builder, refuses an `updateForm`
  patch that blanks either starred field, and refuses to open a `cfp` form missing either. `createForm`
  writes the external title from the internal name, so a new form is born satisfying the rule rather
  than failing its first publish; the split between save-time and publish-time is what keeps a form
  written before the rule editable in every other respect. Portal forms are out of scope by design —
  they render no welcome screen. The welcome message is a markdown textarea rather than a rich-text
  editor, consistent with the rest of the app.
- [x] **F-10 · I · COMPLETE — Close date.** The close date gates submission and drives draft reminders.
- [x] **F-11 · I · COMPLETE — Success page and portal redirect.** Final submission lands on a success
  page and redirects into the speaker portal.
- [x] **F-12 · I · COMPLETE — Submission confirmation email.** Confirmation is triggered with
  configurable subject and body copy.
- [x] **F-13 · O · COMPLETE — Per-submitter submission limit.** Configurable maximum is enforced.
- [x] **F-14 · O · COMPLETE — Multiple simultaneous drafts.** Draft creation and resume are supported.
- [x] **F-15 · O · COMPLETE — Cross-field character limits.** Shared limit groups and live counters
  are implemented.
- [x] **F-16 · O · COMPLETE — Admin new-submission notifications.** Configurable notification
  addresses are supported.
- [x] **F-17 · X · EXCLUDED — Payments and fees.** Explicitly marked not needed.

## 4. Public CFP

- [x] **P-1 · R · COMPLETE — Public unauthenticated URL per form.** Published forms have shareable
  public routes.
- [x] **P-2 · R · COMPLETE — Welcome → Account → Submission → Participant → Review flow.** Five
  distinct stages exist as a testable data model, not just as rendering. Stages drop only for a
  stated reason — welcome when hidden, account when already signed in, participant when the form
  does not collect them — and the "Step N of M" counter is derived from the surviving set.
- [x] **P-3 · R · COMPLETE — Account creation in the flow.** A cold submitter leaves with an account
  and participant record.
- [x] **P-4 · R · COMPLETE — Mobile-friendly CFP.** Responsive form styling is present.
- [x] **P-5 · I · COMPLETE — Deadline and remaining-count banner.** Both values are displayed.
- [x] **P-6 · I · COMPLETE — Save draft and resume later.** Draft persistence and resume are supported.
- [x] **P-7 · I · COMPLETE — Review before final submit.** The final confirmation step is implemented.

## 5. Speaker portal

- [x] **S-1 · R · COMPLETE — Authenticated Home, Submissions, Profile, and Tasks tabs.** All specified
  portal surfaces exist.
- [x] **S-2 · R · COMPLETE — Self-edited bio and profile fields.** Salutation, honorific, pronouns,
  and gender are columns (migration `0010`) with speaker-editable inputs in the portal profile form,
  alongside a 5,000-character biography with a live counter. All five are accepted and returned by
  the `/api/v1` profile contract.
- [x] **S-3 · R · COMPLETE — Headshot upload.** Speakers can upload and replace their headshot.
- [x] **S-4 · R · COMPLETE — Slides and supporting documents.** Versioned uploads are attached through
  submission/task assignments.
- [x] **S-5 · R · COMPLETE — My Submissions list.** Reference, title, format, and status are displayed.
- [x] **S-6 · R · COMPLETE — Organizer-authored resource/wiki pages.** Portal pages can be published.
- [x] **S-7 · R · COMPLETE — Raw HTML embeds in wiki pages.** Raw HTML is restricted to trusted
  organizer-authored content.
- [x] **S-8 · I · COMPLETE — Speaker social and website links.** The link collection covers LinkedIn,
  X, Facebook, and personal sites.
- [x] **S-9 · I · COMPLETE — View and edit submitted proposals.** Speakers have a post-submit editor.
- [x] **S-10 · R · COMPLETE — Full admin impersonation.** Organizers can act as a speaker, complete
  writes, and return to admin mode.
- [x] **S-11 · O · COMPLETE — Portal appearance settings.** *Was PARTIAL: `portal_theme` was read by
  the portal layout and the branded email wrapper but written by nothing except the seeds, so on any
  non-seeded event the settings did not exist.* Settings now carries a **Speaker portal** tab that
  writes all four columns — logo, accent colour, welcome markdown, and support email.
  `savePortalAppearance`/`setPortalLogo` in `lib/services/settings.ts` upsert on the unique
  `portal_theme.event_id`, so the first save on an event nobody seeded creates the row and a later
  one updates it without blanking the columns it was not asked about. The logo uploads through
  `/admin/settings/portal/upload` on the same `validateUpload`/`storeFile` path as `E-3` and `E-7`.
  The accent is validated to a literal hex, on the way in and again on the way out, because it is
  interpolated into a `style` attribute on the portal and into an inline style in email. An event
  with no row still renders: the masthead, the home screen and the footer each fall back to their
  own copy. Deliberately its own tab and not merged with the event logo and banner — that is `E-3`,
  a different table dressing the public pages for a different audience.
- [x] **S-12 · O · COMPLETE — Multiple portal types.** Contact, group, and submission views exist.
- [x] **S-13 · O · COMPLETE — Group access sharing.** Co-speaker/group access is supported.

### Tasks and file collection

- [x] **S-14 · R · COMPLETE — Organizer tasks for accepted speakers.** Tasks can target accepted or
  manually selected speakers.
- [x] **S-15 · R · COMPLETE — Shared task-completion state.** Speakers and organizers see progress.
- [x] **S-16 · I · COMPLETE — Per-contact, per-group, and per-submission task scope.** Migration
  `0010` adds a `task_scope` enum of exactly those three values, a pinned `submission_id`, partial
  unique indexes per scope, and a backfill. Assignment resolution branches per scope — one row per
  person, one per accepted session, or one per session team — reconciliation rewrites scope in place
  without destroying completed status, and the task editor exposes the choice.
- [x] **S-17 · I · COMPLETE — Portal form tasks for contacts, groups, and submissions.** Completing
  an organizer-built form satisfies a task, and the contact/group/submission triple is `task.scope`,
  chosen in the task editor beside the form picker. Re-examined on this run and closed rather than
  built out: the triple belongs to the attachment, not to the form. A portal form has no URL of its
  own and reaches a speaker only through a task, so *which* of the three it is for is not knowable
  when the form is authored — the same "Travel and logistics" form is per-contact at one event and
  per-session at the next, and a form-level target would make it single-use. A second declaration
  would also let a form and its task disagree, with no correct resolution: only a silent override, or
  an error class that exists because two columns answer one question. `form.target_type` stays
  `abstract`/`session`, which is `F-4`'s different question — what a submission becomes. The
  reasoning is recorded at both ends, on `FormTargetType` in `lib/services/forms.ts` and on `SCOPES`
  in `app/admin/tasks/TaskEditor.tsx`, so the next reader finds it where they look for the gap.
- [x] **S-18 · I · COMPLETE — Named file requests.** Files are collected and versioned against a
  request/task assignment.
- [x] **S-19 · O · COMPLETE — Portal-form confirmation email.** Completion sends configurable copy
  with a portal return link.
- [x] **S-20 · O · COMPLETE — Copy tasks from a previous event.** Organizer UI and service exist.

## 6. Review, scoring, and evaluation

- [x] **V-1 · R · COMPLETE — Exact submission status tabs.** All eight named tabs exist — All,
  Accepted, Accept Queue, Pending, Decline Queue, Declined, Withdrawn, Drafts — plus Waitlist. The
  two queues are **derived and staged**, in that order. By default a submission enters one once every
  assigned reviewer has answered and its average score falls above or below a fixed midpoint bar, so
  the queues fill without anyone curating them. On top of that an organizer stages by hand, and a
  hand stage wins over the average: `submission.staged_decision` holds `accept`, `decline` or `hold`,
  event-wide rather than per-user so a co-chair reads the same batch. Clearing it returns the row to
  the derived reading rather than to nothing; `hold` is how a row leaves a queue the average put it
  in. Pending is still the remainder, so the three tabs partition rather than overlap. Committing a
  queue decides every row it is showing and clears the staging as it goes.
- [x] **V-2 · R · COMPLETE — Inline accept/decline.** Inline and bulk decision actions are available.
- [x] **V-3 · R · COMPLETE — Named reviewer scoring.** Reviewer identities, assignments, weighted
  criteria, and scorecards exist.
- [x] **V-4 · R · COMPLETE — Multiple review rounds.** Rounds have dates, modes, criteria, and status.
- [x] **V-5 · R · COMPLETE — Evaluation plans.** The reviewer side reads the same `track_reviewer`
  table `F-3` writes: the queue's working set is the assignments the track-driven planner created,
  and the reviewer's covered tracks are read back from that table. Per-round criteria and scorecards
  are unchanged. One routing model, not two.
- [x] **V-6 · I · COMPLETE — Configurable columns, sort, filter, and saved views.** The queue now has
  a saved-views selector with save and delete, and a column chooser. A saved view captures tab,
  filters, sort, and column selection together. Outside a saved view the column choice persists in
  `localStorage` only, so it is per-browser rather than per-user.
- [x] **V-7 · I · COMPLETE — Manually add a submission.** Organizer entry supports details and
  participants.
- [x] **V-8 · I · COMPLETE — Export submissions to CSV/XLSX.** Selected review results can be exported
  as CSV with stable core and dynamic columns.
- [x] **V-9 · O · COMPLETE — AI-assisted review.** Advisory AI review exists with a deterministic
  fallback when no model key is configured.
- [x] **V-10 · O · COMPLETE — Bulk import sessions.** CSV preview and import are implemented.
- [x] **V-11 · O · COMPLETE — Bulk file download.** Submission files can be streamed as a ZIP archive.
- [x] **V-12 · O · COMPLETE — Reviewer workload reporting.** Assigned and completed progress is shown.

## 7. Agenda and scheduling

- [x] **A-1 · R · COMPLETE — Drag-and-drop scheduling.** Accepted sessions can be placed on the grid.
- [x] **A-2 · R · COMPLETE — Room and track conflict detection.** Conflicts are detected and have a
  dedicated view.
- [x] **A-3 · R · COMPLETE — List, Day, Week, Room, and Track views.** All specified views exist.
- [x] **A-4 · R · COMPLETE — Starts, ends, room, track, and capacity.** All scheduling fields exist.
- [x] **A-5 · I · COMPLETE — Unscheduled queue.** Accepted sessions without a slot remain visible.
- [x] **A-6 · I · COMPLETE — Draft versus published agenda.** Draft, published, and cancelled states
  are supported.
- [x] **A-7 · R · COMPLETE — Speaker double-booking detection.** Overlapping participant assignments
  are identified.
- [x] **A-8 · O · COMPLETE — AI agenda builder.** AI proposals and deterministic fallback are present.
- [x] **A-9 · O · COMPLETE — Month view, CEU credits, and Client ID.** All three extras exist.

## 8. Communications

- [x] **C-1 · R · COMPLETE — Editable email templates and merge fields.** Organizer template CRUD and
  merge rendering are implemented.
- [x] **C-2 · R · COMPLETE — All required triggered sends.** *Corrected from PARTIAL.* The decision
  action now sends notices: it notifies only rows that genuinely transitioned, skips a reset, and
  isolates failures per recipient, with acceptance, decline, and a new waitlist template all mapped.
  Confirmation, organizer notification, calendar invite and cancellation, task reminders, and
  draft-deadline reminders are all wired and tested. One deployment caveat: the two *scheduled*
  senders run through the cron job route, and `wrangler.jsonc` declares no `triggers`/`crons` block,
  so on the deployed instance reminders fire only when that route is called or an organizer presses
  the button. Everything else is event-driven and unaffected.
- [ ] **C-3 · R · PARTIAL — Calendar invites delivered to speakers' calendars.** The ICS itself is now
  fully correct and pinned by golden-byte tests: `METHOD:REQUEST` with real organizer and attendees,
  a stable UID with a `SEQUENCE` that increments only when an invite was already sent, RFC 5545
  escaping and 75-octet folding, and — the recent fix — a MIME `method=` parameter re-read from the
  body so a `METHOD:CANCEL` is not mislabelled on either the Resend or SMTP transport. It stays
  PARTIAL for one reason: delivery depends on `T-6`, and under the deployed log transport the ICS is
  stored in the mail log rather than landing on anyone's calendar.
- [x] **C-3a · R · COMPLETE — Add-to-calendar link.** Portal sessions expose an ICS download using
  `METHOD:PUBLISH` with no attendees, which is the correct shape for a download.
- [x] **C-4 · R · COMPLETE — Manual send to filtered audiences.** Organizer composition supports
  relevant participant, submission, session, and task audiences.
- [x] **C-5 · I · COMPLETE — Send log.** Per-recipient status, timestamps, and content are retained.
- [x] **C-6 · O · COMPLETE — Branded email layout.** Event branding wraps rendered messages.
- [x] **C-7 · O · COMPLETE — Reminder cadence per task.** Reminder-day offsets are configurable.

## 9. Dashboard

- [x] **B-1 · R · COMPLETE — Accepted speakers with outstanding tasks.** The dashboard leads with the
  required live task report.
- [x] **B-2 · I · COMPLETE — Submission and speaker counters.** Status breakdowns are included.
- [x] **B-3 · I · COMPLETE — Actionable organizer nudges.** Schedule, profile, and task gaps link to
  their corrective surfaces.
- [x] **B-4 · O · COMPLETE — Five prebuilt dashboards.** Event Overview, Submissions Pipeline,
  Speaker Tracking, Review Progress, and Schedule Health exist.
- [x] **B-5 · O · COMPLETE — Custom dashboard builder.** Organizers can create boards and add widgets.
- [x] **B-6 · O · COMPLETE — Submission pacing comparison.** Current and prior event series are shown.
- [x] **B-7 · O · COMPLETE — Breakdowns by form and track.** Both dimensions are available.
- [x] **B-8 · O · COMPLETE — Reports.** Operational CSV reports can be downloaded.
- [x] **B-9 · X · EXCLUDED — AI dashboard generation.** Explicitly outside the requested scope.

## 10. Publishing and embeds

- [x] **G-1 · R · COMPLETE — Mobile-friendly speaker gallery embed.** A responsive gallery widget and
  public route exist.
- [x] **G-2 · R · COMPLETE — Mobile-friendly itinerary embed.** A responsive itinerary widget exists.
- [x] **G-3 · R · COMPLETE — Auto-updating embeds.** Snippets point at live server-rendered routes.
- [x] **G-4 · I · COMPLETE — Public sessions and speakers lists.** Both are accessible without auth.
- [x] **G-5 · I · COMPLETE — Copyable embed snippet.** Script and iframe forms are generated.
- [x] **G-6 · O · COMPLETE — Named embed configuration and preview.** Enable state and desktop/mobile
  preview are included.
- [x] **G-7 · O · COMPLETE — Filters, field selection, and styles.** Track, room, field, column, color,
  and theme controls exist.
- [x] **G-8 · O · COMPLETE — Speaker deep links.** `sb-speaker-id` is supported by the host and embed.

## 11. Integrations

- [x] **N-1 · R · COMPLETE — One-way Accelevents sync.** Organizers can push accepted speakers into
  an Accelevents event.
- [x] **N-1a · R · COMPLETE — Real mapped/authenticated client.** The client uses the documented
  `POST /rest/events/{eventId}/speaker` contract, field mapping, auth, and error handling.
- [x] **N-1b · R · COMPLETE — Interface and fixture-backed fake.** Tests and demo mode exercise the
  same contract without credentials.
- [ ] **N-1c · O · OUTSTANDING — Live Accelevents end-to-end run.** No successful run against a real
  customer account is recorded. External; nothing in the repository can close it.
- [x] **N-2 · O · COMPLETE — Additional integration.** A one-way Airtable mirror is implemented.

## 12. Platform and non-functional requirements

- [x] **T-1 · R · COMPLETE — Open-source license.** The repository contains an MIT license.
- [x] **T-2 · R · COMPLETE — Publicly reachable deployment.** Deployment configuration is present and
  the routes were reachable at the previous audit. As with `D-3`, this was **not** re-verified on
  this run because the audit host cannot resolve the Workers hostname.
- [x] **T-3 · R · COMPLETE — Self-hostable.** Docker Compose starts the app, Postgres, and object
  storage with documented setup.
- [x] **T-4 · R · COMPLETE — Organizer and speaker roles.** Organizer, reviewer, and speaker roles are
  distinct.
- [x] **T-4a · R · COMPLETE — Magic-link auth for every role.** No password column or check exists
  anywhere. Tokens are stored only as a hash, expire in 30 minutes, are single-use on redemption, and
  are exchanged for a 30-day httpOnly session cookie. The recent per-recipient transport work altered
  only *where a link may be displayed*, not minting, expiry, or single use.
- [x] **T-4b · I · COMPLETE — Long-lived speaker sessions.** Sessions last 30 days.
- [x] **T-5 · R · COMPLETE — Headshot, slide, and document storage.** Database and S3-compatible
  backends are supported.
- [ ] **T-6 · R · PARTIAL — Outbound transactional email on the deployed instance.** *Upgraded from
  OUTSTANDING; the code is done, the deployment is not.* Three transports exist — log, SMTP with a
  full set of configuration variables for self-hosting, and Resend over HTTP for Workers — behind an
  `auto` resolver that degrades to log and warns rather than failing silently. `wrangler.jsonc`
  deliberately stays on a safe default: `MAIL_TRANSPORT: "auto"` with no `RESEND_API_KEY` secret and
  `MAIL_FROM` set to Resend's shared `onboarding@resend.dev` test sender, which delivers only to the
  Resend account owner. So the deployed instance resolves to log and delivers nothing externally.
  Closing this needs a verified sender domain, one `wrangler secret put RESEND_API_KEY`, and a
  matching `MAIL_FROM` — no code change.
- [x] **T-7 · I · COMPLETE — Seedable demo event.** Idempotent demo conferences can be loaded.
- [x] **T-7a · R · COMPLETE — Demo magic links without an inbox.** Mail routing is now **per
  recipient**: an address at a reserved TLD or domain (`test`, `example`, `invalid`, `localhost`,
  `example.com/.net/.org`) is forced onto the log transport inside the same run that delivers real
  mail to real addresses, so enabling a provider does not take the demo offline. On-screen links are
  gated by a single predicate requiring all of an explicit deployment flag, a reserved domain, an
  existing seeded demo membership, and no non-demo membership. **A failed send no longer qualifies**
  — the sign-in path's `!delivered` reveal was removed and the reasoning is stated in the code. One
  instance of the same pattern survives elsewhere; see [Follow-ups](#follow-ups).
- [x] **T-8 · I · COMPLETE — Self-host setup documentation.** README, architecture, decision, API, and
  event-management instructions are present.

## 13. Bonus criteria

- [x] **Z-1 · B · COMPLETE — Cloudflare deployment.** Workers configuration and deployment tooling
  are present.
- [x] **Z-2 · B · COMPLETE — Airtable persistence.** Speakers, submissions, and agenda data can be
  mirrored one-way into a configured Airtable base.
- [ ] **Z-3 · B · OUTSTANDING — Forge hosting.** Source is hosted on GitHub rather than Forge.
  External; nothing in the repository can close it.
- [ ] **Z-4 · B · PARTIAL — Speed and performance.** A real benchmark now exists — `bun run bench`,
  with captured numbers in [`performance-benchmark.md`](performance-benchmark.md) — and it
  **confirms the concern rather than clearing it**. Across 7,000 requests the self-hosted target was
  fast and returned zero errors, but the server-rendered public pages cost **29–46ms of CPU each**
  against the Workers free plan's **10ms** ceiling, three to four times over on the most favourable
  reading; the JSON API at ~8ms is the exception, which matches the observation that the API
  health-check passes while navigation intermittently 503s. The deployed Worker itself could not be
  reached from the benchmarking host and remains unmeasured. Measuring a problem is progress, but a
  bonus for speed is not earned by a number that says the public pages exceed the plan's budget.
- [x] **Z-5 · B · COMPLETE — Public API.** Versioned REST routes, API-key auth, and generated OpenAPI
  documentation exist.

## Follow-ups

Discovered during this audit. None of these blocks a row above on its own, and none is a
requirement the brief states — they are recorded here so they are not lost.

**Security — highest priority of this list.** The reviewer-invite server action still returns the
raw magic link to the organizer's UI when a send *fails*
(`app/admin/submissions/rounds/actions.ts`, `activeTransportName() === 'log' || !invited.delivered`).
This is the same class of bypass that was deliberately removed from the sign-in path, on a surface
the removal did not touch. It is latent today because the deployed instance is on the log transport,
but it becomes live the moment `T-6` is switched on — and with the current shared test sender,
Resend rejects every non-owner recipient, so `delivered` would be `false` for *every* invite. The
invite path creates an account for an arbitrary typed address, so the leaked link is a session as
that address. **Not fixed here — this audit owns `docs/` only.**

- **`V-1` staging bar is still fixed.** Hand staging exists now — `submission.staged_decision`, and
  it beats the score — so an organizer can put any undecided proposal in either queue, hold one out,
  and commit the batch. What is still hardcoded is the *bar*: the derived reading uses the midpoint
  of the 1–5 scale, and an organizer cannot tune it per event. Everything staged by hand routes
  around that, so it is a convenience gap rather than a capability one.
- **Per-session task reminders may be chattier than intended.** Reminders iterate per *assignment*,
  and a submission-scoped task (`S-16`) creates one assignment per accepted session. A speaker with
  three accepted sessions receives three reminder emails for one task. Correct by the data model,
  probably not what an organizer expects.
- **No `published` column on `sponsor` (`E-7`).** The public wall now exists, and every other public
  surface in the app is gated by an explicit state column — `scheduled_session.status`,
  `submission.content_status`, `participant.workflow_status`. A sponsor row has none, so saving one
  publishes it, and an organizer who wants to stage a wall before an announcement cannot. The admin
  page says so before they type, which is the honest interim answer, not a substitute for the column.
  Adding it is a migration plus a filter in `listPublicSponsors`, the same filter in
  `eventHasSponsors` and `isPublicSponsorLogo` so an unpublished sponsor's logo stops being servable,
  and a toggle on the board.
- **No sponsor embed widget or `/api/v1` exposure (`E-7`).** The wall is a microsite page only.
  `app/embed/**` has no sponsor view, so a sponsor block cannot be iframed onto an organizer's own
  site the way the agenda and speaker directory can.
- ~~**`S-17` form-builder target.**~~ Withdrawn. Declaring the contact/group/submission triple on the
  form as well as on the task would make a reusable form single-use and create a disagreement with no
  correct resolution. See the `S-17` row.
- **No `crons` trigger in `wrangler.jsonc`.** Task reminders and draft-deadline reminders are
  implemented and correct but are only dispatched by an external call to the cron route or an
  organizer pressing the button. A scheduled trigger would make them autonomous on the deployment.
- **`F-5` caps are not backfilled onto pre-`0008` rows.** Migration `0008` inserts *missing* fields
  but does not write the 255/5,000 limits onto title and description rows that already existed, so an
  upgraded database keeps `max_length = NULL` on those two until an organizer edits the field. New
  forms are correct.
- **`F-4` participants toggle on a live form.** Turning `collectsParticipants` on for an already
  published form does not seed the default roles, producing a participant stage where nobody can be
  added until the form is republished.

## Verification evidence

- Source inspection covered the schema and all eleven migrations, the service layer, organizer and
  speaker UI, the public CFP flow, the `/api/v1` contract and generated OpenAPI, mail transports and
  ICS generation, deployment configuration, and tests.
- `bun run test`: **75 test files, 825 tests, all passed** (up from 35 files / 381 tests at the
  previous audit).
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun run build`: production build passed.
- `bun run bench`: not re-run for this audit; the captured numbers in
  [`performance-benchmark.md`](performance-benchmark.md) are read as evidence for `Z-4` rather than
  reproduced.
- **The live deployment was health-checked again on 2026-08-13.** The corrected hostname resolves,
  and the home page, public demo agenda, and generated OpenAPI return HTTP 200. The Roman demo is
  still not seeded in production and its sampled public routes return 404.
- Real outbound mail and a real Accelevents account were not available, so `T-6` and `N-1c` remain
  judged on configuration and code rather than inferred from interfaces or mocks.
