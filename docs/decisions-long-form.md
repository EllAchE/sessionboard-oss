# Why I built Cicero this way

This is the long version of the Cicero write-up. I have kept the small technical decisions in it on
purpose. The shorter version should eventually pull out the product thesis, the major departures
from Sessionboard, the visual direction, and the few architectural choices that explain everything
else. This version is the record underneath that summary.

## The problem I decided to solve

Cicero started with a very specific target: replace the part of Sessionboard that the AI Engineer
conference team actually uses, not every module Sessionboard has accumulated. The incumbent costs
more than $40,000 a year, while the useful workflow is much narrower than the product around it.
That made a literal clone the wrong goal. I wanted to build the complete path a conference follows
from opening a call for speakers to publishing the finished programme.

That path became the spine of the product:

1. An organizer creates an event and a call-for-speakers form.
2. A speaker submits without already having an account.
3. The speaker moves into a portal for their profile, headshot, slides, and other deliverables.
4. Reviewers score proposals in rounds, and the organizer makes the decision.
5. Accepted sessions move onto a schedule with conflicts called out.
6. Speakers receive useful email and real calendar updates.
7. The organizer can see what is still missing without building a spreadsheet.
8. The public programme goes back onto the event website through pages, embeds, and an API.

I kept coming back to one test: can a person enter the workflow cold and get all the way through it
without finding a dead end? A plain screen that completes that path is more valuable than a polished
screen that ends halfway through the job.

The original competition material was not perfectly consistent. A dashboard was required in one
place and described as optional in another. Embeddable output was required, while the screenshot of
the embed builder was marked optional. "Multiple rounds" could have meant status buckets or actual
independent review rounds. I resolved those ambiguities in writing before building. The narrow
outstanding-task dashboard is required; the larger analytics suite is extra. Embeddable output is
required; a full administrative studio is extra. Review rounds are real rounds with separate
criteria and assignments.

I also separated two kinds of evidence. The [competition brief](reference/source-brief.txt) and its
screenshots defined scope. A separate [survey of Sessionboard](reference/sessionboard-survey.md)
checked whether I had missed an important behavior. The survey did not get to silently expand the
project. It was a coverage check, not a second requirements document. That distinction mattered,
because the incumbent contains a lot of software the brief never asked for.

## Where I deliberately went beyond the brief

The first expansion was not a feature. It was a product point of view. I did not want the result to
feel like a competition prototype that only works when its author is standing beside it. That is why
Cicero has a public homepage, a real sign-in path, a seeded demo, a mailbox that works without a mail
provider, generated API documentation, and a one-command self-hosted deployment. Those pieces sit
outside the narrow organizer workflow, but they determine whether anybody can understand, evaluate,
or adopt the software.

The largest functional expansion is the speaker CRM. The first requirements pass explicitly left
Sessionboard's CRM out. The core application is event-scoped, and that is correct for proposals,
review rounds, tasks, and schedules. A contact database has the opposite shape. A speaker who returns
for a third year should be one person, not three event records. A prospect being researched may not
belong to an event at all.

I therefore built the CRM above the event layer. Contacts belong to the organizer, while a
`contact_event_link` connects a contact to the event participant created when that person joins a
programme. The directory includes custom fields, import, duplicate handling, saved segments,
campaigns, and a sourcing pipeline. A pipeline card can exist before an event is chosen. Pushing a
confirmed contact into an event creates the account, membership, and participant record in one
operation, after which the event roster owns the event-specific work.

That separation avoids turning the event participant table into a confused mix of prospects,
speakers, reviewers, and historical contacts. It also forced two smaller decisions. Contact merges
are reversible: the losing record becomes a tombstone pointing at the survivor instead of being
deleted. Saved segments come in two kinds because the difference is real. A dynamic segment stores
its filters and picks up tomorrow's import automatically; a curated segment stores a fixed set of
people.

I also went beyond the brief in smaller places where the operational failure was obvious. Cicero
checks for speaker double-booking, not only room and track collisions. It sends calendar invitations
that update the existing event when a talk moves. It lets an organizer act as a speaker rather than
merely preview the portal. It leads the dashboard with outstanding work because Sessionboard's own
documentation says there is no central report for it. These are not feature-count additions. They
are fixes for the places conference software usually leaves an organizer holding the problem.

## Why it is called Cicero, and why it has a Roman identity

The visual theme was a choice, not a requirement. The brief explicitly said that matching
Sessionboard's design was unnecessary, which created room to give the replacement an identity of its
own.

Cicero made sense because the product is about speakers, rhetoric, public programmes, committees,
and the work behind an assembly. The name gives the software a point of view without needing a long
explanation. Once the name existed, a generic blue SaaS interface would have felt disconnected from
it. The Roman direction ties the name, the public story, and the interface together.

