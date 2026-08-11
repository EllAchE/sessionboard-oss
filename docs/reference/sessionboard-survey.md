# Independent Sessionboard product survey

**This document is not part of the spec.** It was produced by a separate agent working only from
Sessionboard's own public sources — marketing site, help center, API docs, status page, changelog —
with no access to the competition brief, `00-goals.md`, or `01-requirements.md`. It is reproduced
here verbatim.

Its purpose is a coverage check: anything in this survey that the brief-derived requirements never
mention is either something the AI Engineer team deliberately does not use, or a gap in our reading
of the brief. Use it that way. **Do not treat it as a scope list** — the brief says outright that
most of Sessionboard is not needed.

**Citation shorthand:**
- `L/` = `https://learn.sessionboard.com/`
- `W/` = `https://www.sessionboard.com/`
- `A/` = `https://apidocs.sessionboard.com/`

**Confidence markers:** `[observed]` = stated explicitly in a source. `[implied]` = strongly
suggested but not spelled out.

**Source-quality warning from the surveying agent:** two marketing pages are demonstrably
unreliable. `W/pricing` renders **"$249 per month" on all three tiers** (Professional, Enterprise,
Tailored) — near-certainly placeholder text. `W/capabilities/conference-speaker-management` still
ships unreplaced **"Fondi" template Lorem ipsum**. Treat both as low-confidence.

---

## 1. Product overview

### What it is

Sessionboard positions itself as **"The Agentic Speaker & Content Platform"** (`W/`) — a system of
record for the *program layer* of conferences: the span between "we need content" and "the content
has been reused." It is explicitly **not** a registration or ticketing platform. Every comparison
page frames coexistence: registration stays on Cvent, RainFocus, EventsAir, or Cadmium, while
Sessionboard owns the program (`W/compare/sessionboard-vs-cadmium`, `-vs-openwater`, `-vs-ex-ordo`,
`-vs-x-cd`, `-vs-oxford-abstracts`). `[observed]` The public API contains no registration, attendee,
ticket, or badge resource (`A/llms.txt`), corroborating this. `[observed]`

Scale claims are inconsistent across the site: `W/` says "+250 teams / +44k sessions," while the
compare pages and `W/solutions/digital-posters-eposters` say "3,500+ event teams / 1.7M+ sessions
managed." `[observed]` Compliance claims are consistent: **SOC 2 Type II and GDPR**
(`W/products/call-for-papers`, compare pages). `[observed]`

### Product structure

Two overlapping taxonomies exist, reflecting a navigation migration in progress.

**Marketing-site nav (current):** Program · CRM · Marketing · CMS (`W/`). `[observed]`

**Compare-page five-pillar taxonomy** (verbatim on all five compare pages): Program layer · Speaker
CRM · Content marketing · Advocacy · Dispatch, plus **Event MCP**. `[observed]`

**In-app beta nav (July 2026 changelog):** regrouped into **Manage, Relate, Market, Deliver,
Attend** (`https://feedback.sessionboard.com/changelog`). A separate Early Access entry names the
new nav as **"Program, CRM, Marketing, CMS, and Attend"** (`L/get-started/early-access.html`).
`[observed]` These two do not agree — the nav is actively churning. `[implied]`

There are also **two generations of the submission/evaluation stack running side by side**:
"classic" evaluation plans (`L/evaluations/evaluation-plans.html`) and **Sessions 2.0** round-based
evaluations plus the new form builder (`L/evaluations/setting-up-round-based-evaluations.html`,
`L/applications/building-your-submission-form.html`). SbQL docs warn that with Sessions 2.0
"evaluation relationships still read legacy tables so results may diverge from the UI"
(`A/insights/sbql.md`). `[observed]`

### Personas

**Organizer / admin.** Full event and org access. Org-level default roles are **Admin, Admin Lite,
Program Manager** (changelog 2026-04-01). Event-level default roles are **Session Manager, Evaluator
Session Manager, Portal User** (auto-applied to every contact); default roles cannot be deleted,
custom roles can be created/duplicated/edited/deleted
(`L/event-team/invite-manage-event-team-members.html`). `[observed]` Field-level permissions live at
Event Team → Permissions → Role → Fields with three states: **View (Default) / Lock / Hide** (same
page). `[observed]` Accounts lock after **5 failed login attempts**. `[observed]`

**Reviewer / evaluator.** Strictly scoped access — cannot see other evaluators' comments and have
**no channel to contact speakers** (`L/evaluations/evaluation-plans.html`). `[observed]` Reach their
queue by magic link (`W/products/abstract-management`) or via evaluation-plan assignment on the
Program Site (`L/site/program-site.html`). Awards reviewers get login credentials by email instead
(`L/awards/managing-submissions-reviewers-rounds.html`). `[observed]`

**Participant** — the umbrella persona. Sub-roles: **Session submitter** (captured on form page 2),
**Speaker(s)** (form page 4, reachable by email and SMS), **Chairperson** (admin-only assignment,
pulled from Contacts not Speakers), **Moderator** (admin-only)
(`L/concepts/participant-roles.html`). `[observed]` Sessions 2.0 adds **custom participant roles**
mapped onto the three core types — Author, Co-author, Panelist, Discussant, Presenter
(`L/applications/building-your-submission-form.html`, `W/products/abstract-management`).
`[observed]` Sponsors and exhibitors are participants of a different shape: **Group** records with
contacts attached (`L/sponsors-exhibitors/sponsors.html`). `[observed]`

**AV crew.** A distinct no-account persona introduced with Marketing — magic-link access to
schedules, speaker files, and transcription controls (`L/marketing/ready-room.html`). `[observed]`

**Attendee.** Historically not a Sessionboard user at all — reached only through embeds
(`L/sessions/embeds.html`). The Marketing module changes this: the **Attendee View** is a full
public event hub with live captions, replays, comments, reactions, and an "Ask this event" assistant
(`L/marketing/attendee-view.html`). `[observed]` A separate **Attend** product (registration and
check-in) is named but not documented (`L/marketing/attendee-view.html` note). `[implied]` — its
existence is stated, its features are not.

**Advocate.** Speakers, sponsors, and exhibitors given a personal tracked share link and a
magic-link "Creator console" (`L/marketing/advocacy.html`). `[observed]`

**Internal team member (Dispatch recipient).** Sales/membership/marketing staff who receive share
kits via Slack and email (`L/marketing/dispatch.html`). `[observed]`

### What an "event" object contains

From `L/events/event-details.html` `[observed]`:

*Identity fields:* Event Name, Event Slug, Event Type, Event Website URL, Event Location, Timezone,
Starts At, Ends At, Theme, Logo (300×300), Background (1500×500).

Several of these are load-bearing beyond display: **AI Evaluations will not run unless Event Type,
Event Website URL, Event Location, and Theme are populated** (`L/evaluations/ai-evaluations.html`).
`[observed]` Advocacy prefills its register link from Event Website URL
(`L/marketing/advocacy.html`). `[observed]`

*Record settings (8 toggles):* Set submission limit · Automatically provision contact portal access
· Collect additional contacts · Enable primary speakers · Enable Participant Acceptance · Enable
speaker headshot limitations · Enable sponsor & exhibitor logo limitations · **Record IDs** (3–6
uppercase-character prefixes). `[observed]`

An event owns: sessions and subsessions, contacts (event-scoped, distinct from org contacts),
groups, forms, portals, tasks, evaluation plans, embeds, email/SMS history, an audit log, and —
where enabled — awards programs, marketing content, and print documents. Events can be **cloned**,
with a copy-options list; submissions are *not* copied, evaluation plans are copied in a closed
state, and branding is a separate checkbox (`L/faq/`). `[observed]` **There is no event archiving.**
`[observed]`

---

## 2. Feature inventory by functional area

### 2.1 Call for papers & submission forms

**Session submission forms** — up to **20 per event** (`L/sessions/submission-forms.html`, restated
`L/applications/building-your-submission-form.html`). Note the tension with `W/pricing`, which
states "up to 25 tailored forms per event." `[observed]` — contradiction.

*Classic builder* has four sections (`L/sessions/submission-forms.html`) `[observed]`:
- **Welcome screen**
- **Session information** — only **Title is mandatory**; Description is not
- **Speaker information** — First Name, Last Name, Email are mandatory and undeletable
- **Form settings** — Close date; reminder emails at **5 days and 1 day** before close; admin
  notification recipients; **Speaker limit max 15 per session**; submission limit; confirmation
  message; **automatic redirect to portal after 10 seconds**; success page

*Sessions 2.0 builder* (`L/applications/building-your-submission-form.html`) is materially richer
`[observed]`:
- **Submission type: Abstract or Session** — a first-class distinction that propagates
  platform-wide (Abstracts tab vs Sessions tab vs All Submissions)
- **Participant roles** enabled per form across three core types (Speaker, Chairperson, Moderator),
  each with min/max counts, surfaced under custom labels
- **Conditional participant limits** — rules with `WHEN ALL MATCH` (session field / operator /
  value) → `THEN APPLY PER ROLE` (min/max overrides) + optional total override; **first matching
  rule wins**
- **Sub-session submissions** — two toggles: allow submitters to select a parent session; allow
  submitters to submit sub-sessions
- **Unique contact settings** — "Allow users to submit new information for existing contacts" and
  "Notify existing contacts that they have been added to a submission"
- **Cross-field character limits** — named rules with a combined character budget across selected
  text fields, a custom error message, and a live counter. All fields in a rule must share one step;
  **speaker-scope rules count per speaker, session-scope rules count once per submission**; mixing
  is blocked by the editor. Rich-text formatting is stripped before counting; whitespace counts.
- **Membership & Access tab** — Submitter Requirements gated on attributes from Organization
  Settings → Membership; **Participant Validation** via an HTTP lookup against an external system
  (Validation URL + JSON request/response format)
- **Notifications step** — separate admin recipient lists for new submission vs. existing
  submission update

**Field-level options** (both generations): Custom Label, Placeholder, Help Text, Required toggle.
`[observed]` Layout elements: Section header (255 char), Form divider, Rich text box. `[observed]`

**Question rules (conditional logic)** — supported trigger field types are **Checkbox, Dropdown, and
Number** (`L/sessions/submission-forms.html`); Applications forms list **Textbox, Dropdown, Number**
(`L/applications/create-applications.html`). Question rules work on session submission forms and
portal forms but **not on sponsor/exhibitor intake forms** (`L/faq/`). `[observed]`

**Field scope** — every form field is either **event-level or global**; global field edits propagate
to every event (`L/sessions/submission-forms.html`, `L/speaker-crm/creating-crm-fields.html`).
`[observed]`

**Draft submissions** — submitters can Save as Draft; admins get a Drafts filter and a "View Draft
Submissions" form action; **Send Reminder Email requires a Close Date** to be set
(`L/sessions/draft-submissions.html`). `[observed]`

**Form actions menu:** Edit, View Submissions, View Draft Submissions, View Form, Duplicate, Delete.
`[observed]`

