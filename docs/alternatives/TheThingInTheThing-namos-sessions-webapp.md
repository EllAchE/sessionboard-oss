# TheThingInTheThing/namos-sessions-webapp

**Source:** git@github.com:TheThingInTheThing/namos-sessions-webapp.git · **Live:** https://app.namos-sessions.xyz
**Found via:** Pre-discovered repository batch supplied for this survey.
**Analyzed:** 2026-08-16 at commit e4b85d85fbf4f466b4747eb73eacee3822008ecf

## Stack

Vite single-page application with React 18 and TypeScript; Convex document database and server functions without an ORM; Tailwind CSS and Radix; Clerk authentication; React Query; optional Cloudflare Pages and Airtable transport code.

## Scale

- 495 files excluding `.git`; approximately 39,089 lines across the principal source, style, and schema file types.
- ≥194 commits (shallow clone), by 2 distinct commit authors, spanning 2026-08-08..2026-08-13.

## Feature coverage

- **CFP intake — ✓.** A working public form engine supports sections, reusable field definitions, conditions, cross-field limits, participants, server validation, idempotent submission, and confirmation scheduling.
- **Review rounds and scoring — ✓.** Evaluation plans contain multiple rounds and weighted criteria, with manual and bulk assignments, reviewer progress, and reminders.
- **Anonymized review — ~.** The review projection removes speaker names and common identity keys, but the implementation explicitly leaves possible identity text in custom answers and abstracts.
- **Decisions and notifications — ✓.** Decision mutations, onboarding-task creation, preview/send workflows, provider integration, consolidated delivery, and delivery logging are implemented.
- **Agenda and scheduling — ✓.** Agenda items can be placed, edited, published, and displayed in the speaker portal and public agenda.
- **Conflict detection — ✓.** The detector checks room, speaker, and track overlaps and speaker-declared unavailability.
- **Speaker portal and tasks — ✓.** Speakers can maintain profiles and headshots, edit allowed submission fields, declare availability, see schedules, complete forms, and manage assigned tasks.
- **Content deliverables — ✓.** Document requests use Convex storage and are connected to speaker tasks and organizer review flows.
- **Comms and templates — ✓.** Per-event templates, previews, recipient selection, scheduled delivery, reminders, provider routing, and logs are implemented.
- **Public event pages — ✓.** Published event projections back public agenda, session, itinerary, and speaker pages.
- **Embeddable widgets — ✓.** The application generates iframe snippets for public event views and renders those views without organizer chrome.
- **Public REST API — ~.** API keys and an authenticated `GET /api/v1/events` route exist, but the public API does not cover the broader event domain.
- **AI features — ✗.** The visible AI-assistance path is explicitly a stub and does not generate a score or call a model.
- **Speaker CRM — ✗.** Speaker records and directories are event-scoped; no cross-event contact pipeline or CRM record was found.
- **Sponsors — ✓.** Sponsor tiers, contacts, sponsor records, onboarding tasks, submissions, forms, and organizer CRUD flows are implemented.

## Structural choices worth recording

- Convex is the canonical backend behind a repository abstraction; the alternative Airtable adapter explicitly rejects unsupported operations and is not feature-equivalent.
- Submission forms arrange reusable global field definitions into sections, while each submission stores its answers as a document value.
- Event duplication copies tracks, submission forms, communications templates, and optionally the event team, while clearing instance-specific routing fields.

## Shipped that Cicero did not

- Event duplication copies forms, tracks, communications templates, and optionally the event team into a new event.
- Speaker availability can be collected during CFP/portal work and produces explicit unavailable-speaker scheduling conflicts.
- Sponsors have tier-specific contacts, onboarding tasks and templates, plus routing from sponsor forms and submissions to the sponsor record.

## Cicero shipped that this did not

- Model-backed review assistance and AI agenda suggestions.
- A cross-event speaker CRM with lifecycle stages and history.
- A broad versioned REST/OpenAPI surface, MCP operations, and signed outbound webhooks.
- A published sponsor wall on the public event site.

## Notes

The live URL comes from the custom-domain deployment configuration. Feature judgments use the Convex implementation because the optional Airtable transport throws for several unsupported operations. History statistics are lower bounds because the supplied clone is shallow.