I wanted that theme to feel restrained. The working application is dense, and organizers may spend
hours in review queues or schedule grids. Marble textures, columns, and artifact photography cannot
be allowed to compete with the work. The core system therefore uses warm stone neutrals, charcoal
ink, and one vermilion accent. Lapis, verdigris, and ochre are reserved for status meaning rather
than decoration. Spectral handles display and long-form prose, Archivo carries the working
interface, and IBM Plex Mono is used for references such as `ABS-14` and `SESS-4`.

The public homepage can use Carrara marble, a faint mosaic, sculpture, and architectural framing
because its job is to explain and make the project memorable. The admin surfaces stay much quieter.
The current product mark follows the same idea: an open C made from amphitheatre tiers, with a
vermilion stage at the opening. I kept the logo work exploratory rather than treating the first mark
as sacred; the repo includes small-size studies of forum, arch, curia, theatre, rostrum, seal,
colonnade, and assembly directions. The editorial illustrations translate the product rather than
merely decorating it: a rostrum for speakers, wax tablets for review, and a theatre whose tiers
become schedule blocks.

The asset library has provenance, alt text, focal points, recommended uses, and exact generation
notes. Licensed photographs stay identifiable as photographs. AI-assisted cutouts are recorded as
derivatives. Original illustrations are described as illustrations rather than passed off as
historical material. One Hellenistic object is labeled as such instead of being casually called
Roman. That may sound fussy, but a theme built from cultural material should know what its source
material is.

The theme is also an engineering decision. The color system is expressed through semantic tokens,
and dark mode changes those semantic values instead of restating every component. Components use
CSS Modules and tokens rather than one-off colors. The theme is applied before first paint so a dark
preference does not flash through a light screen. I built and froze the shared component set before
feature work spread across the repo. That prevented each workstream from inventing its own button,
dialog, table, or empty state.

## The architecture follows the product

Cicero is a Next.js 15 App Router application on React 19 and TypeScript. It uses Drizzle with
Postgres, Zod for input and API contracts, CSS Modules for styling, and a small set of headless
dependencies where the interaction would be wasteful to rewrite. `dnd-kit` handles drag and drop.
Lucide supplies icons. Marked handles Markdown. There is no Tailwind, component framework, or rich
text editor.

I chose Server Components for the read-heavy surfaces because most of the application is tables,
lists, dashboards, and public pages. Those screens do not need to ship a large client application.
Client components appear where the browser genuinely owns the interaction: dragging a session,
editing a form, changing a conditional answer, opening a dialog, or applying a local filter.

The code is split into four practical layers:

```text
app/api/v1/**      HTTP translation, validation, and API-key authentication
app/**             server-rendered reads and thin Server Actions
lib/services/**    domain behavior and authorization-aware operations
db/**              schema, migrations, and seed data
```

The web interface does not call its own REST API. Server Actions call services directly, and API
writes use the same domain operations instead of paying for an internal HTTP request or creating a
second version of the business logic. Public API reads have dedicated read queries because their
shape and cache policy are different. An `EventContext` is passed into services explicitly, so the
same operation can be called from a Server Action, an API route, a scheduled job, or a test.

That separation was not only architectural taste. Cicero was built in parallel. The database
schema, service contracts, authentication model, mail interface, storage interface, and component
library were established first and then treated as a shared kernel. Work was divided by directory,
because directory ownership can be checked. A vague instruction to "own review" is not enough when
review also touches forms, email, and scheduling.

Freezing the kernel had costs. A few workstreams found contracts they wished were wider. The form
builder could not insert a field at a position atomically, so adding in the middle became append then
reorder. The organizer-created submission path could not persist custom answers because the frozen
input type did not include them. Those are real shortcomings, but they were visible and bounded. A
schema that changed underneath every workstream would have caused much more damage.

## Hosting was allowed to fail without taking the product with it

Cloudflare Workers was the primary deployment target. It earned a competition bonus and offered a
good edge story, but I did not want the application to become a Cloudflare-only artifact. The first
architecture decision was therefore not "use Workers." It was "make Workers reversible."

The application uses the normal `pg` driver and the same Drizzle schema in both environments.
Cloudflare Hyperdrive supplies the connection string and pools at the edge. A self-hosted container
uses `DATABASE_URL`. Postgres, S3-compatible storage, and HTTP or SMTP mail all have equivalents away
from Cloudflare. Moving the application to another host should be a deployment change, not a rewrite
of every query.