**Submission payments** (Sessions 2.0 and Awards) — Base Fee → Pricing Rules (if/then on a field,
with Set fee to / Add / Subtract, evaluated in order) → VAT Rules (percentage or flat, with a label)
→ Promo Codes (percentage off or flat off). Gateway is configured at the **organization level**,
never per program. Sessionboard claims **100+ supported gateways and zero platform transaction
fees**; funds go direct to the organization
(`L/applications/building-your-submission-form.html`, `L/awards/awards-pricing-payments-invoices.html`,
`W/products/abstract-management`). `[observed]` The gateway list
(`L/awards/awards-list-of-supported-payment-gateways.html`) is the **Spreedly** roster — ~140 named
providers including Stripe, Braintree, Authorize.net, PayPal Commerce, Adyen, Worldpay, CyberSource,
Moneris, Elavon. Spreedly is confirmed as a sub-processor added 2026-06-17 (changelog). `[observed]`
**There is no payment collection for sponsors/exhibitors** (`L/faq/`). `[observed]`

**Applications** (`L/applications/create-applications.html`) — a lightweight parallel intake path
for non-session data: Request to Speak, Awards Application, Pitch Competition. Three pages: Welcome
Screen, Application Information, Form Settings. Statuses **Pending / Accepted Queue / Declined Queue
/ Declined**. Notably: applications have **no API or integration coverage** and **no evaluation
plans**. `[observed]`

**Speaker CRM Interest Forms** (`L/speaker-crm/speaker-crm-interest-forms.html`) — org-level,
year-round, event-agnostic. Two modes: "Sessions & Speakers" or "Speakers Only." Five-step wizard:
Form Details (incl. Opens At / Closes At / Max Speakers Per Session), Events, Form Fields, Managers,
Notifications. Submissions land in the Pipeline, defaulting to the **Identified** stage. `[observed]`

**Sponsor / exhibitor intake forms** (`L/sponsors-exhibitors/sponsor-intake-form.html`,
`-exhibitor-intake-form.html`) — three fixed pages: Welcome & Terms, Group Information, Contact
Information. Shared by Copy Link. Submission auto-creates both a contact and a group. No conditional
logic, no configurable settings documented. `[observed]`

**Forms in 25+ languages** shipped May 2026 (changelog 2026-05-06). `[observed]`

### 2.2 Abstract & content management

**Abstract vs. Session as distinct types** — the core Sessions 2.0 change. The API exposes this as
`is_abstract` and supports `expand=composition` for abstract-to-session linking (`A/changelog.md`
2026-07-05, `A/insights/sbql.md`). `[observed]` SbQL distinguishes `FIND Session` from `FIND
Abstract`. `[observed]`

**Merging abstracts** — multiple accepted abstracts can be merged into one session
(`W/products/abstract-management`). `[observed]`

**Session standard fields** (`L/concepts/sessionboard-standard-fields.html`), with types
`[observed]`: CEU Credits (number) · Client Session ID (text) · Description (wysiwyg) · Ends At
(datetime) · Format (dropdown) · Language (dropdown) · Level (dropdown) · Location (dropdown) ·
Speakers (dropdown) · Starts At (datetime) · Status (dropdown) · Submitter (dropdown) · Tags
(dropdown, **multi-select**) · Title (text) · Track (dropdown).

**Categorization settings** (`L/sessions/session-settings.html`) — Rooms, Track, Level, Format,
Language are **single-select**; **Tags are multi-select**. Rooms carry Order and Capacity, with a
**limit of 100,000 rooms**. `[observed]`

**Session files** (`L/sessions/enable-upload-download-content.html`) — enabled per event at Sessions
→ Settings → Files. **1.95 GB per file.** Version history retained but **only the latest version
appears in exports**. Comments carry name and timestamp but **fire no notification or email**. Bulk
zip via Download Files → "Group files by" → Generate Download, delivered by email with subject
"[Sessionboard] Your file is ready." `[observed]` June 2026 added **per-session file-upload control
including post-deadline exceptions** (changelog 2026-06-03). `[observed]`

**Bulk edit** (`L/settings/bulk-edit-fields.html`) — one field across many records; the field must
be present on the current dashboard view. **Tags are replaced, not appended** — a genuine data-loss
footgun. `[observed]`

**Field locking** — marketing names it (`W/capabilities/content-management`); the mechanism is the
role-level View/Lock/Hide permission (`L/event-team/invite-manage-event-team-members.html`).
`[observed]`

**Version history and restore** for content (`W/capabilities/content-management`) `[observed]`; the
session-files article documents versioning concretely. `[observed]`

**Math equations in the Session WYSIWYG** shipped June 2026 (changelog 2026-06-03) — a scientific-
society tell. `[observed]`

**Character limits:** text fields 255, textarea 5,000, both governed by a per-field Maximum Length
setting (`L/faq/`, `L/concepts/field-types.html`). `[observed]`

**Digital posters / ePosters** (`W/solutions/digital-posters-eposters`) — posters are modeled as a
**session format**, not a separate object; they use the same review rounds, chair workflows, and
acceptance states. Poster tours, boards, and room assignments publish on the main program. A
**Poster Gallery** provides a branded linkable hall with in-browser viewing of PDF, video, and image
posters, instant search, login-free bookmarks, **embargo timing**, and per-poster engagement
analytics. `[observed]` Poster Gallery also appears as an event-level Beta flag
(`L/get-started/early-access.html`). `[observed]`

### 2.3 Review, scoring & evaluation workflows

Two generations coexist.

**Classic evaluation plans** (`L/evaluations/evaluation-plans.html`) `[observed]`:
- Type: "Assign Evaluators"
- Toggles: Set plan as open · **Enable anonymized review** (hides speaker names) · Enable weekly
  reminders (sent Mondays) · Include uploaded files
- Roles: Evaluators, Evaluator Session Managers, Admin Users
- **The plan must be closed to assign evaluators**
- **Grading options cannot be edited once created** — rating icons (faces or numbers) 1–5, or
  stars/hearts 1–20; rubric criteria weighted to total 100%, 255 chars per criterion; evaluation
  limits
- Evaluators cannot see each other's comments and have no channel to speakers

**Round-based evaluations, Sessions 2.0** (`L/evaluations/setting-up-round-based-evaluations.html`)
— the richest single article on the site. Four-step wizard: **Overview → Rounds → Evaluators →
Assignments.** `[observed]`
- **Scoring Method:** Percentage-based or Points-based
- **Round Mode: Funnel** (explicit promotion between rounds) vs. **Parallel** (all rounds open at
  once, mirroring classic behavior)
- **Abstain settings**, including a required reason as free text or a fixed list
- **Scorecard question types:** 1-3 Scale · 1-5 Scale · 1-10 Scale · Numeric Score (custom min/max)
  · Custom Dropdown with per-option point values · Free Text (unscored) · File Upload · Separator.
  **Scorecards are per-round.**
- **Reviewer View Configuration:** Visible Fields · Filterable Fields (Category is permanent) ·
  Submission Card Fields (Title fixed plus up to 3) · Visible Participant Fields
- **Assignments:** scope (all / by filter / individual); distribution **All-to-All** vs **Individual
  Reviewer**; caps for *reviewers per submission* and *max submissions per evaluator*; an **Impact
  Preview** before committing; conflict handling with three options — Add to existing / Replace
  not-yet-reviewed / Replace all including reviewed
- Deep-dive tabs: **Submissions · Rounds** (bulk promote/demote) **· Evaluators · Review**

**AI Evaluators / Virtual Evaluators** (`L/evaluations/ai-evaluations.html`,
`W/capabilities/ai-evaluators`) `[observed]`:
- Plan Type = **Virtual Evaluators**; AI plans marked with a blue icon
- Prerequisite: Settings → Event Details must have Event Type, Event Website URL, Event Location,
  Theme
- **⋯ → Regenerate Evaluations** re-runs the pass
- Reviewer **Personas** define who is scoring — fields: Name*, Role*, Biography, **Feedback Style**
  (Positive / Neutral / Constructive), **Likes (3)**, **Dislikes (3)**. Three uneditable defaults
  ship built in, framed by a "TIERS" framework (`L/sessions/session-settings.html`)
- Weighted scoring across criteria such as originality, expertise, audience value; each submission
  gets a numeric score **plus a written justification**
- **Human override is always available and always logged**
- Closed processing model, TLS 1.2+, no training retention. Anthropic and Deepgram are named
  sub-processors under "enterprise API terms with no-training and no-retention commitments"
  (changelog 2026-06-17)
- Personas are exposed as a **CRUD API resource** (`A/changelog.md` 2026-04-09)
- A **global AI kill-switch** exists at org level (changelog 2026-04-01)

**Evaluation summary dashboard** (`L/evaluations/evaluation-summary.html`) `[observed]` — counts of
Evaluations, Evaluated Sessions, Evaluation Plans, Evaluators; Highest and Lowest Scoring Sessions;
Completion Status chart; Average Session Score by Plan; Top 10 Sessions; and **"Thought-Provoking"
Sessions** — those with the widest score spread across reviewers. That last one is a genuinely
distinctive metric.

**Reviewer workload constraints** (per-submission and per-reviewer caps, plus assignment preview)
shipped July 2026 (changelog 2026-07-01). `[observed]`

**Accept/decline** (`L/sessions/accept-decline.html`) — five statuses: **Accepted, Accepted queue,
Pending, Decline queue, Declined**. The portal collapses these to Accepted / Pending / Pending /
Pending / Declined. **Status changes send no automatic email** — a repeatedly emphasized behavior.
`[observed]`

**Custom statuses** (`L/sessions/session-settings.html`) — Name, **Category (mandatory, and it
drives integration sync behavior)**, Color, Display Order, "Show custom status name" toggle.
`[observed]`

**Blind review** appears in three places with different implementations: classic "Enable anonymized
review" `[observed]`; Sessions 2.0 Reviewer View Configuration (by omitting participant fields)
`[implied]`; and Awards **Privacy & Conflict of Interest → Blind Review**, which hides identity in
the reviewer interface only — admins still see full details
(`L/awards/managing-submissions-reviewers-rounds.html`) `[observed]`.

**Conflict-of-interest tracking** is claimed on every compare page as part of the Program layer
`[observed]`, but the only concrete COI surface documented is the Awards Blind Review toggle.
`[implied]` — a full COI declaration/recusal workflow is not documented anywhere.

### 2.4 Awards, grants & scholarships

An **add-on module** requiring support to enable (`L/awards/getting-started.html`). Lives at
Organization Dashboard → Programs → Awards. `[observed]`

**Eight-step creation wizard** `[observed]`:
1. **Identity & nomenclature** — program name; type (**Awards / Grants / Scholarships**, which sets
   default terminology); description; **dynamic labels** ("Nominator," "Nomination," "Nominate")
   that cascade through forms, portals, and emails
2. **Categories** — hierarchical, **up to two nesting levels**, each with name, instructions,
   drag-and-drop ordering, and linked pricing/reviewer rules
3. **Form builder** — Category Selection, Submitter Information, Nomination Details, Form Questions;
   a **Quick Add** panel of pre-built standard fields (Nominee First/Last Name, Email,
   Title/Position, Organization, Department, Phone, Nomination Statement, Impact & Achievements,
   Supporting Documents, CV/Resume, Website/Portfolio); custom types Checkbox, Date, Dropdown,
   Email, File upload, Long text; a **Rules tab** for combined character/word limits across fields
4. **Pricing** — as described in 2.1
5. **Rounds** — a default round "Submissions and Review" is auto-created. Types: **Submission +
   Review** (accept entries while reviewing) and **Review Only** (finalist stages). **Round type
   cannot be changed after creation.** Round Name max 255 chars; Opens/Closes timeline gates when
   reviewers may submit; rich-text Reviewer Instructions
6. **Winners** — winner tags from presets (Gold, Silver, Honorable Mention, Finalist) or custom;
   editable after launch
