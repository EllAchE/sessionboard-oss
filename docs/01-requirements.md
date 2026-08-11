# Requirements

Full requirement and deliverable list, derived **only** from the competition brief and its 42
embedded screenshots. Every line is tagged. Nothing here is invented — where the brief is silent,
the item appears under [Open questions](#open-questions-for-review) instead of being guessed at.

Goals and context: [`00-goals.md`](00-goals.md). Source: [`reference/source-brief.txt`](reference/source-brief.txt).

---

## How to read the tags

| Tag | Meaning | Where it comes from |
| --- | --- | --- |
| **[REQUIRED]** | Ship it or the entry is incomplete | One of the brief's 9 numbered features, or annotated "must have" in a screenshot |
| **[IMPORTANT]** | Not in the numbered 9, but the author flagged it | Red-boxed in the author's annotated doc index, or annotated "kinda impt" / "make sure this works" |
| **[OPTIONAL]** | Build only if the required set is done | Brief says "optional", "nice to have", or "best efforts" |
| **[EXCLUDED]** | Deliberately not building | Annotated "NOT NEEDED", or a Sessionboard area the author left un-boxed |
| **[BONUS]** | Scores competition points, not product value | The brief's bonus-points list |

The author's own priority markers are the strongest signal available, and there are three kinds:

1. **The numbered feature list** in the brief body — nine items, the required core.
2. **Section headers** in the SCREENSHOTS section — two carry "(OPTIONAL)" / "optional but nice to
   have, best efforts".
3. **Red annotations drawn on the screenshots themselves** — the highest-resolution signal, because
   they tag individual controls rather than whole features. Full list in
   [Appendix A](#appendix-a-verbatim-author-annotations).

---

## 1. Competition deliverables

These are submission artifacts, not product features. All three are required to be eligible.

| ID | Tag | Deliverable |
| --- | --- | --- |
| D-1 | **[REQUIRED]** | Their competition entry form, filled out |
| D-2 | **[REQUIRED]** | A public **open-source repository** |
| D-3 | **[REQUIRED]** | A **deployed, live site** that a judge can test against the walkthrough video |
| D-4 | **[REQUIRED]** | Delivered by **Wed Aug 12, 10:00 PM PT** |
| D-5 | **[OPTIONAL]** | Token-spend receipts, up to $500 reimbursable (includes Codex Pro / Claude Max subscriptions) |

> Note on D-3: "testable with the walkthrough" means a judge must be able to create an event,
> submit a talk, and get accepted **without us seeding the database for them**. Sign-up and demo
> data reset matter more than they look.

---

## 2. Event configuration

Basis: `reference/screenshots/01-event-config/`.

| ID | Tag | Requirement |
| --- | --- | --- |
| E-1 | **[REQUIRED]** | Create an event with: Event Name\*, Event Slug\*, Starts At\*, Ends At\*, Timezone |
| E-2 | **[IMPORTANT]** | Optional event metadata: Event Type, Website URL, Location, Theme (long text) |
| E-3 | **[IMPORTANT]** | Event branding: logo (square, ~300×300) and background/banner (~1500×500) image upload |
| E-4 | **[IMPORTANT]** | **Tracks**, **Rooms**, **Tags**, and session **Formats** as event-scoped configurable lists — every downstream feature (routing, conflict detection, filters, agenda views) depends on these existing |
| E-5 | **[OPTIONAL]** | **Personas** and custom **Fields** library (Sessionboard's Settings → Library) |
| E-6 | **[OPTIONAL]** | Multi-event support in one install; event switcher |
| E-7 | **[OPTIONAL]** | Exhibitor / sponsor group entities |
| E-8 | **[EXCLUDED]** | Sessionboard's Event Team / role-based admin permissions — never mentioned in the brief |

---

## 3. Call-for-speakers submission forms

**Brief feature #1** — *"Custom call-for-speakers submission forms with conditional logic and
category-based routing."*

Basis: `reference/screenshots/02-submission-forms/` (11 screenshots of the 7-step builder wizard).

| ID | Tag | Requirement |
| --- | --- | --- |
| F-1 | **[REQUIRED]** | An organizer-facing form **builder**; multiple independent forms per event |
| F-2 | **[REQUIRED]** | **Conditional logic** — show/hide questions based on earlier answers |
| F-3 | **[REQUIRED]** | **Category-based routing** — a submission's category/track determines where it goes and who reviews it |
| F-4 | **[REQUIRED]** | Form targets either **Abstracts** or **Sessions**; participants can be toggled on/off |
| F-5 | **[REQUIRED]** | Abstract field set, each field drag-reorderable with an independent Required toggle: Title\* (locked, text, 255), Description\* (rich text, 5,000), Format\*, Tags\*, Track\*, Level |
| F-6 | **[REQUIRED]** | Participant field set: First Name\*, Last Name\*, Email\* (all locked), Mobile Phone, Biography (rich text, 5,000) |
| F-7 | **[REQUIRED]** | **Participant roles** per form, with min/max count per role and an overall participant cap |
| F-8 | **[REQUIRED]** | Custom fields beyond the built-ins, with per-field type (text / rich text / dropdown / etc.) and character limits |
| F-9 | **[IMPORTANT]** | Welcome screen: Internal Form Name\*, External Form Title\*, Page Heading\* (15 char cap), rich-text welcome message with a show/hide toggle |
| F-10 | **[IMPORTANT]** | **Close date** on a form — *annotated "kinda impt"*. Gates submission and drives draft-reminder emails |
| F-11 | **[IMPORTANT]** | **Success page + auto-redirect into the speaker portal** — *annotated "make sure this works"*. This is the seam between "submitted" and "onboarding"; it is called out because it is the thing that most often breaks |
| F-12 | **[IMPORTANT]** | Submitter **"Submission Confirmation" email** — *annotated "must have"* |
| F-13 | **[OPTIONAL]** | Submission limit per submitter (event-level max, e.g. 3) |
| F-14 | **[OPTIONAL]** | Allow multiple simultaneous draft submissions |
| F-15 | **[OPTIONAL]** | Cross-field combined character limits with a live counter |
| F-16 | **[OPTIONAL]** | Admin notification emails on new submission — *annotated "nice to have"* |
| F-17 | **[EXCLUDED]** | **Payments & Fees** step — *annotated "NOT NEEDED"*. Skip the whole step, and Invoices with it |

---

## 4. Public CFP page

Basis: `reference/screenshots/03-public-cfp/`, plus the live example linked in the brief.

| ID | Tag | Requirement |
| --- | --- | --- |
| P-1 | **[REQUIRED]** | Public, unauthenticated, shareable URL per form |
| P-2 | **[REQUIRED]** | Multi-step submission flow: Welcome → Account → Submission → Participant → Review |
| P-3 | **[REQUIRED]** | **Account creation inside the flow** — a submitter arrives cold and leaves with portal access |
| P-4 | **[REQUIRED]** | Mobile-friendly |
| P-5 | **[IMPORTANT]** | Deadline and remaining-submission-count banner |
| P-6 | **[IMPORTANT]** | Save as draft, resume later |
| P-7 | **[IMPORTANT]** | Review step before final submit |

---

## 5. Speaker portal

**Brief feature #2** — *"Self-service speaker portal for bios, headshots, slides, and supporting
documents."*
**Brief feature #8** — *"Resource and wiki pages within the speaker portal, including HTML embed
support for existing reference material."*

Basis: `reference/screenshots/04-speaker-portal/`, `07-portal-tasks/`, `08-portal-forms/`. The
author red-boxed the **entire Portals section** of Sessionboard's doc index (`00-context/03-image6.png`).

| ID | Tag | Requirement |
| --- | --- | --- |
| S-1 | **[REQUIRED]** | Authenticated speaker portal, tabs: Home / Submissions / Profile / Tasks |
| S-2 | **[REQUIRED]** | **Speaker edits their own bio and profile** — *annotated "update your own bio data"*. Fields: Biography (5,000), Salutation, Honorific, Pronouns, Gender |
| S-3 | **[REQUIRED]** | **Headshot upload** |
| S-4 | **[REQUIRED]** | **Slides and supporting-document upload**, attached to their session |
| S-5 | **[REQUIRED]** | My Submissions list showing session ref (e.g. `SESS-4`), title, format badge, and status (Accepted / Pending) |
| S-6 | **[REQUIRED]** | **Resource / wiki pages** inside the portal, authored by organizers |
| S-7 | **[REQUIRED]** | **Raw HTML embed support** in those wiki pages, so existing reference material can be pasted in |
| S-8 | **[IMPORTANT]** | Speaker links: LinkedIn, X, Facebook, personal website |
| S-9 | **[IMPORTANT]** | View and edit a submission after it is submitted |
| S-10 | **[IMPORTANT]** | Admin **impersonation** — "Back to Admin Mode" implies organizers can view the portal as a given speaker. Enormous support-cost saver, and cheap |
| S-11 | **[OPTIONAL]** | Portal appearance / branding settings |
| S-12 | **[OPTIONAL]** | Multiple portal types (contact / group / submission portals); switching between them |
| S-13 | **[OPTIONAL]** | Group portal access sharing (co-speakers, sponsors) |

### 5a. Tasks and file collection

Basis: `07-portal-tasks/`, `08-portal-forms/`.

| ID | Tag | Requirement |
| --- | --- | --- |
| S-14 | **[REQUIRED]** | Organizer-defined **tasks** assigned to accepted speakers — this is what feature #6's dashboard counts. Examples from the product: "Hotel and Travel Reservations", "Presentation Upload" |
| S-15 | **[REQUIRED]** | Task completion state, visible to both speaker and organizer |
| S-16 | **[IMPORTANT]** | Task scoping: per-contact, per-group, or per-submission |
| S-17 | **[IMPORTANT]** | **Portal forms** — organizer builds a form; completing it satisfies a task. Types: Contacts / Groups / Submissions. Reuses the F-8 field library |
| S-18 | **[IMPORTANT]** | **File requests** — a named request ("Upload Presentation Slides") that collects files, stored against the request rather than the record |
| S-19 | **[OPTIONAL]** | Portal form confirmation email with a link back to the submission |
| S-20 | **[OPTIONAL]** | Copy tasks from a previous event |

---

## 6. Review, scoring and evaluation

**Brief feature #4** — *"Submission evaluation and scoring workflows, including optional AI-assisted
review across multiple rounds."*

Basis: `reference/screenshots/05-abstracts/`. Author red-boxed **Evaluation plans**; **AI
evaluations** sits outside the box.

| ID | Tag | Requirement |
| --- | --- | --- |
| V-1 | **[REQUIRED]** | Submission list with status tabs: All / Accepted / Accept Queue / Pending / Decline Queue / Declined / Withdrawn / Drafts |
| V-2 | **[REQUIRED]** | Accept / decline a submission, inline from the list |
| V-3 | **[REQUIRED]** | **Scoring** of submissions by named reviewers |
| V-4 | **[REQUIRED]** | **Multi-round** review — the brief says "across multiple rounds"; the accept/decline *queue* statuses are how a round is staged before it is committed |
| V-5 | **[REQUIRED]** | **Evaluation plans**: which reviewers see which submissions, on what criteria — red-boxed by the author |
| V-6 | **[IMPORTANT]** | Configurable columns (Sessionboard exposes 39 session fields, ~18 shown by default), sort, filter, saved views |
| V-7 | **[IMPORTANT]** | Manually add a submission from the admin side (Details + Participants) — organizers always have invited talks that never touch the CFP |
| V-8 | **[IMPORTANT]** | Export submissions to CSV / XLSX |
| V-9 | **[OPTIONAL]** | **AI-assisted review** — the brief's own word is "optional" |
| V-10 | **[OPTIONAL]** | Bulk import sessions |
| V-11 | **[OPTIONAL]** | Bulk download of all submission files |
| V-12 | **[OPTIONAL]** | Reviewer workload / progress reporting |

---

## 7. Agenda and scheduling

**Brief feature #5** — *"Drag-and-drop schedule and agenda building, with automatic conflict
detection across rooms and tracks, viewable by list, day, week, track, or room."*

Basis: `reference/screenshots/06-agenda/`. Author red-boxed the whole **Program & agenda** section
including AI agenda builder; the brief separately says the AI agenda capability is of *less*
interest and to "cover the basics".

| ID | Tag | Requirement |
| --- | --- | --- |
| A-1 | **[REQUIRED]** | **Drag-and-drop** placement of accepted sessions into time slots |
| A-2 | **[REQUIRED]** | **Automatic conflict detection** across rooms and tracks, with a dedicated Conflicts view |
| A-3 | **[REQUIRED]** | Views: **List, Day, Week, Room, Track**. (Sessionboard also has Month; the brief's list does not include it) |
| A-4 | **[REQUIRED]** | Session scheduling fields: Starts At, Ends At, Room, Track, Capacity |
| A-5 | **[IMPORTANT]** | Unscheduled queue — accepted sessions with no slot yet, surfaced rather than silently missing |
| A-6 | **[IMPORTANT]** | Draft vs. published agenda, so organizers can rearrange without speakers seeing churn |
| A-7 | **[OPTIONAL]** | Speaker double-booking detection (same person, overlapping slots) — distinct from room/track conflicts and arguably the one organizers feel most |
| A-8 | **[OPTIONAL]** | **AI agenda builder** — brief: "less so, cover the basics" |
| A-9 | **[OPTIONAL]** | Month view; CEU credits; Client ID field |

---

## 8. Communications

**Brief feature #3** — *"Automated, templated speaker communications, including reminders and
calendar invites delivered directly to each speaker's own calendar (Gmail, Outlook, iCal)."*

Author red-boxed the **Communications** section: Creating & sending emails, Email templates.

| ID | Tag | Requirement |
| --- | --- | --- |
| C-1 | **[REQUIRED]** | **Email templates** with merge fields, editable by organizers |
| C-2 | **[REQUIRED]** | **Automated triggered sends**: submission confirmation, acceptance, decline, task reminder, draft-deadline reminder |
| C-3 | **[REQUIRED]** | **Calendar invites that land on the speaker's own calendar** — Gmail, Outlook, iCal. Practically: a real `.ics` attachment / `METHOD:REQUEST` invite, not a "add to calendar" link |
| C-4 | **[REQUIRED]** | Manual ad-hoc send to a filtered audience (all accepted speakers, everyone with an open task, etc.) |
| C-5 | **[IMPORTANT]** | Send log — what went to whom and when. Without it, organizers cannot answer "did she get it?" |
| C-6 | **[OPTIONAL]** | Email themes / branded layout |
| C-7 | **[OPTIONAL]** | Reminder cadence configuration per task |

> C-3 is the single most under-appreciated requirement in the brief. "Delivered directly to each
> speaker's own calendar" is a deliverability problem, not a UI problem, and it needs a real
> outbound mail path on the deployed site.

---

## 9. Dashboard

**Brief feature #6** — *"Real-time dashboard showing which speakers still have outstanding
onboarding tasks."*

Basis: `reference/screenshots/10-dashboard-OPTIONAL/`.

**⚠ Conflict in the source, flagged for review.** Feature #6 is in the required numbered list, but
the screenshot section is headed *"Dashboard (optional but nice to have, best efforts)"*. The
reading below treats the **narrow** capability named in #6 as required and the **broader dashboard
suite** shown in the screenshots as optional.

| ID | Tag | Requirement |
| --- | --- | --- |
| B-1 | **[REQUIRED]** | Live view of **accepted speakers with outstanding tasks**, and which tasks |
| B-2 | **[IMPORTANT]** | Counters: submissions, accepted speakers, and status breakdown (Accepted / Pending / Declined / Drafts / Withdrawn) |
| B-3 | **[IMPORTANT]** | Actionable nudges — "N accepted sessions still need a time slot", "N speakers missing a bio or headshot", each linking to the fix |
| B-4 | **[OPTIONAL]** | Prebuilt dashboards: Event Overview, Submissions Pipeline, Speaker Tracking, Review Progress, Schedule Health |
| B-5 | **[OPTIONAL]** | Custom dashboards with an add-widget builder |
| B-6 | **[OPTIONAL]** | Submission pacing over time, vs. a prior event edition |
| B-7 | **[OPTIONAL]** | Breakdowns by form and by track |
| B-8 | **[OPTIONAL]** | **Reports** — *annotated "nice to have"* |
| B-9 | **[EXCLUDED]** | AI-prompt dashboard generation |

---

## 10. Publishing and embeds

**Brief feature #9** — *"Embeddable, mobile-friendly speaker gallery and schedule itinerary postable
to their website."*

Basis: `reference/screenshots/09-cms-embeds-OPTIONAL/`.

**⚠ Second conflict, flagged.** Feature #9 is required, and "Embeds" is inside the author's red box
on the doc index — but the screenshot section is headed *"CMS > Embeds (OPTIONAL)"*. Reading: the
**embeddable output** is required; Sessionboard's **admin UI for configuring embeds** is optional.

| ID | Tag | Requirement |
| --- | --- | --- |
| G-1 | **[REQUIRED]** | **Embeddable speaker gallery**, mobile-friendly, droppable into their existing site |
| G-2 | **[REQUIRED]** | **Embeddable schedule itinerary**, mobile-friendly |
| G-3 | **[REQUIRED]** | Embeds **auto-update** as sessions and speakers change — no re-paste |
| G-4 | **[IMPORTANT]** | Public list of sessions and list of speakers |
| G-5 | **[IMPORTANT]** | Copyable embed snippet |
| G-6 | **[OPTIONAL]** | Embed admin surface: named embeds, enable/disable, live preview, desktop/mobile toggle |
| G-7 | **[OPTIONAL]** | Per-embed filters, field selection, and style options |
| G-8 | **[OPTIONAL]** | Deep-linking into an embed by speaker (`?sb-speaker-id=…`) |

---

## 11. Integrations

**Brief feature #7** — *"Native, one-way integration with Accelevents (existing registration
platform) to eliminate manual data re-entry."*

| ID | Tag | Requirement |
| --- | --- | --- |
| N-1 | **[REQUIRED]** | **One-way** sync to **Accelevents**. One-way is the author's word — we push, we do not reconcile |
| N-1a | **[REQUIRED]** | A real client written against the published OpenAPI spec — endpoints, field mapping, auth header, error handling — not a placeholder |
| N-1b | **[REQUIRED]** | The client sits behind a named interface with a fixture-backed fake, so the demo, tests, and a judge without credentials all exercise the full path |
| N-1c | **[OPTIONAL]** | Live end-to-end run against a real Accelevents account (needs a key we may not get) |
| N-2 | **[OPTIONAL]** | Any other integration (Cvent, Swoogo, Zoom appear in Sessionboard; none are asked for) |

**What Accelevents is.** The AI Engineer team's ticketing and attendee-registration platform. It
knows who bought a ticket and who checked in; it does not manage speakers or the program. Feature #7
exists because today an organizer re-types accepted speakers into Accelevents by hand so they get
comped tickets and badges. The direction is program → registration.

| Fact | Value |
| --- | --- |
| REST base URL | `https://api.accelevents.com/rest/` |
| Auth | API key in an `AUTHENTICATION` header |
| Key generation | Manage Enterprise → Integrations → API Key, **Owner only** |
| Plan gating | **Enterprise and White Label plans only** |
| Other surfaces | Webhooks (ticket purchase, attendee check-in); OpenAPI spec; `llms.txt` index |
| Docs | https://developer.accelevents.com/docs/accelevents-api-documentation |

> **Lack of a key does not block this requirement.** The contract is public — OpenAPI spec plus an
> `llms.txt` markdown index — so the client, the field mapping, and the push logic can all be
> written and unit-tested against it. What a key would add is a live end-to-end run (N-1c), and no
> competitor is likely to have one either. Build N-1a for real, demo it through N-1b.

---

## 12. Platform and non-functional

| ID | Tag | Requirement |
| --- | --- | --- |
| T-1 | **[REQUIRED]** | Open-source license |
| T-2 | **[REQUIRED]** | Deployed and publicly reachable |
| T-3 | **[REQUIRED]** | Self-hostable — the entire premise is not paying a vendor |
| T-4 | **[REQUIRED]** | Two distinct authenticated roles: organizer/admin and speaker/participant |
| T-4a | **[REQUIRED]** | **Magic-link auth everywhere** — every role, no passwords anywhere in the system. Email a signed, short-lived, single-use link; exchange it for a session |
| T-4b | **[IMPORTANT]** | Long-lived sessions for speakers (weeks). A speaker returns to the portal once a month; forcing a new link every visit is the failure mode magic links are supposed to avoid |
| T-5 | **[REQUIRED]** | File storage for headshots, slides, and documents |
| T-6 | **[REQUIRED]** | Outbound transactional email on the deployed instance |
| T-7 | **[IMPORTANT]** | Seedable demo event, so a judge can evaluate in minutes |
| T-8 | **[IMPORTANT]** | Setup docs good enough for the AI Engineer team to run it themselves |

---

## 13. Competition bonus points

Orthogonal to product value. The brief lists these with its own weighting language.

| ID | Tag | Item | Brief's weighting |
| --- | --- | --- | --- |
| Z-1 | **[BONUS]** | Deploys on **Cloudflare** | "mild" bonus |
| Z-2 | **[BONUS]** | Persists to **Airtable** | bonus |
| Z-3 | **[BONUS]** | Hosted on **Forge** rather than GitHub | "teeny" bonus |
| Z-4 | **[BONUS]** | Speed / performance | bonus |
| Z-5 | **[BONUS]** | A **public API**, cf. https://sessionboard.mintlify.app/introduction | bonus |

---

## 14. Explicit non-goals

| Tag | Not building | Why |
| --- | --- | --- |
| **[EXCLUDED]** | Payments, fees, invoicing | *"NOT NEEDED"* on the Payments & Fees screenshot |
| **[EXCLUDED]** | Design fidelity to Sessionboard | *"Cloning the exact design is not a requirement"* |
| **[EXCLUDED]** | Speaker CRM | Brief calls these "extra features optional" |
| **[EXCLUDED]** | Contacts & data / import / history | The one un-boxed section on the author's annotated doc index |
| **[EXCLUDED]** | Awards, Studio, Marketing modules | Present in Sessionboard, absent from the brief |
| **[EXCLUDED]** | AI agents (Reviewer, Scheduler, Coordinator, Team Lead) | Sessionboard markets them; the brief asks for none |
| **[EXCLUDED]** | Exhibitor / sponsor management | Visible in screenshots, never requested |

---

## Resolved ambiguities

The brief is silent or self-contradictory on these. Each is now decided; recorded here so the
reasoning is auditable rather than buried in a table cell.

**1. Dashboard** (§9). Feature #6 appears in the required numbered list, but the screenshot section
header says "optional but nice to have, best efforts." → The narrow reading is required: **a view of
who still owes an outstanding task**, which is what feature #6 actually names. The broader analytics
suite behind those seven screenshots is optional.

**2. Embeds** (§10). Feature #9 is required and "Embeds" is red-boxed on the annotated index, but
the screenshot header says "(OPTIONAL)." → The **output** is required — an embeddable session list,
speaker list, and agenda, reachable by URL. The **admin UI for configuring embeds** is optional; a
config file or sensible defaults satisfies the requirement.

**3. "Multiple rounds"** (V-4). → Read as **genuinely independent scoring rounds**: a submission can
be scored, promoted, and scored again by a different reviewer pool against a different scorecard.
The accept/decline queue statuses are the staging mechanism, not the rounds themselves. This is the
more demanding reading and it is what a program committee actually does.

**4. Scale.** → Assume **one conference, hundreds to low thousands of submissions, tens of
reviewers**. Consequences: no sharding, no queue infrastructure, no pagination heroics. Bulk
operations still matter for review assignment and status changes, because those are done in one
sitting across the whole set.

**5. Accelevents.** → Not an open question. Build the real client from the published spec (N-1a)
behind a fixture-backed interface (N-1b); a live run (N-1c) is optional and credential-dependent.
See §11.

**6. Auth model** (T-4a). The brief shows account creation at submission time but never specifies a
mechanism. → **Magic links for every role, no passwords anywhere.** Confirmed by Logan.

Rationale: no password storage, no reset flow, no lockout policy, no credential-stuffing surface,
and it matches how a speaker actually behaves — they return to the portal weeks apart and would have
forgotten a password anyway. Sessionboard itself does the opposite for participants (passwords) while
using magic links for reviewers and AV crew; the inconsistency is theirs, not a reason to copy it.

The one real cost is email deliverability: if the link doesn't arrive, nobody gets in. Mitigation is
D-3's demo seeding — the deployed instance must expose a way for a judge to enter as a seeded speaker
without waiting on an inbox.

### Still genuinely open

Nothing. Every ambiguity in the brief has a recorded decision above.

---

## Appendix A: verbatim author annotations

Red markings drawn directly on the screenshots by the brief's author. These carry more weight than
anything inferred, because the author chose to write them by hand.

| Annotation | On | Screenshot | Read as |
| --- | --- | --- | --- |
| **"NOT NEEDED"** | Payments & Fees wizard step | `02-submission-forms/08-image21.png` | EXCLUDED |
| **"must have"** | Submitter "Submission Confirmation" email | `02-submission-forms/11-image7.png` | REQUIRED |
| **"make sure this works"** | Success page + auto-redirect to portal | `02-submission-forms/10-image9.png` | IMPORTANT |
| **"kinda impt"** | Form close date | `02-submission-forms/09-image36.png` | IMPORTANT |
| **"nice to have"** | Admin notification emails | `02-submission-forms/11-image7.png` | OPTIONAL |
| **"nice to have"** | Reports | `00-context/03-image6.png` | OPTIONAL |
| **"update your own bio data"** | Portal profile | `04-speaker-portal/02-image40.png` | REQUIRED |
| **red box** | Program & agenda; Submissions & forms | `00-context/02-image37.png` | in scope |
| **red box** | Portals (all); Evaluation plans; Communications | `00-context/03-image6.png` | in scope |
| *no box* | Contacts & data | `00-context/02-image37.png` | out of scope |
| *outside box* | AI evaluations | `00-context/03-image6.png` | optional |

## Appendix B: section headers in the brief's SCREENSHOTS section

| Section | Header text | Read as |
| --- | --- | --- |
| CMS > Embeds | "**(OPTIONAL)**" | admin UI optional; output still required per feature #9 |
| Dashboard | "**optional but nice to have, best efforts**" | broad suite optional; feature #6's narrow view still required |

All other sections carry no marker and are treated as in scope.
