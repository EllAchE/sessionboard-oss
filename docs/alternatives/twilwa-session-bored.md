# twilwa/session-bored

**Source:** <https://github.com/twilwa/session-bored> · **Live:** <https://session-bored.techwilliams-warren.workers.dev>
**Found via:** provided survey batch; discovery was completed before analysis
**Analyzed:** 2026-08-16 at commit `4c0bcc5`

## Stack

A Vite 8 React 19 single-page application and a Hono 4 Cloudflare Worker, written in TypeScript 7. Drizzle ORM targets Cloudflare D1/SQLite, with R2-backed uploads. The UI uses project-local React components and plain CSS. Better Auth provides email/password accounts and same-origin sessions. Review assistance calls Anthropic when its optional model binding is configured.

## Scale

About 80,100 lines across tracked TypeScript, JavaScript, CSS, and SQL files; 320 tracked files; ≥50 commits (shallow clone); 1 distinct commit author; commit span 2026-08-11..2026-08-15.

## Feature coverage

- ✓ **CFP intake:** organizers build and publish versioned forms with conditions and file questions; submitters create accounts, save drafts, submit, edit, and withdraw through persisted routes.
- ✓ **Review rounds and scoring:** multiple rounds, weighted criteria, reviewer provisioning and assignments, conflicts, draft scorecards, submission, reopening, and aggregate progress are implemented.
- ✓ **Anonymized review:** blind-round routes return a redacted submission projection and keep identity out of both the human and AI review inputs.
- ✓ **Decisions and notifications:** organizers preview and queue decision letters, delivery workers claim and send them durably, and unsent letters can be cancelled and replaced without losing the audit record.
- ✓ **Agenda and scheduling:** tracks, rooms, blocks, drag placement, deterministic auto-placement, publication state, public schedule data, and iCalendar output are connected.
- ✓ **Conflict detection:** placement checks detect speaker, room, availability, and capacity conflicts and distinguish blockers from overridable warnings.
- ✓ **Speaker portal and tasks:** role-aware speaker pages expose assignments, profile editing, session information, deadlines, task evidence, and downloads.
- ✓ **Content deliverables:** link/form/file evidence, R2 uploads, file versions, organizer comments and decisions, finalization, and ZIP export are implemented.
- ✓ **Comms and templates:** reusable templates, recipient selection, previews, decision letters, reminders, retries, and delivery logs are backed by database state.
- ✓ **Public event pages:** public event, CFP, schedule, itinerary, speaker, and personal-schedule routes consume published read models.
- ✓ **Embeddable widgets:** saved token-addressed session, itinerary, agenda, speaker, and gallery views have configurable fields/colors plus a cross-origin iframe loader with height messaging.
- ✗ **Public REST API:** `/api/public` and other JSON routes support the first-party SPA and widgets, but there is no versioned external developer API, API-key scope model, or OpenAPI contract.
- ✓ **AI features:** Anthropic-backed review assistance stores advisory summaries, criterion suggestions, reasoning, fingerprints, attribution, errors, and freshness independently from human reviews.
- ✓ **Speaker CRM:** the people directory supports organization-wide contacts, event roles, tags, notes, custom fields, segments, imports, sourcing stages, and collision-aware merge planning.
- ✗ **Sponsors:** no sponsor or exhibitor domain, management surface, or public view was found.

## Structural choices worth recording

- One Hono Worker serves the SPA assets and all API routes, while the browser application remains a conventional Vite client.
- Forms are immutable version snapshots with normalized question definitions and answer rows; editing a form produces a new version rather than mutating submitted structure.
- Authorization is the union of explicit event role grants. An attendee is modeled as an authenticated user without organizer, reviewer, speaker, or submitter privileges.
- AI suggestions live in a separate fingerprinted table and are passed back as an identified starting point when a reviewer saves a scorecard.
- Embed configurations are persisted records with public tokens and a loader script rather than query-string-only view configurations.

## Shipped that Cicero did not

- Password-based signup and sign-in through Better Auth; Cicero's account flow is magic-link-only.
- Authenticated attendee accounts whose selected sessions persist in D1 and synchronize across devices, with local storage retained as the anonymous fallback; Cicero's personal schedule is local-storage-only.
- An enforced human-choice boundary for AI score suggestions: the server rejects a scorecard until every unchanged suggested criterion has been explicitly confirmed or edited; Cicero keeps AI analysis separate but has no equivalent per-criterion confirmation workflow.
- Cancellation of an unsent decision notice with a recorded reason and optional recipient correction, followed by a separately reviewed replacement letter while the retired letter remains auditable.

## Cicero shipped that this did not

- A versioned, API-key-scoped public REST API with an OpenAPI contract.
- Sponsor and exhibitor management with public sponsor surfaces.
- AI-assisted agenda construction; Session Bored's agenda auto-placement is deterministic.
- SMS communication with consent, verification, and quiet-hour enforcement.
- Signed outbound webhooks and recording-management workflows.
- Accelevents synchronization and an Airtable mirror.
- An MCP server and packaged agent skills for program operations.

## Notes

The live URL is recorded in Wrangler configuration, CI, and the README; it was not fetched during this survey. The file and LOC totals use tracked files only and exclude `.git`. History is depth-limited, so the commit count is a lower bound.