I tested the risky path first: Next through OpenNext on Workers, a bound Hyperdrive connection, and a
real server-rendered query. The plan had a hard time box. If that spike failed, the project would
move to a conventional host and give up the mild bonus. A deployment target was not allowed to
consume the whole build.

The same reasoning shaped file storage. R2 is a better object store than Postgres, but Cloudflare
requires a payment method before R2 can be enabled. Requiring a credit card before an open-source
project accepts its first headshot is a bad default. Storage therefore resolves in this order:

1. an R2 binding, when the deployment has one;
2. an S3-compatible bucket, including MinIO in the Docker setup;
3. a Postgres `file_blob` row when neither is configured.

This fallback is meant for modest files and an easy first run, not for turning Postgres into a video
platform. The important part is that uploads work before the operator buys another service. Enabling
R2 later changes configuration, not application code.

The container path is intentionally ordinary. Bun installs and builds from the lockfile; Node 22
runs the supported `next start` server. `docker compose up` starts the application, Postgres, and
MinIO, waits for dependencies, creates the bucket, runs migrations, and serves. A second command can
load the demo data, but it is not required to reach the application.

Workers did expose two non-obvious runtime traps. A Hyperdrive socket belongs to the request that
opened it, so a module-level pool survives into the next request and hangs. Building a new pool on
every service call is also wrong: a single upload may call the database eight or nine times and pay
for the TLS handshake each time. Cicero caches one database wrapper in a `WeakMap` keyed by the
request's Cloudflare context. That gives one connection per request, never one connection across
requests. The self-hosted path keeps a conventional cached pool.

The other trap was configuration. OpenNext can compile a local `.env` into a Worker bundle. At one
point, production tried to address a developer's MinIO container on `localhost`. Deployed Workers
now read only the Cloudflare environment; local development and self-hosting retain the documented
`process.env` fallback. This is a small implementation detail with a large security and reliability
consequence: build-machine secrets and local endpoints do not get to outrank deployed configuration.

## The database is event-scoped by default

Every operational table was event-scoped from the first migration. Multi-event support was listed
as optional, but the isolation underneath it was not optional. A judge creating a cold event had to
coexist with the seeded demo without seeing or changing it. Retrofitting `event_id` after the fact
would have touched almost every query and every unique constraint.

Users are global. Their role is a membership on a specific event. A person can be an organizer on
one event, a reviewer on another, and a speaker on a third without creating multiple accounts. The
event switcher is a consequence of that model rather than a separate subsystem.

Most human-authored values use Postgres `text`; flexible sets and snapshots use JSONB; instants use
timestamps with time zones. Submission and session references are integer counters within an event,
rendered as stable labels such as `ABS-12` and `SESS-4`. UUIDs are good internal identifiers, but
they are poor handles for a programme chair discussing a proposal in a meeting.

The submission table uses a hybrid model. Title, description, format, track, level, status, and tags
need to participate in sorting, filtering, joins, conflict checks, and public programme queries.
Those values are proper relational fields. Questions an organizer adds to a form are usually read
back as one submission's answer set or exported together, so they live in JSONB. Treating every
answer as a column would require a migration whenever a form changed. Treating every answer as a
blob would make the core application slow and hard to query. The split follows the access patterns.

The CRM is the deliberate exception to event scoping. Its rows belong to the organizer because its
purpose is to persist across events. The link into an event is explicit, and event-specific
participant data remains inside the event boundary.

Event isolation is enforced again at the application boundary. A posted event ID is treated as
untrusted input. The server resolves the actor's membership and required capability before using it.
A person without a membership receives a not-found response rather than a forbidden response, so
the authorization check does not confirm that another event exists. API keys are issued per event,
hashed at rest, shown once, and rejected when the event slug in the request does not match the key's
event.

This repetition is intentional. A schema column helps prevent accidental joins across events. It
does not replace authorization.

## Language, names, Unicode, and time

I did not want the database to assume that a speaker is named with ASCII characters or that a talk
title is English. Human text is stored in Postgres `text` or JSONB, which preserve Unicode when
Postgres is running with its normal UTF-8 encoding. The application does not truncate names into
fixed-width `varchar` columns. Accented names, CJK text, Arabic, emoji, and combining marks can
survive the main storage path.

The export code pays attention to encoding too. Calendar lines are folded at 75 UTF-8 octets, not
75 JavaScript characters, and the fold never splits a multibyte code point. The code specifically
handles a calendar attendee such as `Díaz, María`, where a comma and non-ASCII characters both
matter. ZIP entries set the UTF-8 filename flag and are tested with a UTF-8 filename. The CSV parser
accepts a UTF-8 byte-order mark because Excel emits one, and it accepts both Windows and Unix line
endings.