7. **Managers** — Program Managers are co-admins with full access
8. **Notifications**

**Program statuses:** Draft (inactive, for setup and testing) · Open (accepting submissions) ·
Archived (inactive, data preserved). `[observed]`

**Reviewer assignment** offers **six distribution methods** (the page mislabels them as four): All
to All · Per Submission (N reviewers each, evenly distributed) · Per Reviewer (max N submissions) ·
By Category · **By Reviewer Tag** · Individual Reviewer. Reviewer Tags are free-form skill labels
("Technical Expert," "Industry Veteran"). An **Impact Preview** shows Filtered Submissions and New
Assignments before confirming. `[observed]`

**Submission detail:** ID format **AWD-YYYY-NNNNN**; status badges (e.g. Pending Payment); tabs
Details and Reviews; ⋯ menu with **Mark as Winner, Reject Submission, Assign Reviewer, Send Email,
Print, Delete Submission**. `[observed]`

**Winner selection** — tag a submission, choose a winner type, confirm. The confirmation explicitly
states *"Winners are not automatically notified."* **Award winners sync automatically into the
Speaker CRM**, building a searchable database of recognized talent. `[observed]`

**Community voting** (`W/products/awards`) — enabled per category, with custom voting windows, and a
choice of whether votes affect final outcomes or feed a separate People's Choice track. Nominee
cards show name, role, session title, category, topics, plus Vote Now and View Profile. Real-time
engagement dashboards. `[observed]` — marketing-page only; no help-center article confirms the
implementation. `[implied]` on field-level accuracy.

**Metrics:** org-level cards for Total Submissions, Total Fees, Active Reviewers, Pending Decisions;
reviewer cards for Total Reviewers, Active Reviewers, Reviewer Groups, Average Completion Rate;
invoice cards for Total Collected, Pending, Refunded, Failed Payments. Refunds process through the
original gateway. `[observed]`

**Awards notifications** (`L/awards/awards-notifications-email-templates.html`) — nine templates in
three groups, each with an on/off toggle and a Customize editor. *Submitter:* Submission
Confirmation, Invoice/Receipt, Deadline Reminder, Winner Notification, Non-Selection Notification.
*Reviewer:* Review Invitation, Reviewer Deadline Reminder. *Admin:* New Submission Alert, Round
Complete Alert. Template edits are **scoped to the current program only**. `[observed]`

### 2.5 Speaker CRM (organization level)

Org-level navigation: **Dashboard, Pipeline, Directory, Segments, Fields, History**
(`L/speaker-crm/overview.html`). `[observed]`

**Dashboard widgets:** Speaker Engagement Flow, Top Companies, Speaker Source, Areas of Focus,
Contacts by Region. `[observed]`

**Pipeline** (`L/speaker-crm/pipeline.html`) — a **kanban board** with 8 system stages, each carrying
a behavior type `[observed]`: Researching · Identified · Approved · Contacted · Interested (all
*Open*) · Confirmed (*Won*) · Future Fit (*Nurture*) · Declined (*Lost*).
Enrollment captures a **Score (0–100)** plus a Rationale. The card panel offers **Move to**, **Assign
to event**, **Stage History**, **Activity** (filterable by **User / Agent / System / Rule** — four
distinct actor classes), and **Reports** (scouting reports). `[observed]`

**Segments** (`L/speaker-crm/crm-segments.html`) — **Dynamic Segment** (auto-updating on criteria)
vs **Curated List** (manual membership). `[observed]`

**Advanced Search** (`L/speaker-crm/crm-advanced-search.html`) — filter categories Demographics,
Relevance, Company, History & Connections, Sessions, Custom. Boolean semantics are documented
explicitly: **separate filters AND together; multiple values within one filter OR together.** A live
green result-count banner updates as filters change. `[observed]`

**CRM Fields** (`L/speaker-crm/creating-crm-fields.html`) — categories Custom / Profile / Attribute
/ Communication. **Max 25 columns** in a view. **No multiple saved views** — Segments are the
substitute. Field type is **locked once set**. Global field edits propagate to every event.
`[observed]`

**Contact standard fields** (`L/concepts/sessionboard-standard-fields.html`) — ~43 fields including
Biography (wysiwyg), Headshot (file), **Speaker Fee (currency)**, **Speaker Score (dropdown)**,
Topic/Expertise, Availability, Preferred Session Format, Pronouns, Ethnicity, Gender, Languages,
Country (countries type), Organization Contact (user type). `[observed]` The DEI fields (Ethnicity,
Gender, Pronouns) are notable — speaker-diversity reporting is clearly a supported use case.
`[implied]`

**Contact profile** (`L/contacts/contact-profile.html`) — five tabs: **Profile, Notes** (internal),
**Connections, Files, Activity**. The Connections tab surfaces Awards submissions and Interest Form
entries (changelog 2026-04-01). `[observed]`

**Merge duplicates** (`L/contacts/merge-duplicates.html`) — **3 contacts at a time**; auto-detection
at **70–80% match on email or name**; a Primary is designated; side-by-side conflict resolution;
event-level fields, notes, and additional contacts inherit from the primary; **cannot be undone**.
`[observed]`

**Additional contacts** (`L/contacts/additional-contacts.html`) — up to **3 per primary contact**,
imported via Addtl. Contact First/Last/Email/Role columns. Emails offer three "Include Additional
Contacts" modes: CC them, send only to them, or exclude them. Portals are shared with them via Copy
Link. `[observed]`

**Recurring-event carryforward** — speaker records persist across years rather than being rebuilt
(`W/capabilities/speaker-management`, all compare pages). `[observed]`

**Badges:** "New" = created under 30 days ago; "Returning" = over 30 days with a prior event tie
(`L/faq/`). `[observed]`

**Scouting reports & Scout Agent** are Beta (`L/get-started/early-access.html`). `[observed]`

A competitor's audit (AgendaForge, self-disclosed as such) claims the org-level Speaker CRM "must be
enabled and priced separately," citing Sessionboard's own docs. `[implied]` — plausible given the
add-on pattern elsewhere, but not directly confirmed by a Sessionboard page.

### 2.6 Speaker portals & self-service tasks

**Portal types** (`L/portals/portals-101.html`) — three defaults ship: Default People, Default
Exhibitor, Default Sponsor, plus custom portals. `[observed]`

**Assignment logic** (`L/portals/creating-custom-portals.html`) — this is the single most
consequential portal rule: **a contact or group is assigned to exactly ONE portal, and the first
matching portal in list order wins.** Portals are drag-reorderable; non-matching records fall
through to the Default Portal. Contact filters draw on contact fields plus a limited set of session
fields (format, track, tag, level, languages); group filters use name, level, and custom group
fields. `[observed]`

**Portal settings** (`L/portals/portals-101.html`) `[observed]`: Always Show Tasks · Extend Task
Deadlines · **Final Deadline** (days after due date before lock, default **7**) · Manage Profile ·
Manage Related Sessions & Participants · Send Weekly Digest Email.

**Participation sections:** Invited Sessions / My Submissions / Confirmed Participation — each
renamable up to 100 characters and auto-translated. `[observed]`

**Tasks** (`L/portals/assign-tasks.html`) — three types: **Task, File request, Form**, targeting
**Contacts, Groups, or Sessions**. Definition fields: Task Name, Task Type, Description (typed
directly *or* **Use Field** to pull record data), Task Link (URL or Use Field). Per-portal
overrides: **Alias**, Required, Due Date, Extended Due Date, Make Completed Tasks View-Only, and
**Assign By Filter** (session tasks only, **max 3 filters**). `[observed]`

Status icons: green check = Complete · yellow clock = awaiting approval · orange checklist =
manually marked incomplete · blue circle = incomplete in portal · grey plus = not assigned.
`[observed]`

**Task display order** (`L/faq/`) — **Smart** (`Required > Incomplete > Type > Due Date > Name`),
**Due Date**, or **Custom** drag-and-drop, in a unified panel with My Tasks and Submission Tasks
tabs. Shipped August 2026 (changelog 2026-08-06). `[observed]`

**File requests** (`L/portals/collect-documents.html`) — **one file per request**, **1.95 GB**
limit. Approval workflow: Pending Feedback → green check to approve or red x to deny, with Revert to
pending. **Denial sends no automatic notification.** Bulk download of latest versions, paginated 100
per page. `[observed]`

**Portal forms** (`L/portals/create-assign-forms.html`) — three-part setup: Form Setup (Internal
Form Name, External Form Title, Page Heading), Form Questions, Form Settings. **"Send Confirmation
Email" is required for PDF download to work.** Supports **prefill** from existing record data. **No
cap on the number of portal forms** (unlike the 20-submission-form limit). The bulk file download
modal covers Form file uploads, Headshots, File requests, Session files, Custom field files, Awards
files, and **Speaker contracts**, with folder structure By submitter / By field / By record.
`[observed]`

**Wiki pages / resources** (`L/portals/assign-pages.html`) — Title, Subtitle, Page Content (text,
images, links); assignable to multiple portals simultaneously (unlike contacts, which get exactly
one). `[observed]`

**Portal appearance is global** — `L/settings/portal-settings.html` states plainly that "the
settings applied will update ALL portals created." Sections: Login Page and Home Page. Banner
dimensions differ by generation: **Portals Legacy 1500×200 vs Portals Pro 1920×200**. `[observed]`
Custom portal styling and custom domains are Enterprise-tier (`W/pricing`,
`W/capabilities/speaker-management`). `[observed]`

**Participant access** (`L/participants/access-portal.html`) — the link arrives in the submission
confirmation email; **a password is required and there is no magic link for participants** (in
contrast to reviewers, AV crew, and advocates). "Choose your portal" appears when relevant. Password
resets come from `no-reply@sessionboard.com`. `[observed]`

**Portal task view** (`L/participants/updated-portal.html`) — each row shows name (red asterisk if
required), description, due date in event timezone, and status Incomplete/Complete. The expanded
view offers Open Link, **Mark as Complete**, and Done. `[observed]`

**Participant acceptance** (`L/speakers/speaker-acceptance.html`) — Settings → Record Settings →
Participant Acceptance: Enable · Enable for Subsessions · Allow Submission Withdrawal · **Portal
Status Verbiage** (two labels, 60 chars each). Confirmation is per-role. Statuses Pending (yellow) /
Accept (green) / Decline (orange). Withdrawn submissions retain who withdrew and why. Critically:
**only participants marked Accepted on an accepted session sync to native integration partners.**
`[observed]`

**Known limitation:** there is **no way to hide non-accepted sessions from a participant's portal**
(`L/faq/`). Two workarounds are documented for accepted-speaker-only portals
(`L/faq/how-to-create-a-portal-for-accepted-speakers.html`): filter on Speaker role "is checked" and
turn off Always Show Tasks so tasks surface only for accepted-session speakers; or create a custom
"Accepted Speaker" checkbox field and bulk-edit it (with no auto-sync to actual status). `[observed]`

**"View portal as…" is preview-only** — tasks cannot be completed from it (`L/faq/`). August 2026
extended preview to as-contact, as-account, and as-submitter (changelog 2026-08-06). `[observed]`

**There is no central task-completion report** (`L/faq/`), though "task-completion tracking" appears
in the August 2026 changelog `[observed]` — this may now be resolved. `[implied]`

### 2.7 Communications

