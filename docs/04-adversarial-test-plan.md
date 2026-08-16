# Cicero adversarial test plan

This is the reference plan for adversarially testing Cicero's speaker identity, agenda scheduling,
and public/API request paths.

**State:** plan and read-only audit only. No adversarial test, database write, email, integration
call, or deployed-environment probe has been run yet.

## Shareable core

### Purpose

The suite should prove that hostile, malformed, ambiguous, and merely unusual input cannot:

- merge two people because their names look alike;
- hide or misattribute an agenda conflict;
- create a partial or duplicate record after a retry or concurrent request;
- execute markup, formulas, templates, or query syntax in a downstream surface;
- escape event, authorization, time-range, pagination, or resource boundaries;
- make a public page, email, calendar invite, export, log, or integration unusable.

The suite is invariant-driven rather than a collection of novelty strings. Every payload must name
the invariant it challenges and assert both the response and the resulting state.

### Product invariants

1. A speaker's identity is an immutable id/account association, never a display-name comparison.
2. Distinct speakers may have identical display names and must remain independently addressable.
3. Blank display names have an explicit fallback; whitespace never becomes a meaningful identity.
4. Validation failures are controlled and leave no partial writes.
5. Conflict semantics are consistent across preview, persistence, publication, and notification.
6. Retries and concurrent submissions have deterministic, documented outcomes.
7. Request parsing is strict and bounded; authorization and event scoping are reapplied at the
   service/database boundary.
8. Stored text stays inert when rendered, searched, logged, emailed, exported, or synchronized.
9. Errors disclose neither private speaker data nor implementation details.

### Current contract decisions to preserve or explicitly change

- Cicero identifies a global account by normalized email and an event participant by
  `(event_id, user_id)`. Same-named speakers are supported; the same email is one account.
- A blank display name is allowed and falls back to the account name, email, or `Speaker` depending
  on the surface.
- Agenda intervals are half-open: a session ending at 10:00 and another starting at 10:00 do not
  overlap.
- Room and speaker overlaps are classified as errors and track overlaps as warnings, but conflicts
  intentionally do **not** block an agenda write. Tests should prove detection and organizer
  override behavior unless the product decision changes; they should not silently redefine the
  contract as hard rejection.
- Cancelled sessions do not participate in conflict detection.

### Adversarial matrix

#### Speaker names and identity

| Class | Cases | Assertions |
|---|---|---|
| Presence | missing, `null`, empty, spaces/tabs/newlines only | documented fallback or field error; no blank identity key |
| Length | 1, 119, 120, 121, 10,000, and 1,000,000 characters | one consistent limit at every write path; rejection before persistence or fan-out |
| Unicode | accented and decomposed forms, CJK, Arabic/Hebrew, right-to-left marks, emoji, ZWJ sequences, skin tones, combining marks | round-trip fidelity; usable initials, sorting, searching, links, and layout |
| Invisible/control | zero-width joiners/spaces, bidi overrides, tabs, CR/LF, NUL, other C0 controls | reject or visibly normalize by policy; no spoofed UI/log/export rows |
| Symbols only | punctuation, currency/math symbols, emoji only, quotes and slashes | no crash; deterministic fallback avatar and slug |
| Equivalence | exact same name on different ids; case, whitespace, punctuation, diacritic, normalization, and homoglyph variants | no identity merge; search behavior is explicit and stable |
| Injection | HTML/script, Markdown links/images, template braces, SQL/NoSQL fragments, shell-like strings, log-forging newlines | inert text on every downstream surface |
| Spreadsheet | values beginning `=`, `+`, `-`, `@`, tab, or CR; formula links and command-style formulas | exported cells open as text, never formulas |

Run each representative name through every ingress and egress, not just the profile form:

- public CFP web submission and submission API;
- organizer create/edit and CSV import;
- speaker self-service profile edit and co-speaker sharing;
- roster, task picker, agenda, review, public speaker list/detail, gallery, and embeds;
- search, sorting, slugs, metadata titles, avatars, and greetings;
- email merge fields and magic-link mail;
- ICS attendee parameters;
- CSV/report exports, audit history, logs, and external integrations.

#### Agenda conflicts and lifecycle

- exact duplicate interval;
- partial overlap on either side;
- one interval fully containing another;
- same start or same end;
- endpoint-touching intervals, which should not conflict;
- same room, same track, and same speaker, separately and together;
- same speaker id with changed name and different speaker ids with the same name;
- multi-speaker sessions sharing one participant;
- cancelled, draft, and published sessions;
- move, unschedule, cancel, restore, and reschedule into an existing conflict;
- invalid, reversed, zero-duration, very long, cross-midnight, leap-day, and DST gap/overlap times;
- simultaneous placement of the same submission and simultaneous overlapping placements;
- retry after timeout, repeated request, stale editor state, and notification failure after a write.