Technical identifiers are narrower on purpose. URLs, API tokens, calendar filenames, and storage
keys need conservative wire-safe forms. Event and form slugs normalize Latin diacritics and reduce
to lowercase ASCII. Uploaded object keys replace unusual filename characters, while the original
filename remains in the database for display and download. Human-facing text stays rich; machine
identifiers stay boring.

This is not the same as saying Cicero is internationalized. It is not. The root document declares
`lang="en"`. Interface copy and email defaults are English. Date formatting is pinned to English
locales. Search and sorting mostly use JavaScript lowercasing and `localeCompare` without an
event-specific locale. There is no right-to-left layout pass. A name written entirely in a script
that the ASCII slugger cannot transliterate needs an explicit slug, or the caller must fall back to
a generic one.

Character limits have another subtle boundary. Cicero strips Markdown syntax before counting so an
author pays for what a reader sees, not the asterisks around it. The resulting count currently uses
JavaScript string length. That counts UTF-16 code units, not grapheme clusters. Many accented
characters count as one, some combined forms count as two, and an emoji may count as two or more.
The data is preserved, but a 500-character budget is not yet equally fair in every writing system.

A serious localization pass would add an event locale alongside the event timezone, use
`Intl.Segmenter` for grapheme-aware limits, use locale-aware collation for search and sort, provide a
Unicode-safe slug fallback, localize system email templates, and test right-to-left pages. It would
also review the self-hosted font files for script coverage rather than assuming the system fallback
will make every mixed-language layout look deliberate.

Time zones are handled more fully because schedule mistakes are immediately operational. Instants
are stored in UTC and shown in the event's IANA timezone. Conflict detection compares instants, not
localized strings. Agenda editing converts a wall-clock slot in the event timezone back to UTC,
including daylight-saving transitions. Public pages state the event time, not the viewer's laptop
time.

There is a separate class of date that has no meaningful time zone, such as a form's display date
or a date-only deadline. Those renders are pinned to a locale and UTC so a server-rendered Worker and
a browser in another zone produce the same markup. Leaving the locale undefined caused React to
discard and rebuild pages during hydration. Determinism matters before localization can be added.

## Authentication, roles, and impersonation

Cicero uses magic links for every role. There are no passwords and therefore no password reset
flow, password policy, credential-stuffing surface, or forgotten password for a site a speaker may
visit four times in six months.

A magic link is single-use and expires after 30 minutes. The plaintext token is never stored; only
its SHA-256 hash reaches the database. Once consumed, it opens a 30-day, HTTP-only, same-site
session. The long session is part of the product decision. Requiring a fresh email every time a
speaker checks a task would recreate the friction magic links were meant to remove.

The cold submission path can create the user account while the proposal is being submitted. That
keeps the public form public. The speaker does not have to leave, register elsewhere, verify a
password, and find the form again. After submission, the same identity lands in the portal.

Roles are intentionally small: organizer, reviewer, and speaker. Capabilities sit above them so the
code asks whether an actor can manage an agenda or decide a submission instead of scattering role
string checks through every screen. This is not a configurable enterprise permission matrix. Cicero
does not need one yet, and building it would have added administrative surface without improving
the conference workflow.

Impersonation is a deliberate departure from Sessionboard's read-only preview. An organizer who can
only see that a speaker is stuck still has to explain the fix over email. In Cicero, the organizer
opens a real session as that speaker and can complete the work. The session stores the organizer's
identity in `impersonated_by`, shows a persistent banner, and provides one route back. Writes behave
exactly as they would for the speaker. If an impersonated session took a different code path, it
would be a preview again.

That power needs a clear boundary. Only an organizer on the event may start it, the target must also
belong to that event, and nested impersonation is refused. The attribution field exists so an audit
trail can distinguish assistance from the speaker's own action.

## Why I wrote the form engine

The form engine is one of the larger pieces of Cicero, and building it was not the obvious choice. I
surveyed SurveyJS, form.io, React JSON Schema Form, JSONForms, Formily, HeyForm, OpnForm,
Formbricks, `form-js`, and other builders. The problems were not cosmetic.

Some builders had licenses that did not fit an MIT project. SurveyJS's runtime is MIT, but its
creator is commercial per developer. Several self-hosted products are AGPL. Form.io brings a large
Bootstrap-driven runtime and an imperative model that works against the rest of the application.
The genuinely restyleable JSON-schema renderers do not include a builder, which was the part worth
renting.

More importantly, the engines assume they own the whole schema and produce one answer blob. Cicero
needs the six core proposal fields to remain relational while custom questions stay flexible. An
external engine would still have required custom locked-field behavior in its builder and custom
mapping in its runtime. At that point it would add hundreds of kilobytes and a second design system
to save a relatively small schema-walking loop.