**Ad-hoc email** (`L/communications/create-send-emails.html`) — **max 100 recipients per send**; **no
attachments**; **no test send** (preview only); default sender `no-reply@notify.sessionboard.com`;
CC and BCC capped at **5 each**. `[observed]` As of June 2026 the sending domains are
`mail.sessionboard.com` / `eu.mail.sessionboard.com` (changelog 2026-06-17), and custom "From Name"
plus custom email domains shipped in May/July (changelog 2026-05-06, 2026-07-01). `[observed]`
Custom email domain and analytics tracking are Enterprise-tier (`W/pricing`). `[observed]`

**Email templates** (`L/settings/email-templates.html`) — four pre-built, uneditable-but-customizable
templates: **Accept, Decline, One Day Reminder, Five Days Reminder**. Templates are typed **Groups /
Contacts / Sessions**, and **switching a template's type invalidates its merge tags**. `[observed]`

**Automated system emails** (`L/communications/automated-emails.html`) — a full catalog with
triggers, recipients, and customizability `[observed]`:
- Account and sign-in emails: always on, not disableable
- Submission confirmation: body is editable
- Closing reminders: 5 days and 1 day before close
- Portal assignment notification, and a **weekly digest at Mondays 7 AM UTC**
- Evaluation plan opened
- AI evaluations ready
- Report / export ready
- File request messages — **admins cannot disable these**

Batched update notifications with a 60-second window shipped August 2026 (changelog 2026-08-06).
`[observed]`

**Email campaigns** (`L/communications/email-campaigns.html`) — **Early Access**. Statuses All /
Draft / Scheduled / Sending / Sent / Paused / Cancelled. Five-step builder. Audiences:
**Individuals, Companies, Sessions**. Delivery: **Send Now / Schedule for Later / Recurring
Campaign**. Merge tags vary by audience type and include a **Portal Link** tag. Metrics: Open Rate,
Click Rate, Bounce Rate, Unsubscribe Rate, Total Sent. Inherits the Brand Kit. **Unsubscribes are
automatically excluded.** `[observed]`

**SMS** (`L/communications/sms-messaging.html`) — sendable from Contacts, Speakers, Sponsors, and
Exhibitors but **not from Sessions**. Requires the Mobile Phone field. **STOP** opts out, **START**
re-opts in. **Replies are not received.** The sending number is assigned by Sessionboard. Merge tags
supported. History under History > SMS. `[observed]`

**Email & SMS history** (`L/communications/email-sms-history.html`) — five tabs `[observed]`:
- **Emails** — Campaigns and Sent Emails, with statuses Delivered, Opened, Clicked, Bounced, Spam,
  Dropped
- **SMS** — queued / sent / error, with masked numbers
- **Integrations** — Sync ID, Results, Started, Ended, Duration
- **Exports**
- **Audit** — Subject, Type, User, Action (Create/Update/Delete), Field, New Value, Occurred At

**Calendar invites** — **"Add to Calendar" per portal plus calendar merge tags** shipped August 2026
(changelog 2026-08-06). `[observed]` Embeds also emit **iCal** as an output format
(`L/sessions/embeds.html`). `[observed]` A push-based calendar invite (ICS attached to an email,
updating on reschedule) is **not documented** — and since ad-hoc emails cannot carry attachments, it
likely doesn't exist in that form. `[implied]`

### 2.8 Agenda & schedule building

**Five agenda views** (`L/sessions/agenda.html`): **List, Day, Week, Month, Rooms**. The Rooms view
has zoom-to-fit and a timeline icon. **Drag-and-drop sets date, time, and room depending on which
view you're in.** Track drives session color everywhere except Month view. `[observed]`

**Drag intervals** are configurable at 10 / 15 / 20 / 30 / 45 / 60 minutes (changelog 2026-05-06).
`[observed]`

**Agenda settings** (`L/sessions/session-settings.html`): Day Start Time, Day End Time, Session
Statuses, Session Format with **Default Duration**, Room Visibility. `[observed]`

**Conflict detection** (`L/sessions/agenda.html`) — at Sessions → Agenda → **Conflicts**. Detects
**overlapping sessions** and **double-booked speakers, chairpersons, and moderators**. Flagged with
a red dot and an Open button. `[observed]`

**AI Agenda Builder** (`L/studio/ai-agenda-builder.html`) — the most sophisticated single workflow
documented `[observed]`:
- **Drafts are separate from the live agenda** — nothing touches production until commit
- Four setup steps: **Setup → Settings → Rooms → Rules**, then **Next & Generate Schedule**
- A **Criteria library** at Settings → Library → Criteria; per draft you can Add Criteria, pull
  Event Criteria, or take **AI Suggested** criteria
- **Criteria ordering is priority — higher wins**
- **"Ignore Existing Times/Rooms"** toggle for a clean-slate rebuild
- Review via **View & Commit Changes**, with per-change **Accept** or **Accept All Changes**, then
  **Commit Changes** — which "applies only the changes you explicitly accepted"

The API exposes this fully: agenda drafts CRUD, **preview changes**, **commit**, change history,
draft sessions (including bulk), **event rules** (scheduling constraints) CRUD, and personas CRUD
(`A/changelog.md` 2026-04-09, `A/llms.txt`). `[observed]`

**Marketing-claimed AI agenda capabilities** (`W/capabilities/ai-agenda`): Track/Topic Optimization,
Real-Time Recommendations, Audit & Approval Flows, Rule-Based Agenda Logic, Conflict Detection &
Resolution Suggestions, **Speaker Availability Checks**. `[observed]` as claims; the Availability
contact field exists (`L/concepts/sessionboard-standard-fields.html`) `[observed]`, but its use as a
scheduling constraint is `[implied]`.

**Placeholder sessions** and **tentative scheduling** are named in
`W/blog/22-popular-agenda-management-features-in-sessionboard`. `[observed]` — blog, not help center.

**Subsessions** (`L/sessions/create-a-subsession.html`) — **max 200 per parent session**; must fall
inside the parent's date/time window; speaker rosters are linked; **moderators, chairpersons, and
sponsors attach to the parent only**; and critically **subsessions do NOT sync to integration
partners** (they are available via the open API). `[observed]` Bulk sub-session assignment shipped
July 2026 (changelog 2026-07-01). `[observed]`

**Print agendas** (`L/marketing/print-agendas.html`) — Early Access, enabled by support, and filed
under **Program → Print** despite the marketing URL. Six pre-built templates: **Program Book, Daily
Schedule Sheet, Session Handout, Speaker View** (personalized per-speaker schedule), **Awards
Program, Sponsorship Guide**. Customizable sections: Cover page, Welcome section, Speaker pages
(headshots, bio length, session associations, social links), Sponsor pages (auto-pulled from the
Sponsors module with tiered recognition), and **Agenda layouts — list, grid, or track-based**. AI
generation for speaker bios, session descriptions, welcome letters, and section introductions, all
editable before export. Preview Mode vs **Print Layout View**. Exports: PDF (A4 or Letter), **Large
Book PDF** for professional print, and **Markdown**. Any document can be shared at a public
login-free URL that always reflects the latest published version. **Copy From** reuses a template
across events. `[observed]`

### 2.9 Session / room / track modeling

**Rooms** — name, Order, Capacity; **100,000 room limit** (`L/sessions/session-settings.html`).
`[observed]` Room Visibility is an agenda setting `[observed]`; show/hide rooms is named in the blog.
`[observed]`

**Tracks, Levels, Formats, Languages** — single-select taxonomies configured per event. **Format
carries a Default Duration.** (`L/sessions/session-settings.html`). `[observed]`

**Tags** — the only multi-select taxonomy. `[observed]`

All six taxonomies (rooms, tracks, tags, formats, levels, session statuses) plus languages are full
**CRUD API resources** (`A/changelog.md` 2026-04-09). `[observed]`

**Session hierarchy:** Session → Subsession (max 200, time-bounded by parent). `[observed]` Abstract
→ Session composition is a separate relationship exposed as `expand=composition` (`A/changelog.md`
2026-07-05). `[observed]`

**Record IDs** — 3–6 uppercase-character prefixes configurable per event
(`L/events/event-details.html`); Awards uses the fixed `AWD-YYYY-NNNNN` form. `[observed]`

**Session capacity** is not a documented Sessionboard field — the Swoogo integration falls back to
**room capacity** when session capacity is absent. `[implied]` that capacity lives on the room, not
the session.

### 2.10 Public-facing embeds & sites

**Embeds** (`L/sessions/embeds.html`) — five types: **List of Sessions, List of Speakers, Agenda,
Schedule Itinerary, Speaker Gallery** (`W/capabilities/sessions-list-1`). `[observed]`

Output formats: **Embed Styled HTML** (a single line of JavaScript), **Embed HTML**, **JSON/XML**,
and **iCal**. `[observed]`

Behavior: **auto-refresh every 60 minutes**, with a manual Refresh Cache button. **The data type is
locked after creation.** Search inside an embed covers **titles and speaker names only** —
"Descriptions, tags, levels, audience, and custom fields" are explicitly excluded. `[observed]` The
**eye icon** on a session maps to `is_public` TRUE/FALSE in the Get/Search Sessions API (`L/faq/`).
`[observed]`

Embed sorting by custom fields with live preview shipped August 2026 (changelog 2026-08-06).
`[observed]` Show/hide speakers in embeds is named in the blog. `[observed]` Custom embed styling is
Enterprise-tier (`W/pricing`). `[observed]` **Language variants are not supported in embeds**
(`L/settings/language-translation-variant.html`). `[observed]`

**Program Site** (`L/site/program-site.html`) — a single hosted site at
`https://sites.sessionboard.com/s/[slug]`. Settings: Site URL, Landing page & login (Standard email
login and/or SSO, logo, gradient colors, Google Font, custom HTML/CSS/JS), Logged-in experience,
Available programs, User information, Custom pages. Claims **5+ languages and WCAG 2.1+
compliance**. Reviewer access derives from evaluation-plan assignment, not Site settings.
`[observed]`

**Sites** (`L/awards/setting-up-your-sessionboard-site.html`) is the same surface documented in far
more detail from the Awards side `[observed]`:
- Sites list shows slug, programs published, custom pages, last updated
- **Site Slug max 100 characters**
- **Standard Login = email → magic link, expires after 30 minutes, no password, on by default.** SSO
  available by request
- Branding: Logo PNG/SVG at **400×160px, ~500KB max**; Gradient Start Color; Gradient End Color;
  Font Family (any Google Font, default **Inter**)
- **Generate branding** — enter your organization's website URL and Sessionboard scans it for
  colors, logos, and text
- Organization Portal (post-login): Title, Description (rich text), separate Logo, Background Image
  (**1920×800px, JPG/PNG, ~2MB**), and a **Show "Events" Page** toggle
- Available Programs are drag-reorderable and can mix **Awards and Sessions** program types
  (including Speaker CRM Interest Forms)
- User Information fields First/Last Name and Email are **fixed and unremovable**
- Privacy Notice rich text with a terms/privacy acceptance checkbox
- Custom Pages have Title, Slug, Published toggle, and rich-text Content; they surface in public
  header nav and logged-in sidebar
- Logged-in sidebar: Home · My Submissions (Incomplete / Complete with counts, searchable by program
  name, confirmation number, or category) · My Reviews (reviewers only) · My Events (toggle-gated) ·
  Submit to Participate · My Profile · Log Out

**Attendee View** (`L/marketing/attendee-view.html`) — a third public surface, distinct from embeds
and Sites. Enabled by a single **Publish attendee view** toggle. `[observed]`
- Landing page with event branding above a searchable session browser split into **Past / Live /
  Upcoming**, in **grid, day, or room** views