For the current non-blocking contract, assert that the write succeeds, the complete conflict set is
stable, the organizer sees the correct severity, and publication/notifications do not conceal the
conflict. If conflicts become blocking later, add an atomic persistence invariant rather than a
check-then-insert application race.

#### Request and query attacks

- repeated keys and parameter pollution (`q=a&q=b`, scalar versus array);
- unknown parameters and unexpected nested/array-shaped values;
- empty keys/values, malformed and double percent encoding, invalid UTF-8, and embedded NUL;
- oversized URLs, query values, lists, and JSON bodies;
- negative, fractional, exponential, `NaN`, infinite, and excessive pagination/limit values;
- extreme date ranges and invalid dates/timezones;
- encoded path separators, dot segments, foreign ids, and guessed UUIDs;
- SQL/NoSQL/template fragments in filters and search strings;
- cross-event ids, unauthorized draft/cancelled-state reads, and cache-key isolation;
- content-type mismatch, malformed JSON, duplicate JSON keys, deep nesting, and excessive object
  cardinality;
- retry storms, reused idempotency keys, and rate-limit behavior.

Assert bounded work as well as correctness: rejected input should fail early, avoid database or mail
fan-out, return the documented `4xx` shape, and omit stack traces, secrets, and unrelated records.

### Safe execution sequence

Do not start with end-to-end writes. Progress only when the previous layer is deterministic:

1. **Pure unit tests:** name normalization/initials/slugs/search, CSV-cell safety, interval overlap,
   conflict classification, query-option parsing, and Markdown/ICS formatting.
2. **Mocked service tests:** validation, identity resolution, event scoping, idempotency, and failure
   ordering with database, mail, storage, and integrations replaced by fakes.
3. **Isolated database integration tests:** a disposable Postgres database per run, transactional or
   uniquely namespaced fixtures, `MAIL_TRANSPORT=log`, fake domains, and no external credentials.
4. **Browser tests:** a seeded local application using the same disposable database; exercise
   layout, accessibility names, search, and navigation for the hostile fixtures.
5. **Concurrency tests:** real database constraints and coordinated barriers around the write point;
   assert committed state, not just HTTP responses.
6. **Optional deployed smoke:** only in a purpose-built non-production event with explicit approval,
   bounded fixtures, disabled external sends/syncs, and cleanup proven in advance.

Record the seed and minimized payload for every fuzz/property failure. Promote each discovered bug
to a small permanent regression case.

### Exit criteria

- Invalid input never produces an unhandled `5xx` or a partial write.
- Every ingress enforces the same documented name limit and blank-name policy.
- Same-named speakers remain distinct in assignment, conflict detection, search, links, and exports.
- All conflict shapes produce the documented decision and stable, complete diagnostics.
- Concurrent/retried operations cannot create an unintended duplicate or lose an update.
- No hostile value executes or changes structure in HTML, Markdown, email, ICS, CSV, logs, or an
  integration payload.
- Query/body work is bounded and cannot cross event or authorization boundaries.
- Failures contain no stack trace, secret, raw database error, or unnecessary personal data.
- The deterministic suite runs in CI; longer fuzz, concurrency, and load suites have an owned
  cadence and failure-triage path.

## Current Cicero audit

Read-only review against commit `1b78092` on 2026-08-12. These are hypotheses to turn into tests,
not evidence from executed payloads.

Source map for the audit:

- identity and speaker writes: `db/schema.ts`, `lib/services/participants.ts`, and
  `lib/services/portal.ts`;
- public/API ingress: `app/(public)/submit/actions.ts`, `app/api/v1/_lib/schemas.ts`, and
  `app/api/v1/events/[slug]/forms/[formId]/submissions/route.ts`;
- agenda conflicts and placement: `lib/services/schedule.ts`, `app/organizer/agenda/actions.ts`, and
  `db/schema.ts`;
- public names, slugs, search, and avatars: `app/embed/model.ts`, `app/embed/queries.ts`, and
  `components/ui/Avatar/index.tsx`;
- email, calendar, CSV, and request parsing: `lib/services/comms.ts`, `lib/markdown.ts`, `lib/ics.ts`,
  `lib/csv.ts`, `lib/services/dashboard.ts`, and `app/api/v1/_lib/respond.ts`.

### Highest-priority likely failures

1. **Unbounded names can bypass the 120-character profile limit.** `profileSchema` limits
   `displayName` to 120 characters, but the public CFP server payload and
   `createSubmissionBody.name` do not impose the same bound. `user.name` and
   `participant.display_name` are unbounded PostgreSQL `text`. A very large name can therefore be
   persisted through the public/API path and fan out into mail, public reads, reports, and
   integrations even though profile editing would reject it.
