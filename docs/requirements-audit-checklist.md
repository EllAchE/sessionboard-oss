# Cicero requirements audit checklist

This checklist compares Cicero with the competition's [original brief](reference/source-brief.txt)
and the repository's [normalized requirements ledger](01-requirements.md). It is intended to remain
the scrollable source of truth for what is complete and what still needs work.

## Audit snapshot

- Audited source revision: `a52c87c20fd049fa56db0c6b6011fbc741d1309e` on `main`
- Audited at: 2026-08-12 23:26 EDT / 20:26 PT
- Live deployment checked: `https://cicero.lhar8771.workers.dev`
- Live routes returning HTTP 200: `/`, `/demo`, `/demo/agenda`, `/submit/demo/speak`, and
  `/api/v1/events/demo/agenda`
- Uncommitted changes and unmerged branches were not credited

| Priority | Complete | Partial | Outstanding | Excluded | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Required | 43 | 9 | 6 | — | 58 |
| Important | 21 | 5 | 1 | — | 27 |
| Optional / nice-to-have | 28 | 0 | 3 | — | 31 |
| Bonus | 3 | 1 | 1 | — | 5 |
| Explicitly excluded | — | — | — | 3 | 3 |
| **Total** | **95** | **15** | **11** | **3** | **124** |

Legend:

- `[x] COMPLETE` — the requirement is implemented on the audited revision.
- `[ ] PARTIAL` — useful implementation exists, but the stated requirement is not fully satisfied.
- `[ ] OUTSTANDING` — no sufficient implementation or external delivery evidence was found.
- `[x] EXCLUDED` — the original scope explicitly says not to build it.
- Priorities: `R` required, `I` important, `O` optional, `B` bonus, `X` excluded.

## Release-critical remainder

- [ ] Wire category/track-based reviewer routing (`F-3`, `V-5`).
- [ ] Complete CFP participant modeling and form targeting (`F-4`, `F-6`, `F-7`, `P-2`).
- [ ] Send acceptance and decline notices automatically (`C-2`).
- [ ] Configure real outbound transactional email on the deployed instance (`T-6`, affecting `C-3`).
- [ ] Add the remaining required speaker profile fields (`S-2`).
- [ ] Verify and complete the competition entry and deadline delivery (`D-1`, `D-4`).

## 1. Competition deliverables

- [ ] **D-1 · R · OUTSTANDING — Competition entry form.** No submission evidence is stored in the
  repository; verify externally.
- [x] **D-2 · R · COMPLETE — Public open-source repository.** The source is public at
  `EllAchE/sessionboard-oss`.
- [x] **D-3 · R · COMPLETE — Deployed, live, testable site.** All five sampled public and API routes
  returned HTTP 200 at the audit time.
- [ ] **D-4 · R · OUTSTANDING — Deliver by Wed Aug 12, 10:00 PM PT.** No competition-delivery evidence
  was found; verify externally before the deadline.
- [ ] **D-5 · O · OUTSTANDING — Token-spend receipts.** No receipts were found; this is external to
  the product.

## 2. Event configuration

- [ ] **E-1 · R · PARTIAL — Create an event with name, slug, start, end, and timezone.** Event creation
  has all concepts, but start and end are optional date-only fields rather than required timestamps.
- [ ] **E-2 · I · PARTIAL — Optional event metadata.** Website, venue, and description columns exist,
  but the create/settings UI does not expose them; Event Type and Theme are absent.
- [ ] **E-3 · I · OUTSTANDING — Event logo and banner uploads.** A logo column exists, but there is no
  event-branding upload surface and no banner model.
- [x] **E-4 · R · COMPLETE — Event-scoped tracks, rooms, tags, and formats.** All four collections are
  configurable; tags are multi-select while track, format, level, and room are single-select.
- [x] **E-5 · O · COMPLETE — Personas and custom field library.** Both are available in settings.
- [x] **E-6 · O · COMPLETE — Multi-event support and event switcher.** Data is event-scoped and users
  can create and switch events.
- [ ] **E-7 · O · OUTSTANDING — Exhibitor / sponsor entities.** No such entity model or organizer
  surface exists on `main`.
- [x] **E-8 · X · EXCLUDED — Event-team permission grid.** Explicitly outside the requested scope.