- Top nav: Sessions, Speakers, Media. Conditional bands: **Live now** and **Recaps & reports**
- Live sessions open a **live stage** with real-time captions, insights, reactions, and comments;
  past sessions open a **replay** with recording audio and synced captions; upcoming sessions show
  detail only
- Session pages may include speakers, sponsors, AI recap, highlights, full transcript, attachments,
  and a podcast recap
- Summaries download as **PDF** or a **LinkedIn-ready image**
- **"Ask this event"** — an assistant answering questions grounded in event transcripts
- Share options: public **Link**, **QR code**, **Embed code** (iframe), a **Venue signage screen**
  URL that cycles live stages with a join QR code, and **Live audio listen-in** rebroadcasting room
  audio to the page
- **Publishing is all-or-nothing per event** — it exposes transcripts and AI summaries for *every*
  captured session. The only exclusion mechanism is flagging a session **Do Not Record** or
  **Licensed Content — No Transcription** at capture time
- **No custom domain** — served from the Sessionboard app URL with the event identifier in the path.
  The URL is "unguessable rather than secret"

**Poster Gallery** — a fourth public surface (`W/solutions/digital-posters-eposters`,
`L/get-started/early-access.html`). `[observed]`

### 2.11 AI features

**Named AI Agents** (`W/pricing`, `L/get-started/early-access.html`, `L/agents/overview.html`)
`[observed]`:

| Agent | Domain |
|---|---|
| **Team Lead** | Orchestrator; also hosts the recap copilot sidebar |
| **Reviewer** | Evaluates submissions (the AI Evaluators surface) |
| **Scheduler** | Builds agendas |
| **Coordinator** | Speaker follow-ups and communications |
| **Editor** | Content rewriting; **replaces Studio Remix in the sidebar when agents are enabled** |
| **Scout** | Speaker sourcing — **Coming Soon / Beta** |

Agent governance (`L/agents/overview.html`): described as "supervised AI teammates that act on your
event graph," with **tunable autonomy**, every action logged in the Activity feed labeled **Agent**
(vs. User / System / Rule), and **every action reversible**. Agents inherit token scopes and PII
settings. Four capability areas: source speakers, evaluate submissions, build agenda, report &
analyze. `[observed]`

**Studio Remix** (`L/studio/remix-session-speaker-content.html`) — bulk rewrites Session Titles,
Session Descriptions, Tags, and Tracks. Tone dropdown (Professional, Friendly, Academic, and more)
plus free-text Additional Guidance. Stages: Configure → Select content → Review results (with
Regenerate / Save / Finish Review) → Summary. The governing principle is stated outright: **"Remix
only writes what you save."** `[observed]`

**Insights + SbQL** (`L/reporting/insights-ai.html`, `A/insights/sbql.md`) — Early Access, selected
orgs. Three build modes: **Describe it** (natural language → SbQL with a preview and an
explanation), **Builder** (Columns / Filters / Group By / Sort By), and a raw **SbQL editor** with a
Schema Explorer. SbQL is a SQL-like language over entities `sessions`, `speakers`, `tracks`,
`contacts`, `participant_contacts`, `ratings`, `criteria_ratings`, `Evaluation_Plan_Ratings`,
distinguishing `FIND Session` from `FIND Abstract`. `[observed]`

**MCP server** — `https://mcp.sessionboard.com/mcp` (US) and `mcp-eu` (EU), exposing **27 tools**,
OAuth-backed ("no API keys to copy or rotate," per the compare pages). Read-only, token-scoped, PII-
obfuscated by default, with a **90-day audit log**. Named clients: Claude, ChatGPT, Gemini, Copilot,
Cursor. `[observed]`

**Marketing AI stack** (see 2.12): Live Transcribe with speaker diarization, AI summaries, AI
insights, auto-recaps, Quotes extraction, Clip suggestion, Create drafting, brand-voice baking,
chapter generation.

**AI in Print**: bio generation/rewriting, session description polish, welcome letters, section
intros. `[observed]`

**Governance:** a **global AI kill-switch** at org level (changelog 2026-04-01) `[observed]`; AI
sub-processors (Anthropic, Deepgram, DeepL) under "enterprise API terms with no-training and
no-retention commitments" (changelog 2026-06-17) `[observed]`; **PII Mode** masking names and emails
in Insights `[observed]`; **Hide PII** on API tokens, masking as `j***@a***.com` and `***-***-4567`
`[observed]`.

### 2.12 Marketing / content production (Early Access)

An Early Access module contacted-for via account manager, grouped **Source & produce / Distribute /
Set up** (`L/marketing/what-is-sessionboard-marketing.html`). `[observed]`

**Live Transcribe** (`L/marketing/live-transcribe.html`) — two modes: **self-serve** (your team,
admin app, normal login) and **AV crew** (Ready Room, separate URL, magic link). Output is
identical; they can be mixed within one event. Settings: **Transcription model — General or
Medical**; **Keyterms** (must be entered *before* capture — they can't retroactively fix a
transcript); AI summaries; AI insights; auto-generate recaps; **Post-session recovery** (re-runs
transcription from the recording); Room Console; Mission Control. Capture is manual —
**"Transcription never starts by itself."** Input can be microphone or line-in from the soundboard.
Captured sessions carry badges for Transcript, Summary, Insights, Podcast. Consent flags: **Do Not
Record** and **Licensed Content — No Transcription**, settable by speakers via the portal.
`[observed]`

**Ready Room** (`L/marketing/ready-room.html`) — **named invites last 30 days; direct magic links
last 30 minutes.** Crew see Schedule (by room and day), Files (speaker materials, downloadable),
Transcriptions, and Mission control. Self-service link requests work only if the email is already
known to the event. **Room Console** = a dedicated page per room that stays open on that room's
machine and listens for remote start/stop; **Mission Control** = one operator watching every room
with remote start/stop plus **operator chat**, requiring a real admin login. Recommended at three or
more concurrent rooms. `[observed]`

**Recaps** (`L/marketing/recaps.html`) — four types: **Event report** and **Day debrief** (Executive
summary, Key takeaways, Topics unpacked, Looking ahead, LinkedIn caption), **Session recap** (Session
summary, Key points, LinkedIn caption), and **Session podcast** (audio). Statuses **Draft → Approved
→ Published**, with Unpublish and Archive. Editing offers three paths: edit yourself, **Ask the
copilot** (Team Lead sidebar proposes a rewrite you apply or discard), or **Regenerate** with an
optional instruction and a **diff** you must Apply. Each section has a character budget with an
over-limit warning; History records every version, author, and reason, and restoring an old version
creates a *new* version. **Bulk actions process up to 500 sessions at a time.** Exports: PDF and
Share card (1200×630) for all; Print PDF and **LinkedIn carousel** for event reports and day
debriefs. Publishing a recap pulls notable lines into the **Quotes** library. `[observed]`

**Media library** (`L/marketing/media-library.html`) — tabs Library, Discover, Quotes, Clips, Import,
History. Uploads up to **50 GB per file**, ~6 hours per recording, in
MP4/MOV/MKV/WEBM/M4V/AVI/MP3/M4A/WAV/AAC/FLAC/OGG, with SRT and VTT captions. **Uploads do not resume
on page reload.** URL import from YouTube or Vimeo (Vimeo passwords are used but not stored;
re-importing the same URL creates no duplicate). Discover connects to **Zoom, Goldcast, ON24,
BigMarker, Cvent, Google Drive, Dropbox, YouTube, Vimeo, Descript**. On import, audio is extracted,
transcribed with **speaker diarization**, and speakers are auto-matched to contacts. Per-recording
tools: Chapters (generate/regenerate), Find quotes, Suggested clips, Transcript (correct text, tag
speakers). `[observed]`

**Quotes** (`L/marketing/quotes.html`) — **there is no Add button**; quotes can only originate from
**Find quotes** on a finished transcript (~a dozen candidates per run, re-runnable), though the text
is editable afterward. AI-generated candidates carry an **AI** label. Per-card actions: Copy, Edit
(wording, speaker, topics), **Create** → LinkedIn post or Quote card, Delete. Create works only on
event-scoped quotes. `[observed]`

**Clips** (`L/marketing/clips.html`) — ~6 suggested moments per run; adjustable in/out points; export
with **aspect ratio original / 9:16 / 1:1** and **caption style Clean / Bold / Karaoke**. Logo
watermarking and styling come from the brand kit. `[observed]`

**Create** (`L/marketing/create.html`) — five formats: **LinkedIn post, Blog post** (~600 words,
cited), **White paper, Carousel** (LinkedIn or X), **Video**. A **Sources** rail scopes the draft by
topic, event, sessions, or media, showing a source count; Settings offers **language (English,
French, Spanish, German, Portuguese, Arabic)** and a **CTA slider** balancing promotional vs.
thought-leadership. Inline AI editing: improve writing, shorten, lengthen, fix grammar, make
punchier, change tone, translate. **Copilot** takes document-wide instructions. Exports: PDF, Word,
Markdown, copy text, or open LinkedIn's composer. **"Post to LinkedIn" only copies text and opens the
composer — it does not publish and cannot schedule.** Six content templates plus carousel design
templates. `[observed]`