2. **CSV formula injection is likely.** Both CSV writers quote commas, quotes, and newlines but do
   not neutralize cells beginning with `=`, `+`, `-`, or `@`. Speaker names and other exported text
   can therefore be interpreted as formulas when an organizer opens a report in a spreadsheet.
3. **Emoji/astral initials are likely malformed.** Both avatar helpers use `word[0]`, which selects
   one UTF-16 code unit rather than a complete grapheme. Emoji-only names and some complex scripts
   can render a replacement glyph or misleading initial.
4. **Names can inject Markdown presentation into email.** Speaker names are interpolated into
   Markdown before the untrusted renderer runs. Script/raw-HTML injection is blocked and unsafe URL
   schemes are filtered, but a name containing Markdown link/image/emphasis syntax can still alter
   a magic-link or campaign email's presentation and introduce an allowed `https` link/image.
5. **Concurrent placement can duplicate one submission on the agenda.** Placement checks for an
   existing scheduled row and then inserts, while the schema has no unique constraint on
   `scheduled_session.submission_id`. Two concurrent placements can both pass the check. The
   per-event reference allocator remains atomic, so the result would likely be two distinct session
   rows rather than a constraint failure.

### Medium-priority behavior to pin down

- Interior newlines, tabs, zero-width characters, bidi controls, and symbol-only names pass the
  profile schema. They are React text rather than HTML, but can distort greetings, email merge
  fields, sorting, audit presentation, and public layouts.
- Public/embed speaker-name styles do not consistently apply wrapping or ellipsis. Long unbroken
  names are likely to overflow or expand cards even where the organizer roster truncates them.
- `speaker.firstName` and the portal greeting split on a literal space, not Unicode whitespace or
  graphemes. Tab/newline-separated and many non-Western names will produce poor greetings.
- REST query parsing collapses repeated keys with `Object.fromEntries`, and ordinary Zod objects
  ignore unknown keys. Embed parsing takes the first array value and leaves search/filter strings
  and comma-separated list cardinality unbounded. These paths appear resistant to SQL injection
  because filters are exact in-memory comparisons or Drizzle parameters, but their ambiguity and
  resource bounds need tests.
- All-Unicode or symbol-only public names collapse to the id-only slug. This is stable and unique,
  but not human-readable. Sorting uses a Latin-family-name heuristic and will be culturally poor for
  some names even if it remains deterministic.
- Same-email speaker creation is intentionally idempotent and updates the existing event
  participant. A test must distinguish a harmless retry from an attempt to represent two different
  people who share an inbox.

### Existing defenses that should become regression tests

- Same-named speakers are keyed by participant id, public slugs append an id fragment, and speaker
  conflicts compare participant ids. Equal names should neither merge identities nor create false
  conflicts.
- Blank managed-profile names become `null` and public surfaces fall back to account name/email or
  `Speaker`; blank names are unlikely to crash the current read model.
- Managed profile writes trim fields and reject display names over 120 characters before updating.
- React renders names as text. Speaker-authored Markdown drops raw HTML and filters executable URL
  schemes, so straightforward `<script>` and `javascript:` payloads should remain inert.
- ICS attendee names use RFC 6868 escaping and lines fold by UTF-8 octet count; commas, quotes,
  newlines, accents, and long multibyte names already have a deliberately defensive formatter.
- Conflict detection is id-based, ignores cancelled sessions, and uses half-open intervals.
- API list limits are bounded where exposed, error translation returns structured public errors,
  and unauthenticated public speaker payloads omit email addresses.

## Test-run safety gate

The current Vitest suite is safe primarily because existing service tests mock the database and
many tests are pure. A browser or service test that reaches the real application is different:

- local configuration can point `DATABASE_URL` at a shared Neon/Postgres database;
- mail transport is selected from runtime environment and is not forcibly replaced in test mode;
- speaker creation and public submission can write users, participants, memberships, tokens,
  submissions, email-log rows, and agenda rows;
- publishing/moving sessions can generate real email and calendar updates;
- configured Airtable, Accelevents, storage, or AI credentials create additional external effects.

Before any adversarial write test runs, prove all of the following in the test process itself:

- the database host/name matches an allowlisted disposable target and refuses any shared/prod URL;
- `MAIL_TRANSPORT=log` and external integration/AI credentials are absent;
- addresses use a reserved fake domain and no provider transport is reachable;
- fixtures carry a unique run id and cleanup is event-scoped;
- no migration, seed reset, or broad delete runs against a shared database;
- concurrent tests use only their own event and verify cleanup after both success and failure.

Until that gate exists, restrict implementation to pure and fully mocked tests. Do not aim the
payload corpus at a deployed event simply because individual strings look harmless.

## Sharing note

The **Shareable core** is intentionally product- and vendor-neutral enough to circulate. Before
external sharing, remove this implementation audit or refresh it against the released commit, and
strip internal ticket/repository identifiers if the audience should not receive them.
