# Cicero user roles and actions

This document describes who uses Cicero, what each user can do, and where Cicero's responsibility
ends. It consolidates the actor-level behavior in the
[competition brief](reference/source-brief.txt), the detailed
[requirements](01-requirements.md), and the current implementation.

The requirements remain authoritative for competition scope. Behaviors labelled **current
implementation** describe the application as it exists in this repository and are not additional
competition requirements.

## Product intent

Cicero is the conference team's operating system for moving from a call for speakers to a published
program. It replaces the part of Sessionboard used between "we should run a CFP" and "the agenda is
on the event website."

The organizer is the primary customer and operator. Speakers collaborate with the organizer through
the submission and onboarding workflows. Reviewers contribute scores through a restricted surface.
Public visitors either submit a proposal or consume the published program without an account.

Cicero is not a ticketing or general attendee-management application. Accelevents remains responsible
for ticket sales, registration, badges, and check-in.

## Purpose and status of this requirements discussion

The purpose of this discussion was to make the product boundary operationally clear before more
features are built: identify every user, define the actions each user needs, explain how published
program content reaches the existing event website, and settle the direction of the Accelevents
integration.

Those product questions are resolved in this document. No requirement remains to turn Cicero into a
full event website, attendee app, ticketing system, or bidirectional Accelevents editor. Discount
codes are also not a requirement.

The remaining work is validation and implementation work rather than another actor-model decision:

- Exercise the Accelevents integration with live credentials to establish exactly how attendee
  access, speaker ticket types, complimentary registration, and badges behave.
- Decide whether the conference's real registration process needs a selected ticket type or another
  attendee-access call. Add discount-code support only if that process proves it necessary.