**Advocacy** (`L/marketing/advocacy.html`) — audiences are **Speakers** (no prerequisite) and
**Groups** (sponsors/exhibitors, requiring **Exhibitor Pro or Sponsor Pro**). Quick Launch flow:
Build (who shares, format **Video** animated share card or **Image** static, register link that must
start with `https://`, optional campaign name and promo code) → Recipients (All contacts / By portal
/ Select) → Landing (layout, font, colors, live preview) → Launch → **Notify** (advocates receive
nothing until this is sent; default subject *"You're featured at [your event] — here's your share
link."*). Links are `https://sessionboard.com/r/` + an **eight-character code**; each click is
logged, **UTM parameters and promo code applied**, then forwarded. Analytics: Advocates (activated
over assigned), Shares, Clicks, an **Advocacy funnel** (Assigned → Opened → Shared → Clicked),
Channel mix, Top advocates, Geography. LinkedIn is the default channel. Org-level Advocacy is a
**read-only** consolidated view. `[observed]`

**Dispatch** (`L/marketing/dispatch.html`) — requires a **separate Early Access flag beyond
Marketing**. Internal counterpart to Advocacy. Goals: Drive registrations / Boost attendance / Grow
reach & authority / Maximize on-demand / Drive pipeline / Custom — each setting a default CTA and
primary metric. Audiences: Sales / Membership / Marketing / Custom. Asset types: LinkedIn post, Quote
card, Clip, **Audiogram**, Carousel, Blog snippet, Talking points. Optional posting schedule at
**T-21, T-14, T-7, T-1 days**. Delivery: **tracked** (with destination link) or **untracked**, to
Slack channels, Slack people, and email; a public link reports in aggregate only. Metrics: Clicks,
Shares, Conversions, with the goal-matched metric highlighted and progress shown as "*N* to go."
**Top performers** leaderboard. `[observed]`

**Content plan / Plan** (`L/marketing/content-plan.html`) — source is a captured session or a
one-sentence topic. Goals: Grow LinkedIn / Drive demos / Promote an event / Thought leadership /
Nurture audience. Duration **14, 30, 60, or 90 days**. Channels toggle Email, Clip, Blog, Lead
magnet, Quote card — **LinkedIn is permanently on** as the cadence anchor. List and Calendar views.
Item statuses: `planned, approved, scheduled, published, skipped`. **Replan wipes and replaces every
item, losing hand edits.** **Publish** converts an item into an Advocacy campaign link (event-level
plans only) but does **not** assign recipients, send notify emails, or post to LinkedIn. `[observed]`

**Posts** (`L/marketing/posts.html`) — a read-through library of written work, filterable by LinkedIn
/ Blog / White paper / Carousel. No approve step, no scheduling, no publishing. Video projects live
with Clips instead. **"Sessionboard never publishes to LinkedIn for you from any location."**
`[observed]`

**Brand kits** (`L/marketing/brand-kits.html`) — org-scoped, per-event assignable, with an org
default. Three components: **Brand voice** (summary, tone words, signature vocabulary, do's, avoids,
example passages), **Visual kit** (colors, fonts, logos, backgrounds), and **Output rules** (default
hashtags, link and UTM source, handles to tag, default CTA, emoji usage, reading level,
boilerplate/disclaimer, words to avoid, plus clip caption style, logo watermark, and aspect ratios).
**Import from URL** pulls colors and fonts from your site; **Bake voice** derives the voice from a
URL you supply, populating all voice fields (still editable). Consumed by Create, Carousels, Clips,
and Advocacy. `[observed]`

**Critical constraint documented repeatedly: nothing in Marketing auto-publishes.** Auto-generated
recaps are drafts; LinkedIn export only copies text; Plan's Publish only mints a campaign link.
`[observed]`

**Second constraint: a finished transcript is the universal gate** for Quotes, Clips, Create sources,
Recaps, and Content plan. `[observed]`

### 2.13 Integrations & API

See §4 for the full integration list. Architecture:

**Native outbound integrations** (Cvent, Swoogo, Bizzabo, Swapcard) share a pattern: an **org-level
credential**, a **permanent event-pair mapping**, **~30-minute continuous sync**, **one-way outbound
only**, and **disconnecting permanently prevents resyncing**. `[observed]`

Per-partner constraints `[observed]`:
- **Cvent** — headshots 2MB / 300×300, content 10MB, **only future sessions sync**, matching is by
  email, **deletions do not propagate**
- **Swoogo** — session capacity falls back to room capacity, 2MB images auto-downscaled, **sponsors
  are not linked to sessions**, **multi-day sessions unsupported**
- **Bizzabo** — speaker labels limited to Speaker / Panelist / Keynote / Moderator; **no granular
  sync control**
- **Swapcard** — toggles for Sync Speakers as Users, Force People Import Sync, Sync Speakers without
  Email; **emojis unsupported**
- **ON24** — **inbound and one-time**; synced events are read-only, though speaker profiles remain
  fully editable

Two sync gates apply globally: **only participants marked Accepted on an accepted session sync to
native partners** (`L/speakers/speaker-acceptance.html`) `[observed]`, and **custom status Category
drives integration sync behavior** (`L/sessions/session-settings.html`) `[observed]`. **Subsessions
never sync** (`L/sessions/create-a-subsession.html`). `[observed]`

**Public API** (`A/`, `A/llms.txt`) `[observed]`:
- Base URLs `public-api.sessionboard.com` (US) and `public-api-eu.sessionboard.com` (EU); header
  `x-access-token`; OAuth 2.1 with PKCE, 24h access tokens, 90-day refresh, RFC 7009 revocation, RFC
  8414 metadata, RFC 8707
- Pagination default 25 / max 100; **3-minute read cache** (webhooks bypass it); write rate limit
  **100 requests per 15 minutes**; daily write quota **10,000 per token**; bulk operations **max
  100**; optimistic concurrency via `updated_at`
- Resource families: Events · Sessions (incl. `is_abstract`, `composition_status`,
  soft-delete/restore) · Transcriptions and composed content (summary_pdf, summary_card,
  event_report, recap, podcast) · Session recordings · Session files (**simple upload 50 MB,
  direct-to-storage 500 MB**, SVG sanitization, magic-byte checks) · Media (multipart upload with
  **auto-triggered transcription**) · Speakers · Contacts (event- and org-scoped) · Sponsors ·
  Exhibitors · Fields · Metadata writes (Rooms, Tracks, Tags, Formats, Levels, Languages, Session
  statuses) · **Agenda planning** (drafts, preview, commit, draft sessions, event rules, personas) ·
  **Insights** (SbQL execute, NL→SbQL, schema, suggestions, saved queries, dashboards, widgets) ·
  **GDPR** (list/create access and erasure requests) · Webhooks · MCP Server
- **API tokens** are org-level and org-admin-only. Fields: Descriptive name, Scopes, MCP Access,
  Hide PII, Event restrictions. Shown once. Scopes include default read, `read:insights`,
  `read:transcriptions`, `read:media`, `write:sessions`, `write:contacts`, `write:events`,
  `write:metadata`/`write:fields`, `write:exhibitors`/`write:sponsors`. Every call is audit-logged
- **MCP access requires three flags to be set** — 403 otherwise

**No API coverage for Applications** (`L/applications/create-applications.html`). `[observed]`

### 2.14 Permissions, roles & security

- Org roles: **Admin, Admin Lite, Program Manager** with field-level permissions (changelog
  2026-04-01). `[observed]`
- Event roles: **Session Manager, Evaluator Session Manager, Portal User**, plus custom roles;
  defaults undeletable (`L/event-team/invite-manage-event-team-members.html`). `[observed]`
- **Field-level permissions: View (Default) / Lock / Hide** per role. `[observed]`
- Awards **Program Managers** are co-admins scoped to one program. `[observed]`
- **Insights permissions** at Event Team → Permissions → Data & Insights. `[observed]`
- **Print/Documents permissions** at Event Team → Permissions → role → Documents. `[observed]`
- **SSO** — SAML, OIDC, and OAuth 2.0 Password, with **separate configurations for Session
  Submission Forms, Portals, and Admin login**. SAML AuthnRequest binding HTTP-Redirect or HTTP-POST;
  OIDC PKCE toggle; an **Enforced Authentication** setting; 2FA handled at the IdP. A **paid
  add-on**; Enterprise tier per `W/pricing`. `[observed]`
- **Free built-in 2FA** (authenticator or email) shipped May 2026; **mandatory admin 2FA** rolled out
  June 2026 (changelog 2026-05-06, 2026-06-17). `[observed]`
- Account lockout after **5 failed attempts**; Unlock Account emails a reset link. `[observed]`
- **Audit log** with Subject, Type, User, Action, Field, New Value, Occurred At
  (`L/communications/email-sms-history.html`). `[observed]`
- **Activity feed** distinguishes four actor classes: **User / Agent / System / Rule**
  (`L/speaker-crm/pipeline.html`, `L/agents/overview.html`). `[observed]`
- **GDPR access and erasure requests** are API resources (`A/llms.txt`). `[observed]`
- **PII masking** in Insights (PII Mode) and on API tokens (Hide PII). `[observed]`
- Sub-processors as of 2026-06-17: added Anthropic, Deepgram, DeepL, Spreedly; removed Pusher,
  PostHog, AppCues, NewRelic. `[observed]`
- **US and EU regional deployments** for both the web app and the public API
  (`https://status.sessionboard.com`). `[observed]`

### 2.15 Reporting & dashboards

**Insights (AI)** (`L/reporting/insights-ai.html`) — Early Access. Three build modes as described in
2.11. Export CSV/XLSX. **Share links serve live data**, with optional password, expiration, and view
limits; formats include a public link, CSV, a Google Sheets `=IMPORTDATA()` formula, JSON, and XLSX.
Scheduling Daily/Weekly/Monthly to a **maximum of 5 recipients**, with links that **lapse after 7
days**. **PII Mode** masks names and emails. `[observed]`

**Custom reports** (`L/reporting/custom-reports.html`) — four report types: **Session, Contact,
Group, Evaluation plan**. Canned reports ship built in. Relationships become columns. Filter
operators vary by field type. Output XLSX or CSV. Gear menu: Edit / Delete / Duplicate. `[observed]`

**Custom reports as dashboard widget data sources** shipped June 2026, with dependency counts and
per-widget logic override/de-link (changelog 2026-06-09). `[observed]`

**Dashboard views** (`L/reporting/dashboard-views.html`) — **max 25 fields per view**. Operators:
contains, does not contain, is, is not, is empty, is not empty, starts with, ends with. Known
non-filterable/non-sortable columns: [Session] Track, [Session] Language, and Sessions. `[observed]`

**Exports** (`L/reporting/exporting-data.html`) — CSV or Excel via the Options menu; columns are
driven by the current table view; **file fields export as publicly hosted URL links** — a quiet
data-exposure consideration. `[observed]` Export date-format settings with split date/time columns
shipped May 2026 (changelog 2026-05-06). `[observed]`

**Evaluation summary** and **CRM dashboard** widgets as described in 2.3 and 2.5. `[observed]`

**Cross-event benchmarking** shipped August 2026 (changelog 2026-08-06). `[observed]`

**Natural-language reports** and **shareable password-protected report links**
(`W/products/abstract-management`). `[observed]`

### 2.16 Data import & maintenance

**Importing** (`L/settings/importing-data.html`) `[observed]`:
- UTF-8 required; **1,000 records per file**
- Phone format `+1 (123)456-7891`; multi-select values pipe-delimited; dates `YYYY-MM-DD HH:mm`
- **Currency and file fields are not importable** (headshot is the exception)
- Updates require an **"Update record if already exists" = TRUE** column
- **"Ignore this column"** during mapping prevents blanking existing data
- Unique identifiers: **Contacts = Email, Groups = Name, Sessions = Session ID**

**Smart Import** is named on `W/products/speaker-crm` without documented mechanics. `[implied]`

**Bulk edit** — see 2.2 (tags are replaced, not appended).

**Merge duplicates** — see 2.5.

**Clone event / clone session** (`L/faq/`) — event clone has a copy-options list; submissions are not
copied; evaluation plans copy in a closed state. Session clone resets Status to Pending and excludes
files. `[observed]`

**Copy images, users, forms, and configs across events** shipped May 2026 (changelog 2026-05-06).
`[observed]`

### 2.17 Localization

Two separate mechanisms (`L/settings/language-translation-variant.html`) `[observed]`:

**Language variants** — admin field labels only. Supported: German, English (UK), Spanish, French,
French (Canada), Portuguese, Portuguese (Brazil), with English (US) as default. **Not supported in
embeds. Not applied to portals, submission forms, or intake forms.** Available via the open API.

**Multi-language portals** — participant-facing, with a language picker and auto-translation of page
headers, untranslated field labels, placeholders, dropdown values, and confirmation/success
messages. Saved language variants override auto-translation.

Also: **forms in 25+ languages** (changelog 2026-05-06) `[observed]`; Program Site claims **5+
languages** `[observed]`; Create supports six output languages `[observed]`; DeepL is a
sub-processor `[observed]`.

### 2.18 Mobile

**Very thin evidence.** Capterra lists deployment as Web, Android, iPhone/iPad. Software Finder
states **"mobile app: no."** These directly contradict each other, and **no Sessionboard-owned page
documents a native mobile app** — no App Store link, no mobile article in the help center sitemap.
The Attendee View, portals, and Sites are responsive web surfaces. `[implied]` — there is no native
Sessionboard mobile app; the Capterra flags are almost certainly a category-template artifact.

---

## 3. Data model sketch

Entities and relationships inferable from field lists, API resources, and UI behavior. Cardinalities
marked `[observed]` where a limit is documented, `[implied]` otherwise.

### Organization tier

```
Organization
 ├─ 1..* Event
 ├─ 1..* Contact (org-scoped — the Speaker CRM record)
 ├─ 0..* PipelineEnrollment  (Contact × Stage, Score 0–100, Rationale)
 ├─ 0..* Segment            (Dynamic | Curated)
 ├─ 0..* FieldDefinition    (global scope; type immutable once set)
 ├─ 0..* InterestForm
 ├─ 0..* AwardsProgram
 ├─ 0..* Site
 ├─ 0..* BrandKit           (exactly one flagged org default)
 ├─ 0..* PaymentGateway     (org-level only — never per program)
 ├─ 0..* ApiToken           (org-admin only)
 ├─ 0..* MediaItem          (Media Library spans events)
 ├─ 0..* Role               (Admin, Admin Lite, Program Manager)
 └─ 0..* SsoConfiguration   (×3 surfaces: submission forms, portals, admin)
```

### Event tier

```
Event  (name, slug, type, website URL, location, timezone, starts/ends,
        theme, logo 300×300, background 1500×500, 8 record settings,
        record-ID prefix 3–6 chars)
 ├─ 0..* Session
 ├─ 0..* Abstract           (same table, is_abstract flag; composes → Session)
 ├─ 0..* Contact            (event-scoped, distinct from org Contact)
 ├─ 0..* Group              (Sponsor | Exhibitor)
 ├─ 0..20 SubmissionForm    [observed]
 ├─ 0..* PortalForm         (uncapped) [observed]
 ├─ 0..* Portal
 ├─ 0..* EvaluationPlan
 ├─ 0..* Embed
 ├─ 0..* CustomReport / DashboardView / Widget
 ├─ 0..* EmailTemplate / Campaign / SmsMessage
 ├─ 0..* PrintDocument
 ├─ 0..1 AttendeeView       (single publish toggle)
 ├─ 1    AuditLog
 └─ taxonomies: Room (≤100,000), Track, Level, Format, Language,
                Tag, SessionStatus
```

### Session subtree

```
Session
 ├─ fields: Title*, Description(wysiwyg), StartsAt, EndsAt, Status,
 │          Format, Level, Language, Location, Track, Tags[],
 │          CEU Credits, Client Session ID, Submitter, is_public
 ├─ 0..200 Subsession        [observed] — time-bounded by parent;
 │                             no moderators/chairs/sponsors; never syncs
 ├─ 0..* Participant  ──→ Contact
 │        role ∈ {Speaker, Chairperson, Moderator}
 │        + custom label (Author, Co-author, Panelist, Discussant, Presenter)
 │        + acceptance status {Pending, Accept, Decline, Withdrawn}
 ├─ 0..* SessionFile          (1.95 GB each; versioned; commented)
 ├─ 0..* Recording ──→ Transcription ──→ {Quote, Clip, Chapter,
 │                                        Summary, Insight, Recap, Podcast}
 ├─ 0..* Rating / CriteriaRating
 └─ 0..* Task (session-typed)
```

Note the **Session ↔ Contact many-to-many is role-qualified and acceptance-qualified** — the join row
carries both the participant role and an acceptance state, and the acceptance state gates integration
sync. `[observed]`

### Evaluation subtree

**Classic:**
```
EvaluationPlan (open/closed, anonymized, weekly reminders, include files)
 ├─ 0..* Evaluator ──→ Contact
 ├─ 0..* EvaluatorSessionManager
 ├─ 1    GradingScheme (immutable after creation)
 │        icons 1–5 | stars/hearts 1–20 | weighted rubric summing to 100%
 └─ 0..* Evaluation (Session × Evaluator → score + comment)
```

**Sessions 2.0:**
```
EvaluationPlan (Percentage | Points; Funnel | Parallel)
 ├─ 1..* Round
 │    ├─ 1 Scorecard (per round)
 │    │    └─ 0..* Question ∈ {1-3, 1-5, 1-10, Numeric(min,max),
 │    │                        CustomDropdown(option→points),
 │    │                        FreeText, FileUpload, Separator}
 │    ├─ 1 ReviewerViewConfig (visible / filterable / card / participant fields)
 │    └─ 0..* Assignment (Submission × Evaluator; caps both directions)
 └─ 0..* Evaluator  ──→ Contact  |  Persona (for AI plans)
```

**Persona** is a first-class entity with a CRUD API: Name*, Role*, Biography, Feedback Style ∈
{Positive, Neutral, Constructive}, Likes[3], Dislikes[3]. `[observed]`

### Portal subtree

```
Portal  (ordered list; FIRST MATCH WINS — a Contact/Group belongs to
         exactly ONE Portal)                          [observed]
 ├─ 1 FilterCriteria  (contact fields + limited session fields |
 │                     group name/level/custom fields)
 ├─ 0..* TaskAssignment ──→ Task
 │        per-portal: Alias, Required, DueDate, ExtendedDueDate,
 │        ViewOnlyWhenComplete, AssignByFilter (≤3 filters, session tasks)
 ├─ 0..* WikiPage  (many-to-many — pages CAN span portals)
 ├─ 0..* File
 └─ settings: AlwaysShowTasks, ExtendTaskDeadlines,
              FinalDeadline (default 7 days), ManageProfile,
              ManageRelatedSessions, WeeklyDigest

Task  type ∈ {Task, FileRequest, Form}
      target ∈ {Contacts, Groups, Sessions}
      status ∈ {Complete, AwaitingApproval, ManualIncomplete,
                PortalIncomplete, NotAssigned}
```

Portal *appearance* is a singleton at the event level, not a per-portal property. `[observed]`

### Awards subtree

```
AwardsProgram (Awards | Grants | Scholarships; Draft | Open | Archived)
 ├─ 1 Nomenclature (dynamic labels cascading to forms/portals/emails)
 ├─ 0..* Category  (≤2 nesting levels)               [observed]
 ├─ 1 SubmissionForm
 ├─ 0..1 PricingConfig (BaseFee → PricingRule[] → VatRule[] → PromoCode[])
 ├─ 1..* Round (Submission+Review | Review Only; type immutable)
 │    ├─ 1 Scorecard
 │    └─ 0..* ReviewAssignment  (6 distribution methods)
 ├─ 0..* Reviewer ──→ ReviewerTag[]
 ├─ 0..* WinnerTag
 ├─ 0..* ProgramManager
 ├─ 9 NotificationTemplates (program-scoped)
 └─ 0..* Submission (AWD-YYYY-NNNNN) ──→ Invoice
          on Mark as Winner → writes back to org Contact (Speaker CRM)
```

### Marketing / content subtree

```
BrandKit (org-scoped, event-assignable)
 └─ {BrandVoice, VisualKit, OutputRules incl. clip settings}

MediaItem ──→ Transcription (diarized; speakers auto-matched to Contacts)
   ├─ Chapter[]
   ├─ Quote[]        (AI-only origin; editable after creation)
   ├─ Clip[]         (aspect: original|9:16|1:1; captions: Clean|Bold|Karaoke)
   └─ Recap ∈ {EventReport, DayDebrief, SessionRecap, SessionPodcast}
              status: Draft → Approved → Published (versioned, with History)

CreateProject → Post ∈ {LinkedIn, Blog, WhitePaper, Carousel} | VideoProject
ContentPlan (14|30|60|90 days) → PlanItem (planned|approved|scheduled|
                                            published|skipped)
AdvocacyCampaign → AdvocateLink (/r/ + 8-char code, UTM + promo)
                   → {Open, Share, Click} events
Dispatch → DispatchItem (T-21|T-14|T-7|T-1) → Slack/email delivery
```

### Cross-cutting

- **FieldDefinition** attaches to **Contact, Group, Session, and Evaluation Plan** (`L/faq/`). Type
  is immutable once saved. Scope is event-level or global. `[observed]`
- **Activity/AuditEvent** carries an actor class of **User / Agent / System / Rule**. `[observed]`
- **Three independent branding systems** that do not share configuration: Marketing Brand Kits
  (`Marketing → Brand`), Print/document branding (`Settings → Branding`), and Sites branding
  (per-site, in the Sites editor). The Brand Kits FAQ states this distinction outright. `[observed]`

---

## 4. Integrations list

Every third-party system named anywhere across the sources.

**Native event-platform integrations** (`W/integrations`, plus per-partner pages at
`/integration/<name>`): Accelevents · ASP Events · Bizzabo · Convention Data Services · Cvent · EVA
Event Tech Hub · ExpoPlatform · Fuzion by Freeman · Gleanin · Grip · Salesforce · Snöball · Stova ·
Swapcard · Swoogo · WordPress. `[observed]` `W/products/speaker-crm` claims "more than 15 event
management platforms," consistent with this list of 16. `[observed]`

**"Works With" footer** (`W/integrations`): iMIS · Fonteva · Nimble AMS · Cvent · VOXO · Wordly ·
Conference AI · Zoom · Path LMS · InGo · Snöball · Gleanin. `[observed]`

**AMS platforms named** (`W/products/abstract-management`): iMIS · Personify · Fonteva · Blackbaud ·
Salesforce · Nimble AMS. `[observed]`

**Media / webinar ingest** (`L/marketing/media-library.html` Discover tab): Zoom · Goldcast · ON24 ·
BigMarker · Cvent · Google Drive · Dropbox · YouTube · Vimeo · Descript. `[observed]`

**Marketing integrations table** (`L/marketing/what-is-sessionboard-marketing.html`): Claude,
ChatGPT, Gemini (MCP/AI) · Goldcast, Zoom, other webinar platforms (video ingest) · Cvent (event
management) · Gleanin & Snöball (distribution — explicitly slated for replacement by Advocacy).
`[observed]`

**Marketplace apps:** Canva · Zoom Webinar · ON24 · Goldcast · Descript · Vimeo · YouTube · Cvent ·
Swapcard · Swoogo · ASP Events · Bizzabo · ExpoPlatform · Stova · Gleanin · Grip · Snöball · InGo ·
**Slack** · **Zapier** · SSO. Capability tags: Discover / Send to / Clips / Webinars / signals; graph
framing "People · Program · Content." `[observed]`

**Comparison targets named** (`W/`, `/compare/*`): Cadmium (incl. Abstract Scorecard and Conference
Harvester) · CTI · OpenWater · Cvent · Map Your Show · Morressier · Oxford Abstracts · VOXO · Wordly
· Conference AI · X-CD · Ex Ordo. Poster-specific: Learning Toolbox · iPosterSessions ·
ePostersLive · Morressier · ePosterBoards · MULTILEARNING. `[observed]`

**MCP clients named:** Claude · ChatGPT · Gemini · Copilot · Cursor. `[observed]`

**Slack** — the delivery channel for Dispatch (channels and individuals). `[observed]`

**Docusign** — Contracts / Docusign is a named Beta flag (`L/get-started/early-access.html`).
`[observed]`

**LinkedIn** — target of Dispatches (Beta), Advocacy default channel, Create export, carousel
formats, Content Plan anchor. Notably **outbound only via copy-to-clipboard — Sessionboard never
publishes to LinkedIn**. `[observed]`

**Payment gateways** — ~140 via Spreedly (`L/awards/awards-list-of-supported-payment-gateways.html`),
featured: Stripe, Braintree, Authorize.net, PayPal Commerce. Full roster includes Adyen, Airwallex,
Checkout.com, CyberSource, Elavon, eWAY, Moneris, Nuvei, Orbital (Chase Paymentech), Payflow Pro,
Paysafe, Rapyd, Shift4, SumUp, Worldpay, Worldline, and many more. `[observed]`

**Sub-processors** (changelog 2026-06-17): added **Anthropic, Deepgram, DeepL, Spreedly**; removed
Pusher, PostHog, AppCues, NewRelic. `[observed]`

**Google Sheets** — Insights share links offer an `=IMPORTDATA()` formula. `[observed]` **Google
Fonts** — Sites font selection. `[observed]` **Google Sheets (onboarding)** — the onboarding
checklist is delivered as a Google Sheet template to copy
(`L/get-started/onboarding-checklist.html`). `[observed]`

---

## 5. Notable UI/UX patterns

**Drag-and-drop**, in at least seven distinct places: agenda scheduling (setting date/time/room by
view) `[observed]`; portal ordering (which determines assignment precedence) `[observed]`; Awards
category ordering `[observed]`; Sites program ordering `[observed]`; portal task Custom order
`[observed]`; media/file upload `[observed]`; and criteria ordering in the AI Agenda Builder, where
**order encodes priority** `[observed]`.

**Kanban** — the Speaker CRM Pipeline, with 8 stages typed by behavior (Open / Won / Nurture / Lost)
(`L/speaker-crm/pipeline.html`). `[observed]`

**Grid / table with configurable views** — the dominant admin surface. Max 25 columns; export follows
the current view; bulk edit requires the field be present on the view. **No multiple saved views in
the CRM** — Segments substitute (`L/speaker-crm/creating-crm-fields.html`). `[observed]` Elsewhere,
filtered views can be saved (`L/sponsors-exhibitors/sponsor-settings.html`). `[observed]` — an
inconsistency between the org CRM and event modules.

**Draft-then-commit with explicit human approval** — the platform's signature AI pattern, repeated
verbatim in three subsystems: AI Agenda Builder ("applies only the changes you explicitly accepted")
`[observed]`; Studio Remix ("Remix only writes what you save") `[observed]`; and Recaps (Draft →
Approved → Published, with diff review on Regenerate) `[observed]`. AI Evaluators follow the same
shape with an always-available, always-logged human override `[observed]`.

**Impact Preview before destructive/bulk action** — reviewer assignment shows Filtered Submissions
and New Assignments before confirming, in both Sessions 2.0 and Awards. `[observed]`

**Wizards** — 4-step evaluation plans, 5-step interest forms, 5-step campaign builder, 6-step
Create/Dispatch flows, 8-step Awards program setup. `[observed]`

**Magic-link, no-account access — four variants with different TTLs**: Ready Room named invites (**30
days**) and direct links (**30 minutes**); Sites Standard Login (**30 minutes**); Advocacy Creator
console (TTL unstated); Dispatch recipients (no account at all). Notably, **participant portals are
the exception — they require a password** (`L/participants/access-portal.html`). `[observed]`

**Status icon vocabulary** — portal tasks use a five-icon color language (green check / yellow clock
/ orange checklist / blue circle / grey plus) `[observed]`; sessions use color-by-track on the agenda
`[observed]`; AI evaluation plans carry a distinguishing blue icon `[observed]`.

**Filter chips** for status subsets (Recaps: All / Captured / Needs review / Published). `[observed]`

**Live count feedback** — Advanced Search shows a green result-count banner that updates as filters
change `[observed]`; cross-field character limits show a live counter `[observed]`.

**"Use Field" instead of merge-tag syntax** — portal task descriptions and links personalize by
picking a field from a dropdown rather than typing `{{token}}` (`L/portals/assign-tasks.html`,
`L/faq/`). Merge tags with syntax are used in emails and campaigns. `[observed]` Two different
personalization idioms coexist.

**Progressive disclosure of AI** — the sidebar swaps **Studio → Agents** and **Remix → Editor** when
AI agents are enabled, changing labels rather than adding surfaces
(`L/studio/remix-session-speaker-content.html`). `[observed]`

**Two-track Early Access** — **Preview** = self-serve toggle; **Beta** = request access
(`L/get-started/early-access.html`, changelog 2026-05-28). `[observed]`

**Generate-branding-from-URL** — Sites and Brand Kits both scrape your website for colors, fonts, and
logos rather than asking you to enter them. `[observed]`

**Deliberate non-automation as a stated design stance** — status changes send no email; denials send
no notification; file comments send no notification; winners are not auto-notified; transcription
never auto-starts; nothing auto-publishes to LinkedIn. This appears too consistently across
independent articles to be accidental. `[implied]` on intent, `[observed]` on each individual
behavior.

**Anti-patterns visible in the docs** — irreversible operations that the UI warns about but does not
undo: contact merge "cannot be undone" `[observed]`; grading options immutable after creation
`[observed]`; round type immutable after creation `[observed]`; field type locked once set
`[observed]`; embed data type locked after creation `[observed]`; bulk edit replaces tags rather than
appending `[observed]`; Content Plan "Replan" wipes hand edits `[observed]`; integration disconnect
permanently prevents resyncing `[observed]`.

---

## 6. Gaps & uncertainty

### Pages that failed or returned nothing

- **`L/communications/notifications.html`** — never successfully fetched across multiple attempts.
  Notification preferences/settings are therefore undocumented here.
- **`L/concepts/field-types.html`** — repeatedly returned only the first two table rows (Text 255
  chars, Text area 5,000 chars) across three differently-phrased prompts. **The complete enumeration
  of field input types is not in this document.** Partial substitutes:
  `L/faq/how-to-create-and-delete-custom-fields.html` gives "dropdown, file, text, checkbox" as
  examples only; the standard-fields article names types in use (number, text, wysiwyg, datetime,
  dropdown, file, currency, countries, user); the Awards form builder names Checkbox, Date, Dropdown,
  Email, File upload, Long text "and more."
- **`L/get-started/navigate-your-contact-portal.html`** — has **genuinely empty body content**
  (heading, breadcrumbs, and prev/next links only). A real documentation gap on Sessionboard's side,
  not a fetch failure.
- **G2** — no discoverable listing. Three search variants and four direct-fetch attempts (including
  via proxy, all 403) found no profile.
- **GetApp and Software Advice** — 404/403 with no listing found; both share Capterra's Gartner
  Digital Markets database, so the Capterra record is the network's full extent.
- **`feedback.sessionboard.com` root** — auth-gated ("Sessionboard's feedback is private"). No public
  roadmap or feature-request board. Only **10 changelog entries render publicly**; the rest sit
  behind a Canny API requiring a key. No RSS feed.
- **`/compare/cvent`** — 404. There is no Cvent comparison page, despite Cvent appearing in the
  comparison list on the homepage.

### Premises that did not hold

- **Comparison pages contain no feature tables.** All five that exist use an identical two-column
  bulleted template with no paired feature rows. Their real value is the consistent five-pillar
  taxonomy.
- **Third-party review evidence is essentially nil.** Capterra: **0 reviews**. Software Finder: **0
  reviews**. G2: no profile. Capterra lists Sessionboard under **CRM**, not Event Management, so its
  11-item feature checklist is a category template, not a product description. Its noted absence of
  "Sales Pipeline Management" is an artifact of that mismatch, not a real gap — the Pipeline
  demonstrably exists.
- **The only substantive third-party analysis is by a direct competitor** (AgendaForge,
  self-disclosed). Its claims are unverified and adversarially motivated, but two of them corroborate
  independent evidence: no native attendee registration, and possible separate pricing for the
  org-level Speaker CRM.

### Documented internal contradictions

| Topic | Value A | Value B |
|---|---|---|
| Max file size | 5 GB (`L/faq/`, platform max with a Record Settings override) | 2 GB (a second FAQ page); 1.95 GB is the consistently stated per-file cap |
| Swoogo headshot cap | 1 MB (headshot FAQ) | 2 MB (Swoogo integration page) |
| API vs UI file caps | API: simple upload 50 MB, direct-to-storage 500 MB, media 50 GB | UI: 1.95 GB session files |
| Submission form limit | 20 per event (help center, twice) | 25 "tailored forms per event" (`W/pricing`) |
| Customer scale | +250 teams / +44k sessions (`W/`) | 3,500+ teams / 1.7M+ sessions (compare pages) |
| Navigation taxonomy | Program, CRM, Marketing, CMS, Attend (`L/get-started/early-access.html`) | Manage, Relate, Market, Deliver, Attend (changelog 2026-07-01) |
| Mobile | Web + Android + iPhone/iPad (Capterra) | "mobile app: no" (Software Finder) |
| Language support | 25+ for forms; 5+ for Program Site; 8 admin variants; 6 Create output languages | "English only" (Software Finder) |
| Document null handling | `L/documents/document-generation.html`: "when a record has no data, the record will not be skipped" | Reads as a probable typo for the inverse; behavior genuinely unknown |

### What needs a live trial or a demo video to confirm

**Highest priority — core workflows where docs describe the setup but not the runtime:**
1. **The reviewer's actual scoring screen.** Sessions 2.0 documents what admins *configure* but there
   is no article showing the reviewer's view in operation — navigation between submissions, how
   abstain is invoked, whether scores autosave, what happens at a round deadline mid-review.
2. **The AI Agenda Builder's change diff.** The granularity of a "change" (one session move? a
   cascade?) and how conflicts between accepted changes resolve are unknown.