The built-in fields therefore have form-field rows for label, order, step, requirement, and
visibility, but their values land in real submission columns. Custom answers land in JSONB. The
builder and the public runtime share one typed field contract, and the server validates the same
rules the browser uses for immediate feedback.

Conditional logic is intentionally limited. A field may depend on one earlier, unconditional field.
Conditions cannot point forward, depend on themselves, or chain through another conditional field.
This removes cycles and ambiguous evaluation order by construction. When a field becomes hidden,
its value is removed before submission. A respondent should not be judged on an answer to a
question they did not see.

Forms can have multiple steps, drafts, reusable field-library entries, file questions, per-person
submission limits, and character budgets shared across fields. Draft state is keyed by submission
identity so resuming a draft cannot accidentally reuse a blank client state from a previous page.
The server revalidates the whole form on every final submission even though the browser checks the
current step for a better interaction.

Markdown was another deliberate restraint. A full rich-text editor would be large and would still
need a sanitizer. Speaker-authored Markdown is rendered through a path that drops raw HTML and
allows only safe URL protocols. Organizer-authored portal pages have a separate trusted renderer
because the product explicitly permits an organizer to embed HTML in their own event. The two paths
are separate because trust is a security boundary, not a formatting preference.

## Review stays human even when AI is present

Review is built around independent rounds, reviewer assignments, weighted criteria, status queues,
recusal, anonymization, and workload reporting. A reviewer sees the submissions assigned to them and
does not receive accept or decline controls. Organizers retain the decision.

An untouched scorecard cannot be marked complete. A partial scorecard can be, because intentionally
skipping one criterion is a judgment. Completing one with no scores is more likely a misclick, and
counting it would make the progress report claim an opinion exists where none does. Peer scores are
hidden until a reviewer finishes their own work, which reduces anchoring while still allowing later
comparison.

The AI reviewer is advisory by construction. It writes to an `ai_review` table that human score
averages never read. Its system prompt forbids accept or reject recommendations. Speaker text is
treated as untrusted data, model output is parsed defensively, unknown criteria are dropped, and
scores are clamped to the scale requested. A malformed answer produces fewer suggestions or a clear
error, not a status change.

When an Anthropic key is absent, the review surface does not disappear and it does not pretend a
model ran. A built-in heuristic reports proposal completeness: abstract depth, whether a speaker bio
exists, how much classification is filled in, and which custom questions were answered. It labels
itself as triage and explicitly says it cannot judge whether the idea is good. This is less capable
than a model, but it is useful and honest.

## Scheduling is a warning system, not an automatic authority

The agenda works as a draftable schedule. Accepted proposals appear in an unscheduled rail, and an
organizer can drag them into a room and time. Published sessions are the only ones that reach public
programme surfaces. Drafts let a programme committee rearrange the board without sending every
experiment to speakers and attendees.

Conflict detection uses half-open intervals. A talk ending at 10:00 and another starting at 10:00
do not overlap. This small definition matters because flagging every back-to-back session would
train organizers to ignore the warning system.

Room collisions and speaker double-bookings are errors. Simultaneous sessions on the same track are
warnings: an organizer may deliberately run them together, but attendees following the track will
have to choose. None of these blocks a drop. Cicero shows the problem before release, records the
placement, and lets the organizer decide. Conference schedules contain constraints the software
does not know, and a rigid blocker can be as harmful as no warning.

The conflict algorithm is quadratic over the sessions in one event. That is the right trade for the
assumed scale of hundreds of sessions. An interval tree would be faster, harder to prove correct,
and unnecessary here.

The AI agenda builder follows the same authority model. It proposes a grid and never writes one on
its own. Every returned placement is rechecked by the same deterministic conflict detector the
board uses; invalid placements are dropped. The organizer can edit the proposal before applying it.
The model cannot know that a sponsor must not follow the keynote or that a speaker's flight lands at
noon, so pretending it can finalize the programme would be reckless.

Without a model key, a deterministic planner fills the earliest free 15-minute slot, spreading
sessions across rooms before extending the day. It is a starting grid, not an opinion about
programme quality. The same validator distrusts the local planner and the model equally.

## Calendar invitations are identity, not attachments

An "add to calendar" link is useful, and Cicero provides one. It is not enough for the organizer's
side of the workflow. If a talk moves from Wednesday to Thursday, the old event remains on the
speaker's calendar unless the calendar client recognizes the new message as a revision.

Cicero writes VCALENDAR directly because three details carry that behavior:

- `METHOD:REQUEST` makes the file an invitation rather than a passive download.
- The `UID` stays stable for the life of the scheduled session.
- `SEQUENCE` increases every time an attendee's calendar needs to see a revision.