## 3. Call-for-speakers forms

- [x] **F-1 · R · COMPLETE — Organizer form builder and multiple forms per event.** CFP and portal
  forms can be created independently.
- [x] **F-2 · R · COMPLETE — Conditional question logic.** Earlier answers can control later field
  visibility, with publish-time validation.
- [ ] **F-3 · R · OUTSTANDING — Category-based reviewer routing.** Tracks can be filtered and
  reviewers can be assigned, but no track/category-to-reviewer routing model exists.
- [ ] **F-4 · R · OUTSTANDING — Abstract/session target and participant toggle.** Form kinds are CFP
  and portal; the required targets and participants-on/off setting do not exist.
- [ ] **F-5 · R · PARTIAL — Complete abstract field set and constraints.** Six locked fields are
  reorderable and can be required, but the exact 255/5,000 limits and required defaults do not match
  the specification.
- [ ] **F-6 · R · PARTIAL — Complete participant field set.** Cold submission captures display name
  and email, but lacks locked first/last name, mobile phone, and dedicated participant biography.
- [ ] **F-7 · R · OUTSTANDING — Participant roles and count limits.** There is no per-form role
  configuration, role minimum/maximum, or overall participant cap.
- [x] **F-8 · R · COMPLETE — Custom field types and character limits.** Text, rich text/Markdown,
  selection, file, and other types are supported with field limits.
- [ ] **F-9 · I · PARTIAL — Welcome-screen configuration.** Internal name and welcome copy exist;
  separate external title, 15-character heading, and visibility toggle do not.
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
- [ ] **P-2 · R · PARTIAL — Welcome → Account → Submission → Participant → Review flow.** The flow is
  multi-step, but Welcome and Participant are not distinct stages.
- [x] **P-3 · R · COMPLETE — Account creation in the flow.** A cold submitter leaves with an account
  and participant record.
- [x] **P-4 · R · COMPLETE — Mobile-friendly CFP.** Responsive form styling is present.
- [x] **P-5 · I · COMPLETE — Deadline and remaining-count banner.** Both values are displayed.
- [x] **P-6 · I · COMPLETE — Save draft and resume later.** Draft persistence and resume are supported.
- [x] **P-7 · I · COMPLETE — Review before final submit.** The final confirmation step is implemented.

## 5. Speaker portal

- [x] **S-1 · R · COMPLETE — Authenticated Home, Submissions, Profile, and Tasks tabs.** All specified
  portal surfaces exist.
- [ ] **S-2 · R · PARTIAL — Self-edited bio and profile fields.** Biography and pronouns exist;
  Salutation, Honorific, and Gender are absent.
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
- [x] **S-11 · O · COMPLETE — Portal appearance settings.** Logo, accent, welcome copy, and support
  email can be configured.
- [x] **S-12 · O · COMPLETE — Multiple portal types.** Contact, group, and submission views exist.
- [x] **S-13 · O · COMPLETE — Group access sharing.** Co-speaker/group access is supported.

### Tasks and file collection

- [x] **S-14 · R · COMPLETE — Organizer tasks for accepted speakers.** Tasks can target accepted or
  manually selected speakers.
- [x] **S-15 · R · COMPLETE — Shared task-completion state.** Speakers and organizers see progress.
- [ ] **S-16 · I · PARTIAL — Per-contact, per-group, and per-submission task scope.** Contact/manual
  assignment and accepted-submission links exist, but explicit group and submission scoping are not
  configurable.
- [ ] **S-17 · I · PARTIAL — Portal form tasks for contacts, groups, and submissions.** Portal forms
  satisfy tasks, but the form itself does not expose those three explicit target types.
- [x] **S-18 · I · COMPLETE — Named file requests.** Files are collected and versioned against a
  request/task assignment.
- [x] **S-19 · O · COMPLETE — Portal-form confirmation email.** Completion sends configurable copy
  with a portal return link.
- [x] **S-20 · O · COMPLETE — Copy tasks from a previous event.** Organizer UI and service exist.

## 6. Review, scoring, and evaluation

- [ ] **V-1 · R · PARTIAL — Exact submission status tabs.** All, Pending, Accepted, Waitlist,
  Declined, Withdrawn, and Draft exist; Accept Queue and Decline Queue do not.