- Continue closing the implementation and deployment gaps tracked in the
  [README](../README.md#known-gaps). Those gaps do not change the role boundaries below.

## Actor model

| Actor                  | Relationship to Cicero                                      | Authentication                                    |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Public program visitor | Reads the published conference program                      | None                                              |
| Prospective speaker    | Starts a proposal through a public CFP                      | None initially; account created during submission |
| Speaker / participant  | Maintains their proposal, profile, files, and assigned work | Magic link                                        |
| Reviewer               | Scores only the proposals assigned to them                  | Magic link                                        |
| Organizer / admin      | Configures and operates the conference program              | Magic link                                        |

The requirements formally name organizer/admin and speaker/participant as the two core authenticated
roles. Reviewers are a constrained supporting workflow: they can score assigned proposals but do not
receive organizer powers merely by being reviewers.

## End-to-end lifecycle

1. An organizer creates an event and configures its tracks, rooms, formats, tags, dates, and timezone.
2. The organizer builds and publishes one or more call-for-speakers forms.
3. A prospective speaker reaches a public form, creates an account in the flow, and submits a talk.
4. The speaker enters the portal to maintain their profile, submission, headshot, slides, and other
   requested material.
5. Reviewers score the proposals assigned to them using organizer-defined criteria and rounds.
6. The organizer accepts or declines proposals.
7. The organizer assigns onboarding tasks to accepted speakers and monitors their completion.
8. The organizer places accepted sessions on the agenda and resolves room, track, and speaker
   conflicts.
9. Cicero sends confirmations, reminders, acceptance or decline messages, and calendar invitations.
10. The organizer publishes the program to standalone public pages and embeds it into the existing
    event website.
11. When configured, the organizer can push accepted speakers one way into Accelevents.

## Public visitors

Public visitors never receive administrative access. There are two distinct public journeys.

### Browse the published program

A conference attendee or other visitor can view published information without a Cicero account:

- Agenda grid organized by day, time, and room.
- Chronological schedule itinerary.
- Session list and session descriptions.
- Speaker list and individual speaker details.
- Speaker gallery.

In the current implementation, a public visitor can also:

- Search sessions by talk, speaker, or topic and filter the results.
- Search speakers by name, company, or talk and open a complete speaker profile.
- Star sessions to build a personal itinerary stored in that browser.
- Export the personal itinerary as an `.ics` calendar file.

The required public output is mobile-friendly and embeddable. The requirements make the speaker
gallery and schedule itinerary required, while public session and speaker lists are important. The
current implementation exposes five corresponding views: `agenda`, `itinerary`, `sessions`,
`speakers`, and `gallery`.

Public visitors cannot:

- View draft or otherwise unpublished program content.
- Edit sessions, speakers, or the agenda.
- Complete speaker tasks.
- Review proposals.
- Buy tickets or check in through Cicero.
- Access organizer, reviewer, or speaker-only pages.

### Submit through a public CFP

A prospective speaker can:

- Open a public, unauthenticated, shareable CFP URL.
- Read the welcome text, deadline, and remaining-submission information when configured.
- Progress through Welcome, Account, Submission, Participant, and Review steps.
- Enter the proposal title, description, format, track, tags, level, and custom answers requested by
  the organizer.
- Add participant or co-speaker details when the form enables them.
- Save a draft and resume later.
- Review the complete proposal before final submission.
- Create an account inside the submission flow and continue directly into the speaker portal.

Once the account exists, that person acts as a speaker/participant rather than an unauthenticated
visitor.

## Speakers and participants

Speakers use Cicero to provide information and complete work requested by the conference team. They
do not operate the conference program.

### Account and portal access

A speaker can:

- Sign in through a short-lived, single-use magic link rather than a password.
- Keep a long-lived authenticated session appropriate for returning weeks later.
- Access the portal for each event in which they participate.
- See organizer-authored information and resource pages.

### Profile and identity

A speaker can:

- Edit their biography and other profile information.
- Maintain salutation, honorific, pronouns, and gender. All four are always available and none is
  required.
- Correct their own first and last name, which the call for speakers captures as two fields and
  which the name every other surface renders is recomposed from.
- Add LinkedIn, X, Facebook, personal website, and other profile links.
- Record a phone number and choose whether to receive notifications by email, by SMS, or both.
- Upload or replace their headshot.

### Proposals and sessions

A speaker can:

- View their submissions and each submission's current status.
- See the session reference, title, and format.
- Edit a submitted proposal when the event permits it.
- Withdraw their own proposal when they are its primary speaker.
- View the published time and location of an accepted session.
- Use an add-to-calendar link.
- Receive a calendar invitation that updates the existing calendar entry when an organizer
  reschedules the session.

The requirements do not give speakers the ability to accept their own proposal, choose their final
time or room, or publish a session.

### Files and deliverables

A speaker can:

- Upload slides and supporting documents attached to their session.
- Respond to named file requests such as "Upload presentation slides."
- Review organizer feedback associated with requested material where provided by the workflow.
- Download prior file versions, reply to organizer comments, and upload a new version without
  overwriting the earlier artifact in the current implementation.

### Tasks

Tasks are not a fixed global checklist. Organizers define them for an event and assign them to
accepted speakers. The requirements give "Hotel and Travel Reservations" and "Presentation Upload"
as examples.

Every task has completion state visible to both the assigned speaker and the organizer. Tasks can be
scoped to a contact, group, or submission. An organizer may also set instructions, a due date,
whether the task is required, and reminder timing.

Speakers can save progress on form tasks before submitting them. A file or form task cannot be
marked complete without its required evidence, while acknowledgement and external-link tasks
complete only after an explicit speaker confirmation. A speaker can reopen a task they completed,
and an organizer can waive one that no longer applies rather than leaving it owed forever.

The current implementation supports four task shapes:

| Task kind       | Speaker action                              | Example                                      |
| --------------- | ------------------------------------------- | -------------------------------------------- |
| Form            | Answer an organizer-built form              | Submit travel and hotel details              |
| File upload     | Upload one or more requested files          | Upload final presentation slides             |
| Acknowledgement | Check off an item with no separate artifact | Acknowledge the speaker agreement            |
| External link   | Follow a link to an outside process         | Complete an external release or booking flow |

Current assignment audiences are all event participants, accepted speakers, or selected individual
speakers.

### Speaker boundaries

A speaker cannot:

- Configure the event or CFP.
- View or score other speakers' proposals unless separately acting as a reviewer.
- Accept or decline submissions.
- Assign tasks to other speakers.
- Move sessions on the agenda.
- Publish the program or configure embeds.
- Push records to Accelevents.

## Reviewers

Reviewers are deliberately narrower than organizers. A reviewer can:

- See proposals assigned through the organizer's evaluation plan.
- Read the proposal information appropriate to the current review mode.
- Score proposals against organizer-defined criteria.
- Participate in independent review rounds with different assignments or scorecards.
- Submit or revise their own score while the round allows it.
- Recuse themselves from an assignment in the current implementation.

Blind and author-anonymized review modes may hide speaker identity from reviewers. Reviewers do not
gain event configuration, acceptance, scheduling, communication, or publishing controls. Final
acceptance decisions remain with organizers.

## Organizers and administrators

Organizers control the program from event setup through publication.

### Configure the event

An organizer can:

- Create an event with a name, public slug, a start and end instant, and timezone. Start and end are
  required and carry a time of day, not only a date.
- Add website, location, event-type, and theme metadata.
- Upload a logo and banner or background image.
- Configure event-scoped tracks, rooms, tags, session formats, personas, and the reusable custom
  field library. All six are managed from the same settings surface.
- Define room capacities and the values speakers or admins select on submissions and sessions.
- Record sponsors and exhibitors with logos and a display order. Both appear on the public wall at
  `/{slug}/sponsors`, grouped by tier in that order. New rows are drafts; an organizer explicitly
  publishes or unpublishes each row from the sponsor board.
- Switch between events when multi-event support is enabled.

An organizer cannot currently set the speaker portal's own appearance — logo, accent colour, welcome
copy, and support address exist per event but are written by the seeds alone.

### Build and publish the CFP

An organizer can:

- Create multiple independent forms for an event.
- Target a form at abstracts or sessions.
- Enable or disable participant collection.
- Rename, reorder, and toggle Required on the built-in proposal and participant fields. Built-ins
  are seeded on every form rather than chosen, and cannot be deleted or retyped, because their
  answers are stored on real columns the roster, queue, agenda, and embeds read. First name, last
  name, and email cannot be made optional either — they are what identify the person.
- Add custom fields with field types and per-field character limits, and drag questions out of a
  reusable per-event field library.
- Apply a shared character limit across a group of fields, not only per field.
- Add conditional show/hide rules based on earlier answers.
- Define participant roles, minimums, maximums, and overall participant limits.
- Configure the welcome screen: internal name, external title, a page heading capped at 15
  characters, and a rich welcome message with a show/hide toggle. There is no configurable success
  page — after submitting, a speaker sees a fixed confirmation and is redirected into the portal.
- Set an open and a close date.
- Cap submissions per submitter, allow or forbid drafts, and name the addresses notified on each new
  submission.
- Publish the form at a public URL.
- Configure submission confirmation behavior.

Payments, fees, and invoices are explicitly excluded from the CFP.

### Manage submissions and review

An organizer can:

- Browse proposals by all, pending, accept queue, accepted, waitlist, decline queue, declined,
  withdrawn, or draft state.
- Search, sort, and filter the submission list, choose which columns it shows, and save a tab,
  filter, sort, and column selection together as a named view.
- Define evaluation plans that route categories or tracks to reviewer pools.
- Create multiple independent review rounds.
- Define weighted or otherwise structured scorecard criteria.
- Inspect scores and reviewer progress.
- Commit accept, waitlist, or decline decisions, individually or in bulk. The accept and decline
  queues are derived from review completeness and score rather than staged by hand; an organizer
  cannot currently place a submission in a queue manually.
- Manually add invited talks that did not enter through the public CFP.
- Import sessions, export submission data, and download submitted files in bulk. These are always
  available; none of them is behind a feature switch.
- Read an advisory AI assessment of a proposal alongside the human scores. It never decides, and
  where no model key is configured the surface says so rather than disappearing.

### Manage speakers and onboarding

An organizer can:

- View the speaker roster and each speaker's associated sessions.
- Identify incomplete profiles, missing headshots, missing travel information, overdue tasks, and
  absent deliverables.
- Create, edit, and assign tasks.
- Assign tasks to all participants, accepted speakers, or selected individuals in the current
  implementation, and independently choose whether each of them owes one answer as a contact, one
  per session, or one shared across a session's speaking team.
- Pin a task to a single named session, so only that session's speakers are asked for it.
- Create portal forms and file requests.
- Author portal information and wiki pages, including trusted HTML embeds.
- View task completion state.
- Send reminders to speakers with outstanding work.
- Inspect versioned speaker deliverables, leave comments, and review revised uploads in the current
  implementation.
- Impersonate a speaker to diagnose or complete a stuck workflow on their behalf.

Impersonation is full, attributable action rather than a read-only preview. Anything changed while
impersonating is saved as the speaker while retaining the organizer's identity for attribution.

### Build and modify the agenda

An organizer schedules **sessions**, not speakers as independent calendar objects. Because each
session carries its speakers, moving a session also moves those speakers' conference commitment.

An organizer can:

- See accepted talks waiting in an unscheduled queue.
- Drag an accepted session onto a day, time, and room.
- Drag a scheduled session to a different time or room.
- Edit its title, start time, end time, room, track, and capacity.
- Remove a session from the schedule without deleting it.
- Create a session manually for a keynote, break, lunch, or invited talk.
- Inspect list, day, week, room, track, and conflict views.
- Detect overlapping use of the same room.
- Detect track clashes.
- Detect a speaker assigned to overlapping sessions.
- Keep sessions in draft while rearranging them.
- Publish individual sessions or a day of sessions.
- Return published sessions to draft or cancel them.
- Ask for an AI-proposed placement for the unscheduled queue. The proposal is advisory and writes
  nothing: every placement it suggests is re-checked through the same conflict detector the board
  uses and dropped if it clashes, and with no model key a local planner produces the same shape of
  suggestion.

Therefore, for the concrete question "Can an organizer look at a particular speaker's time and move
them?": the organizer can locate that speaker's session and move the session to another time or room.
The conflict detector warns if the new placement double-books the speaker.

The requirements do not define:

- A separate speaker-availability calendar such as "available only after 2 PM."
- A required agenda view grouped or filtered solely by speaker.
- Moving a speaker without moving the session to which they are attached.
- Automatically finding a slot from travel availability or personal calendar data.

Those would be additional product features rather than required interpretations of the brief.

### Communicate with speakers

An organizer can:

- Create and edit reusable email templates with merge fields.
- Trigger submission confirmation, acceptance, waitlist, decline, task reminder, and draft-deadline
  messages. Confirmation and decision notices fire from the action itself; an hourly Cloudflare
  Cron Trigger runs the two reminder jobs autonomously through the same scheduled-job route that a
  self-hosted timer can call.
- Send an ad hoc message to a filtered audience, such as all accepted speakers or everyone with an
  open task.
- Reach speakers by SMS as well as email where a Twilio-style provider is configured. Templates
  carry a separate short-message body, speakers opt in per person, and the composer can address a
  channel deliberately. SMS has its own delivery log alongside the email one.
- Inspect the send log to determine what was sent to whom and when.
- Send real `.ics` calendar invitations.
- Resend an invitation with a higher sequence so a rescheduled session updates the existing calendar
  entry rather than creating a duplicate.
- Withdraw an invitation: cancelling or unpublishing a scheduled session automatically sends a
  cancellation that removes the entry from the speaker's calendar rather than leaving a stale one.

### Monitor readiness

An organizer can use the dashboard to see:

- Accepted speakers with outstanding tasks and the specific tasks they owe.
- Submission and acceptance counts.
- Sessions that have not yet been scheduled.
- Speakers missing a biography or headshot.
- Missing rooms or times.
- Room, track, and speaker conflicts.
- Broader review, schedule, and submission reports when optional dashboard features are enabled.

The narrow outstanding-task report is required. The broader analytics suite is optional.

### Publish the program

An organizer can publish:

- Agenda grid.
- Schedule itinerary.
- Session list.
- Speaker list.
- Speaker gallery.

The public output can be linked directly or placed inside an existing event website. Cicero is the
program layer, not a replacement for the entire marketing, registration, sponsor, venue, or travel
website.

### Embed into the existing website

The current implementation's recommended embed consists of a placeholder and a script:

```html
<div data-cicero-embed="agenda" data-event="my-conference"></div>
<script src="https://cicero.example.com/embed.js" async></script>
```

The script creates an iframe pointing at a route such as
`/embed/my-conference/agenda`. The iframe reads current published data when it loads. Changes to
published sessions or speakers therefore appear without copying a new snippet. The embedded page
reports its height to the host page with `postMessage`, allowing the script to resize it without a
nested scrollbar.

For content-management systems that reject custom JavaScript, the organizer can copy a plain,
fixed-height iframe instead.

### Integrate with Accelevents

Accelevents is the required integration, but it is not the only one on that screen: where an
Airtable base is configured, speaker, submission, and session rows are mirrored one way into it,
with a backfill control and its own sync log. Everything below concerns Accelevents.

The required attendee-registration integration has one direction:

```text
Cicero program and accepted speaker data -> Accelevents registration
```

An organizer can configure the integration, test its connection, inspect the accepted-speaker list
and sync log, and manually choose **Push accepted speakers**.

The current speaker push:

- Sends accepted speakers only.
- Creates Accelevents speaker records from Cicero profile data.
- Sends name, email, title, company, bio, pronouns, headshot URL, social links, and attendee-access
  intent where available.
- Records successful and failed attempts.
- Avoids pushing a speaker already recorded as successfully synced because Accelevents rejects a
  duplicate email rather than updating the existing record.

It does not:

- Import event, attendee, ticket, or check-in data from Accelevents.
- Reconcile changes made in Accelevents back into Cicero.
- Continuously synchronize after every Cicero edit.
- Push the full agenda as part of the accepted-speaker operation.
- Allow a speaker to initiate the push.

The repository contains three role-scoped agent skills. `explore-cicero-event` uses only public GET
operations. `manage-cicero-speaker-work` uses the signed-in speaker's own session for private reads
and every proposal/profile/task mutation. `manage-cicero-event` uses an event-scoped integration key
to normalize an Accelevents-shaped program payload and call Cicero's program-reconcile endpoint.
That organizer workflow is a separate inbound import through Cicero's own API, not readback from the
Accelevents vendor API and not part of the required accepted-speaker push. Each skill checks the
deployed OpenAPI first and stops if its operation is absent.

### Discount codes and speaker registration

Discount-code configuration is not part of the competition requirements and is not exposed by the
current Cicero integration. Accelevents has coupon-management APIs, but its documented attendee-order
flow does not clearly document how an integration applies a coupon during order creation.

Accelevents' speaker model instead exposes attendee-access and speaker-ticket-type concepts. The
current required path sends speaker access intent; a separate attendee-order client exists as an
experimental path and models a comp as a zero-priced ticket type rather than a discount code.

Before claiming that the integration guarantees a comped ticket or badge in a real Accelevents
event, the team should validate with live credentials whether:

1. Attendee access alone provisions what the conference expects.
2. An organizer must select a particular Accelevents ticket type.
3. A dedicated attendee-access endpoint must be called after speaker creation.

Discount codes should be added only if the conference team confirms that they are the operational
mechanism used for speaker registration.

## Permission summary

| Action                                 | Public visitor | Speaker | Reviewer |                          Organizer |
| -------------------------------------- | -------------: | ------: | -------: | ---------------------------------: |
| Browse published program               |            Yes |     Yes |      Yes |                                Yes |
| Start a public CFP submission          |            Yes |     Yes |       No |                                Yes |
| Edit own profile and proposal          |             No |     Yes |       No | Through attributable impersonation |
| Upload speaker deliverables            |             No |     Yes |       No | Through attributable impersonation |
| Complete assigned speaker tasks        |             No |     Yes |       No | Through attributable impersonation |
| Score assigned proposals               |             No |      No |      Yes |                                Yes |
| Accept, waitlist, or decline proposals |             No |      No |       No |                                Yes |
| Configure forms and review rounds      |             No |      No |       No |                                Yes |
| Assign speaker tasks                   |             No |      No |       No |                                Yes |
| Move sessions on the agenda            |             No |      No |       No |                                Yes |
| Publish agenda and speaker data        |             No |      No |       No |                                Yes |
| Configure website embeds               |             No |      No |       No |                                Yes |
| Push accepted speakers to Accelevents  |             No |      No |       No |                                Yes |
| Buy tickets or check in through Cicero |             No |      No |       No |                                 No |

## Explicit non-goals

The requirements deliberately exclude:

- Ticket sales, payments, fees, and invoicing.
- Full attendee registration and check-in.
- Design fidelity to Sessionboard.
- Awards, studio, and marketing modules.
- Sessionboard-style autonomous AI agents.
- Complex event-team role and permission administration.

Two items this list previously carried were later built on purpose, and are called out rather than
quietly deleted:

- **Speaker CRM.** Excluded by the first requirements pass, then reversed — a full contact database
  lives above the event layer at `app/crm/*`. See [`decisions-long-form.md`](decisions-long-form.md).
- **Sponsor and exhibitor entities.** Organizer-facing CRUD and the public wall at `/{slug}/sponsors`
  both exist. `E-7` in [`01-requirements.md`](01-requirements.md) is the governing row.

Optional capabilities should not displace the required end-to-end journey. A plain workflow that
gets an organizer and speaker from CFP through publication without a dead end is more important than
deep functionality in any one screen.

## Source map

- [Goals and end-to-end workflow](00-goals.md)
- [Tagged requirements and resolved ambiguities](01-requirements.md)
- [Architecture and Accelevents research](02-architecture.md)
- [Accelevents API contract](reference/accelevents-api.md)
- [Frozen competition brief](reference/source-brief.txt)
- [Sessionboard coverage survey](reference/sessionboard-survey.md)
- Current task behavior: `app/admin/tasks/TaskEditor.tsx`
- Current agenda behavior: `app/admin/agenda/AgendaBoard.tsx`
- Current embed behavior: `public/embed.js` and `app/embed/`
- Current Accelevents behavior: `lib/accelevents/` and `app/admin/integrations/`