A cancellation keeps the same UID and uses a higher sequence. A public download uses
`METHOD:PUBLISH` and omits attendees so opening it does not create a fake RSVP relationship. Lines
use CRLF endings, text values escape the characters the RFC requires, and folding happens on UTF-8
octets. These are the details that allow a file to look plausible in a text editor and still fail in
Gmail, Outlook, or Apple Calendar, so the tests assert the wire bytes.

## Tasks and files are evidence, not checkboxes

The outstanding-task dashboard is one of Cicero's most important product decisions. Sessionboard's
own FAQ says it does not provide a central task-completion report. Conference organizers end up
maintaining a spreadsheet beside the system they are paying for.

Cicero materializes task assignments when a task is created, rather than waiting for each speaker
to open the portal. That means the dashboard count changes immediately and represents the whole
audience. A task can target all speakers, accepted speakers, or selected people. Conferences can
copy a checklist from a previous event, including the file-request rules behind upload tasks.

A speaker may start, save, complete, or reopen their own task. They cannot waive it; waiving is the
organizer's decision that the work is no longer required. Upload and form tasks cannot become
complete without a file or an answer set. Reads also reconcile stored status with the evidence, so
a seed script, migration, or manual database edit cannot leave one screen saying "Done" while the
files screen says nothing arrived.

Uploads always pass through the application. That adds a hop compared with a presigned URL, but it
means every read checks the actor's role on the event. It also keeps R2, S3, and Postgres storage
behaviorally consistent. File rules accept the practical forms organizers type, such as `.pdf`,
`application/pdf`, `image/*`, or `pdf`, instead of punishing a speaker for harmless configuration
variation.

Replacement files create versions rather than overwriting the old bytes. Everything that points at
the deliverable is moved to the newest version, while a stale link to version one still resolves the
lineage. Comments attach to that lineage, so organizer feedback and the speaker's explanation of a
replacement stay together. Content edits use the same recoverability principle: the current state
is snapshotted before the edit, and restoring a revision creates another snapshot first. Even an
accidental restore can be undone.

Bulk download produces a real streaming ZIP rather than a CSV of authenticated URLs. The archive
uses STORE compression because decks, PDFs, JPEGs, PNGs, and videos are already compressed. It keeps
one file and the central directory in memory, sets the UTF-8 filename flag, separates duplicate
names into useful submission folders, and refuses path traversal. Cicero does not implement ZIP64.
The interface refuses archives above 500 files or 1 GB before streaming begins, while the writer
also protects the classic format's hard limits. A clear refusal is better than a four-gigabyte file
that downloads successfully and opens as corrupt.

## Communications fail soft without becoming invisible

Every outbound message goes through one mail interface with Resend, SMTP, and log transports. The
log transport is the default. A fresh clone and the public demo therefore have a working mailbox
without asking for an API key or a verified sending domain. The sign-in page can surface the magic
link when mail is being logged, which removes email deliverability as a dependency for evaluation.

Messages are written to `email_log` before a provider receives them. A rejected message remains
visible with its error. More importantly, a provider outage does not roll back an accepted
submission, completed task, or schedule change. The log records intent and result; mail is a
side-effect of the domain action, not the transaction that grants it permission to exist.

Templates use dotted merge fields with an optional fallback, such as
`{{speaker.firstName|there}}`. There are no template loops or conditionals. Values that need
iteration, such as an outstanding-task list, arrive pre-rendered. Unknown variables are flagged
before send. Speaker-authored values pass through the untrusted Markdown renderer before entering
an email.

Reminder jobs are idempotent. Task reminders compare the configured cadence with
`last_reminded_at`; deadline reminders check the mail log. Cloudflare Cron can call the same route a
self-hoster invokes from an ordinary crontab. At-least-once scheduling should not produce duplicate
mail.

One cold-path rehearsal found a serious event-boundary bug: the communications pages trusted an
event query parameter, and an organizer could see another event's mailbox or trigger its reminders.
The fix did not add another UI patch. It made event resolution membership-aware and required the
management capability on every posted event ID. The system-wide cron path remains able to process
all events; a human organizer never is.

## Publishing belongs outside the admin application

The organizer application is only half of the product. A conference needs a public source of truth
for sessions, speakers, and schedule changes. Published event pages require no account. The public
area includes an overview, sessions, speaker profiles, an agenda, and itinerary and gallery views.
Draft schedule rows and unapproved content do not leak into those reads.

Embeds are live server-rendered routes inside auto-resizing iframes. A small script creates the
iframe, forwards filters and style options as query parameters, and listens for its height. This is
simpler than publishing snapshots or a versioned JavaScript widget. When the programme changes, the
next page load reads current data. Nobody has to copy a new snippet.