- [x] **V-2 · R · COMPLETE — Inline accept/decline.** Inline and bulk decision actions are available.
- [x] **V-3 · R · COMPLETE — Named reviewer scoring.** Reviewer identities, assignments, weighted
  criteria, and scorecards exist.
- [x] **V-4 · R · COMPLETE — Multiple review rounds.** Rounds have dates, modes, criteria, and status.
- [ ] **V-5 · R · PARTIAL — Evaluation plans.** Criteria, invitation, balanced distribution, and
  per-submission assignment exist; category-driven routing does not.
- [ ] **V-6 · I · PARTIAL — Configurable columns, sort, filter, and saved views.** Sort and filters are
  surfaced; saved-view services lack UI and queue columns remain fixed.
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
- [ ] **C-2 · R · PARTIAL — All required triggered sends.** Confirmation, task reminders, and draft
  reminders are wired; accept/decline templates exist but the decision action does not invoke them.
- [ ] **C-3 · R · PARTIAL — Calendar invites delivered to speakers' calendars.** Correct ICS request,
  update, and cancellation behavior is implemented, but the deployed instance does not send outbound
  email.
- [x] **C-3a · R · COMPLETE — Add-to-calendar link.** Portal sessions expose an ICS download.
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
  customer account is recorded.
- [x] **N-2 · O · COMPLETE — Additional integration.** A one-way Airtable mirror is implemented.

## 12. Platform and non-functional requirements

- [x] **T-1 · R · COMPLETE — Open-source license.** The repository contains an MIT license.
- [x] **T-2 · R · COMPLETE — Publicly reachable deployment.** All five sampled routes returned 200.
- [x] **T-3 · R · COMPLETE — Self-hostable.** Docker Compose starts the app, Postgres, and object
  storage with documented setup.
- [x] **T-4 · R · COMPLETE — Organizer and speaker roles.** Organizer, reviewer, and speaker roles are
  distinct.
- [x] **T-4a · R · COMPLETE — Magic-link auth for every role.** Signed, short-lived, single-use links
  are exchanged for sessions; there are no passwords.
- [x] **T-4b · I · COMPLETE — Long-lived speaker sessions.** Sessions last 30 days.
- [x] **T-5 · R · COMPLETE — Headshot, slide, and document storage.** Database and S3-compatible
  backends are supported.
- [ ] **T-6 · R · OUTSTANDING — Outbound transactional email on the deployed instance.** The demo
  deliberately sets `MAIL_TRANSPORT=log`, so mail is recorded but not externally delivered.
- [x] **T-7 · I · COMPLETE — Seedable demo event.** Idempotent demo conferences can be loaded.
- [x] **T-7a · R · COMPLETE — Demo magic links without an inbox.** Links appear on screen and in the
  admin mailbox when log transport is active.
- [x] **T-8 · I · COMPLETE — Self-host setup documentation.** README, architecture, decision, API, and
  event-management instructions are present.

## 13. Bonus criteria

- [x] **Z-1 · B · COMPLETE — Cloudflare deployment.** Workers configuration and deployment tooling
  are present, and the audited deployment is reachable.
- [x] **Z-2 · B · COMPLETE — Airtable persistence.** Speakers, submissions, and agenda data can be
  mirrored one-way into a configured Airtable base.
- [ ] **Z-3 · B · OUTSTANDING — Forge hosting.** Source is hosted on GitHub rather than Forge.
- [ ] **Z-4 · B · PARTIAL — Speed and performance.** The five-route health check passes and the latest
  revision removes a publish-day fan-out crash, but the README still documents free-plan Worker CPU
  failures and no representative load benchmark proves the bonus.
- [x] **Z-5 · B · COMPLETE — Public API.** Versioned REST routes, API-key auth, and generated OpenAPI
  documentation exist.

## Verification evidence

- Source inspection covered the form contract, schemas, services, route inventory, organizer and
  public UI, deployment configuration, and tests.
- `bun run test`: 35 test files and 381 tests passed.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun run build`: production build passed.
- The live health check returned HTTP 200 for all five sampled paths at the audit time.
- Real outbound mail and a real Accelevents account were not available, so `T-6` and `N-1c` remain
  unchecked rather than inferred from interfaces or mocks.
