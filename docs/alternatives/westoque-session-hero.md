# westoque/session-hero

**Source:** git@github.com:westoque/session-hero.git · **Live:** None recorded in the repository

**Found via:** Pre-discovered repository batch supplied for this survey.

**Analyzed:** 2026-08-16 at commit f0c1e02371b2464997cc9115337311cc606ce4fa

## Stack

Ruby on Rails 8.1 monolith with Active Record and SQLite; HAML, Hotwire, and Stimulus; Tailwind CSS with daisyUI; Devise password authentication; Active Storage; Sidekiq/Solid Queue; Resend email delivery.

## Scale

- 343 files excluding `.git`; approximately 11,922 lines across the principal Ruby, HAML, JavaScript, CSS, and schema file types.
- 47 commits, by 1 distinct commit author, spanning 2026-08-11..2026-08-13.

## Feature coverage

- **CFP intake — ✓.** Public dynamic forms include conditional fields, draft/resume handling, persisted answers, and submission-confirmation mail.
- **Review rounds and scoring — ✓.** Rounds, weighted criteria, reviewer pools and assignments, automatic distribution, conflicts of interest, progress reporting, and CSV export are implemented.
- **Anonymized review — ~.** The reviewer view hides its dedicated speaker block, but still renders the unredacted abstract and every submitted answer, which can contain identity information.
- **Decisions and notifications — ~.** Accept, reject, and waitlist states work, and generic templates/composer delivery exists, but deciding a submission does not itself send a decision notification.
- **Agenda and scheduling — ✓.** Accepted submissions can be placed manually or by a deterministic automatic scheduler using rooms and time ranges.
- **Conflict detection — ✓.** The scheduling report checks room and speaker collisions.
- **Speaker portal and tasks — ✓.** A global speaker portal supports invitations, profiles, assigned sessions, and tasks that can be completed or reopened.
- **Content deliverables — ✓.** Active Storage uploads have versions, comments, approval states, bulk ZIP export, and reminder flows.
- **Comms and templates — ✓.** Message templates, a recipient composer, logs, reviewer reminders, and deliverable reminders have working delivery paths.
- **Public event pages — ✓.** Public event, session, speaker, agenda, itinerary, and gallery pages are implemented.
- **Embeddable widgets — ✓.** Organizer embed tooling provides iframe views together with JSON and iCalendar feed links.
- **Public REST API — ✗.** JSON and calendar feeds exist, but no versioned public REST domain API or API authentication surface was found.
- **AI features — ~.** The recorded “AI” review signal is a deterministic character-count heuristic; it does not call a model.
- **Speaker CRM — ✓.** Owner-scoped contacts support import, merge, segments, pipeline state, and bulk email, separately from event speakers and global speaker profiles.
- **Sponsors — ✗.** No sponsor or exhibitor model, route, or user interface was found.

## Structural choices worth recording

- Global speaker profiles, owner CRM contacts, and event-specific speaker participation are separate records.
- Accepted submissions carry their own room and start/end scheduling fields rather than producing separate agenda-item records.
- The application is a server-rendered Rails monolith whose Active Record models and controllers own behavior that other projects place in service and API layers.

## Shipped that Cicero did not

- The public demo creates a separate, self-expiring event sandbox per visitor, with rate limits, a global cap, and a recurring purge job.
- Proposal title and abstract edits create restorable history snapshots, with an organizer action to restore an earlier version.
- The organizer embed screen directly exposes JSON and iCalendar feed links beside iframe snippets.

## Cicero shipped that this did not

- Sponsor and exhibitor CRM with public sponsor presentation.
- A versioned public REST/OpenAPI surface and MCP operations.
- Actual model-backed review and agenda assistance rather than a stored heuristic.
- Consent-aware SMS and signed outbound webhooks.

## Notes

The supplied clone reports that it is not shallow, so its 47 reachable commits are reported as an exact count. Decision mail is available through the general communications system but is intentionally separate from the state-changing decision action.