The embed studio saves its convenience configurations in local storage, while the URL remains the
real artifact. That is an honest trade for the current scope: named configurations do not pretend to
be shared organizational data. A production collaboration feature would move them into the
database.

The REST API exposes the same public programme data and API-key-protected submission data. Public
reads allow cross-origin access and use a short edge cache because thirty seconds of staleness is
negligible for a schedule that changes on the scale of hours, while authenticated reads are never
cached. Keys are event-scoped, revocable, hashed at rest, and shown only once.

The OpenAPI schema is generated from the Zod definitions that validate requests and responses. A
checked-in `docs/openapi.json` makes the contract discoverable without a running deployment, and a
test fails if it drifts from the generator. Documentation is part of the interface, not a hand-kept
copy of it.

The marketing homepage exists for a similar reason. The original application index exposed routes
and infrastructure before it explained the product. A visitor should understand the value, see the
real organizer and public programme, and then choose the demo, sign-in, or repository path. Existing
users get an unmistakable sign-in action rather than a link hidden inside demo copy.

## Integrations are one-way where ownership is one-way

The required Accelevents integration pushes accepted speakers into the registration platform. It
does not attempt bidirectional reconciliation. Accelevents owns tickets and check-in; Cicero owns
the speaker and programme workflow. An edit made in Accelevents is theirs to keep.

Only speakers on accepted submissions are candidates. The client deduplicates by normalized email
before sending, treats Accelevents' duplicate-email response as an expected steady state, and
records each result so an organizer never mistakes a failed push for a comped speaker. A
fixture-backed fake exercises the same interface when credentials are unavailable.

The Accelevents documentation contains a real ambiguity: one section says `Key`, endpoint pages
also show `Authorization`, and there is no downloadable OpenAPI file. The client defaults to a
configurable header and retries once with the other header after a 401. It reports which one worked.
The code resolves at runtime what the documentation does not resolve on paper.

Speaker creation is the documented path and is treated as production behavior. Attendee creation
is a five-request order flow with no documented complimentary flag. Cicero implements that path
behind the same client but labels it experimental and does not place it on the required workflow.
That boundary is more useful than pretending uncertain API behavior has been verified.

Airtable is also one-way, but for a different reason. The competition rewarded Airtable support,
yet using Airtable as the primary database would make the application worse. It has no relational
transactions or joins and enforces a low request rate. Agenda conflict detection, review
assignments, and multi-row state changes do not belong there.

Cicero treats Airtable as a mirror for submissions, speakers, and sessions. Existing teams can
build familiar views over live data while Postgres remains authoritative. Mirror failures are
recorded and never fail the Cicero write that triggered them. Requests are serialized below the rate
limit. A backfill is resumable because each entity has a sync row; after a limit or failure, the next
run continues from what remains instead of starting over.

## The application is useful without paid dependencies

Several features degrade deliberately instead of vanishing:

- With no mail provider, messages go to the built-in mailbox.
- With no object store, modest uploads go to Postgres.
- With no language-model key, review uses an honest completeness heuristic and scheduling uses a
  deterministic planner.
- With no Accelevents or Airtable credentials, their panels remain visible and name the exact
  configuration they need.

I kept the surfaces visible because an absent feature is hard to evaluate and harder to configure.
The fallback must still do real work, and the interface must say what it is doing. The early version
got this wrong by calling the heuristic output an AI review and disabling the agenda assistant even
though the local planner worked. The fix was not better marketing copy. It was accurate labeling.

## Security decisions that are easy to miss in a feature tour

Most security choices in Cicero are small boundaries repeated consistently.

Session, magic-link, and API tokens are random values stored only as hashes. Event membership is
checked before event-scoped reads. Files are streamed through authorized routes. Public Markdown
drops raw HTML and filters URL protocols. Trusted organizer HTML uses a separate rendering path.
ZIP entry names remove traversal and control characters. API errors translate into stable public
messages rather than leaking stacks. The application ignores local build environment values after
it reaches a deployed Worker.

The design also avoids creating unnecessary security problems. There are no passwords to reset or
hash. There is no general-purpose template language that can execute arbitrary code. There is no
client-side direct database access. There are no presigned file URLs that remain valid after a
person loses an event role.

Some boundaries are product choices rather than technical controls. AI never decides acceptance or
publishes a schedule. Speakers cannot waive their own tasks. Reviewers do not see decision controls.
An integration failure does not erase the local action, but it remains visible in a sync log.

## How I decided what to test

The full cold-path walkthrough is the most important test because Cicero is a workflow product. It
needs a fresh browser and a new event. An already-authenticated developer session hides the exact
dead ends a new organizer or speaker will find.