3. **Conflict detection scope.** Documented: overlapping sessions, double-booked
   speakers/chairs/moderators. Unknown: room double-booking, capacity overflow, speaker
   travel/availability windows, track adjacency, or attendee-facing conflicts.
4. **The full field-type enumeration** (blocked by the `field-types.html` extraction failure).
5. **Notification preferences** (blocked by the unfetchable `notifications.html`).

**Structural questions the docs raise but don't answer:**
6. **How much of Sessions 2.0 is generally available vs. gated.** Two evaluation systems, two form
   builders, and an SbQL caveat about legacy tables all suggest a partial migration.
7. **What "Attend" is.** Named in the beta nav and referenced as "registration and check-in" in an
   aside, but there is no product page, no help-center section, and no API resource. If Sessionboard
   is building native registration, that would invert the coexistence positioning.
8. **Whether the Speaker CRM is separately licensed.** Only a competitor asserts this.
9. **Real pricing.** All three tiers render $249/month; every path routes to sales.
10. **What the 27 MCP tools actually are.** The count is documented; the tool list is not.
11. **Calendar invite mechanics.** "Add to Calendar" and calendar merge tags shipped in August 2026,
    but whether a rescheduled session pushes an updated ICS to a speaker's calendar — the thing
    organizers actually want — is undocumented.
12. **Whether task-completion reporting now exists.** The FAQ says there is no central report; the
    August changelog says "task-completion tracking" shipped. One of these is stale.
13. **Community voting implementation.** Described only on `W/products/awards`; no help-center
    article exists.
14. **Exhibitor floor plans and booth inventory.** No evidence of either in any Sessionboard source.
15. **Webhook event catalog.** Webhooks are listed as an API resource family and noted as bypassing
    the 3-minute read cache, but no event-type list was found.
16. **The "Rule" actor class.** The Activity feed distinguishes User / Agent / System / **Rule**,
    implying a user-definable automation-rules engine. No article documents where rules are created
    or what they can do — the single largest undocumented capability implied by the UI. `[implied]`