Automated tests concentrate on silent failures and shared rules: calendar bytes, schedule overlap,
form visibility, hidden-answer clearing, task completion evidence, score aggregation, API schema
drift, CSV escaping, ZIP structure, import contracts, authentication redirects, and integration
mapping. These are the failures that can look successful on screen and break later in another
system.

The repository also runs lint, build, and tests in CI. The production build matters separately from
type checking because OpenNext, React Server Components, and route boundaries can fail only during a
real build. UI changes were repeatedly checked at desktop and phone widths, with specific attention
to horizontal overflow. The design-system acceptance criteria include keyboard operation, focus
restoration, dark mode, and reduced motion.

The seed data is part of verification. It is idempotent, so running it twice produces the same
events. The standard demo has enough submissions, reviewers, speakers, tasks, rooms, and schedule
gaps to exercise the product. The second event, The First Settlement, uses a Roman Senate-inspired
programme to exercise multi-event behavior and show the visual identity with data that belongs to
it.

## Decisions discovered only after using the product

The initial architecture mattered, but several of the best decisions came from walking the result
and refusing to explain away confusing behavior.

When a button was disabled because an event had no published form, the reason moved onto the page
before the organizer clicked it. When an organizer had multiple events, the default became the next
upcoming event, then the most recent past event, instead of whichever membership Postgres returned
first. When task status disagreed with file evidence, the shared read model began deriving the truth
from the evidence. When date formatting differed between the Worker and browser, locales and time
zones were made explicit across the application.

The same principle changed performance and configuration. Uploads that opened a Hyperdrive pool for
every service call began sharing one connection within a request. A local `.env` that leaked MinIO
configuration into the Worker lost the ability to override deployed variables. Communications that
could reach across events were moved behind the same membership and capability checks as every
other event operation.

These fixes share a pattern: the interface should not ask a person to understand an accidental
implementation detail. The selected event should mean the same thing in the sidebar and mailbox. A
completed upload task should have an upload behind it. A schedule date should not change because the
server and browser live in different time zones. "Something went wrong" is not an acceptable final
description when the system knows which dependency is missing.

## What I chose not to build

Cicero is not a complete replacement for every Sessionboard product line. It does not handle
payments, exhibitor or sponsor management, awards, studio production, SSO, SMS, enterprise
permission grids, or regional data residency. It does not attempt a general audit-log product. The
CRM that was added is organizer-owned rather than a shared company account with teams and
territories.

The application assumes one conference has hundreds or low thousands of submissions and tens of
reviewers. It does not shard, operate a job-queue fleet, or paginate every in-memory filter. Bulk
operations still matter, because a programme committee works across the whole review set in a
sitting, but scale theater would have made this build less reliable rather than more.

There are current limitations I would keep visible:

- The interface is English-only, and character counting is not grapheme-aware.
- Some pointer-heavy agenda actions still need a complete keyboard placement path.
- The embed studio saves configurations in the current browser rather than sharing them across an
  organization.
- The log and Postgres-storage fallbacks are excellent for a first run, not substitutes for a real
  mail provider and object store at large scale.
- Accelevents speaker push is based on the documented endpoint, while the attendee order path is
  still experimental until it can be tested with a real account.
- Campaign sending is serial inside a request. A large installation should move that work onto a
  durable queue.
- Slugs are deliberately ASCII-safe and need a better fallback for names written entirely in other
  scripts.
- The Cloudflare demo runs under a tight free-plan CPU limit. Dense cold admin renders can exceed
  it. Paying for the normal Worker limit or moving the same application to another host fixes the
  constraint without changing the data model.

I prefer this list to a claim that every box is complete. The architecture leaves clear seams for
these changes, and the current product remains useful without pretending the seams are already
filled.

## The through-line

The decisions in Cicero mostly come back to one idea: keep the human in control, but remove the
clerical work that makes conference operations miserable.

The system can propose a schedule, but it cannot publish one behind the organizer's back. It can
read a proposal, but it cannot accept or reject it. It can chase a missing deck, but the dashboard
shows what was sent and what is still missing. It can push an accepted speaker into another
platform, but it does not let that platform become the source of truth for the programme.

The same idea explains the technical choices. Postgres preserves the relationships the workflow
depends on. Event scoping keeps one conference from becoming another conference's problem. Magic
links remove a credential speakers do not want. Calendar identity turns a reschedule into an update
instead of another task for the speaker. The Roman identity makes the product recognizable, while
the working surfaces stay calm enough to use all day.

Cicero was not built to win a comparison by having the longest feature list. It was built so the
organizer can start with a blank event, finish with a public programme, and understand what happened
in between.
