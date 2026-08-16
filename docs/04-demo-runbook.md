# Cicero demo runbook

This is the presenter-ready walkthrough for proving that Cicero can replace the part of
Sessionboard the AI Engineer team actually uses. It covers the required organizer-to-publication
spine first, then shows API and automation work as bonus value. The source of truth for scope is
[`01-requirements.md`](01-requirements.md); the public Sessionboard survey is supporting context,
not an extra scope list.

> **Status on 12 August 2026.** The existing `demo` event is live. The Roman Senate event and the
> two program-reconciliation routes are not deployed from `main` yet. At the last approved
> read-only check, `/first-settlement` returned 404. Do not imply otherwise. Re-run the preflight
> after the relevant PRs are approved, merged, deployed, and seeded.

## Demo charter

**Objective.** In 25 minutes, prove the full flow from a cold organizer and cold speaker through
review, scheduling, communication, onboarding, publication, and the required one-way Accelevents
speaker push. Then show safe, idempotent program updates and agent operation as added bonuses.

**Audience.** AI Engineer event operators, competition judges, and technical evaluators who care
about migration, integration safety, and self-hosting.

**Claim discipline.** Say “required” only for rows tagged `[REQUIRED]` in the requirements. The
public API is competition bonus `Z-5`. Inbound Accelevents-shaped reconciliation and agent operation
are added bonuses. Accelevents event/session/speaker CRUD is a deterministic fixture demonstration,
not verified live Accelevents support. The verified live integration supports speaker create and
list only.

**Presenter roles.**

- The **driver** shares the browser, terminal, and calendar client.
- The **narrator** names the requirement being proved and watches time.
- The **producer** opens fallback tabs, watches the mailbox and public pages, and records checkpoint
  results. For a two-person demo, the narrator also acts as producer.

**Duration.** Plan for 25 minutes plus five minutes of questions. The required flow occupies the
first 20 minutes. Bonus segments are the first material to cut.

## Live entry points and expected status

The production base URL is <https://cicero-three.vercel.app>.

| Purpose | URL | Pre-demo expectation |
| --- | --- | --- |
| Home | <https://cicero-three.vercel.app> | Live |
| Organizer sign-in | <https://cicero-three.vercel.app/signin?email=organizer%40example.com&next=/admin> | Live; submit `organizer@example.com`; the page returns the demo magic link |
| Organizer dashboard | <https://cicero-three.vercel.app/admin> | Live after sign-in |
| Captured demo mail | <https://cicero-three.vercel.app/admin/mail> | Live after sign-in |
| Existing public demo | <https://cicero-three.vercel.app/demo> | Live fallback |
| Existing demo agenda | <https://cicero-three.vercel.app/demo/agenda> | Live fallback |
| Existing public CFP | <https://cicero-three.vercel.app/submit/demo/speak> | Live fallback |
| Existing agenda embed | <https://cicero-three.vercel.app/embed/demo/agenda> | Live fallback |
| Existing public agenda API | <https://cicero-three.vercel.app/api/v1/events/demo/agenda> | Live fallback |
| Live OpenAPI | <https://cicero-three.vercel.app/api/v1/openapi.json> | Live; proves whether a provisional route is deployed |

The First Settlement seed was approved and run against production on 2026-08-15, so these links are
live. Statuses below were re-verified against the deployment that same day:

| Purpose | URL | Status |
| --- | --- | --- |
| Public Roman event | <https://cicero-three.vercel.app/first-settlement> | Live |
| Public agenda | <https://cicero-three.vercel.app/first-settlement/agenda> | Live |
| Session list | <https://cicero-three.vercel.app/first-settlement/sessions> | Live |
| Speaker directory | <https://cicero-three.vercel.app/first-settlement/speakers> | Live |
| Speaker gallery | <https://cicero-three.vercel.app/first-settlement/gallery> | Live; 307 to `speakers?view=gallery`, which is the canonical route |
| Itinerary | <https://cicero-three.vercel.app/first-settlement/itinerary> | Live |
| Public CFP, “Order of Debate” | <https://cicero-three.vercel.app/submit/first-settlement/motions> | Live |
| Agenda embed | <https://cicero-three.vercel.app/embed/first-settlement/agenda> | Live |
| Speaker embed | <https://cicero-three.vercel.app/embed/first-settlement/speakers> | Live |
| Public agenda API | <https://cicero-three.vercel.app/api/v1/events/first-settlement/agenda> | Live |

The seed in [`../db/seeds/first-settlement.ts`](../db/seeds/first-settlement.ts) creates **The First
Settlement**, a Europe/Rome event around the January 27 BCE settlement. It includes eleven motions,
six accepted speakers, six additional confirmed dummy gallery profiles, five published sessions, an
unscheduled accepted motion, review, speaker tasks, portal resources, recorded communications, and
Roman-themed tracks, rooms, and formats. The twelve database-backed gallery profiles are evenly
split between women and men. Its dates advance to the current or next January anniversary. Fixed
2027 dates in the provisional API fixture are demonstration inputs, not a claim that they match the
moving seed.

The committed Roman seed has one configured review round and its CFP does not have a conditional
field. The existing `demo` seed has the prebuilt conditional form and multiple review rounds. Use
that event for those two requirement proofs unless an approved rehearsal has prepared disposable
Roman records; do not imply they ship in the Roman seed by default.

## Prerequisites and approval gates

Use a dedicated browser profile. Open the organizer browser, an incognito speaker browser, the
terminal, and a real calendar client before screen sharing. Keep the existing `demo` public pages
open as the no-mutation fallback.

Have these values available without displaying them:

```bash
export CICERO_BASE_URL='https://cicero-three.vercel.app'
export CICERO_EVENT_SLUG='first-settlement'
export CICERO_PROGRAM_FILE='docs/fixtures/first-settlement-accelevents-program.json'
# Load CICERO_API_KEY from the approved secret store; never paste it into notes or shell history.
```

The following are production actions and each needs separate, explicit approval. Planning or
approving this runbook does not approve any of them.

| Action requiring approval | Exact scope to approve |
| --- | --- |
| Merge and deploy | Name every PR and the target production worker |
| Seed the Roman event | A reviewed, targeted operation that affects only slug `first-settlement` and its known demo identities |
| Create a demo API key | One event-scoped key for `first-settlement`, with an owner and expiry/revocation plan |
| Live rehearsal | Every production create, update, delete, email, calendar, fixture reset, or integration mutation to be exercised |
| Real Accelevents push | The named Accelevents event and the accepted speakers that will be created or treated as already present |

Never run the full `npm run db:seed` against production. The full seed removes and recreates known
demo identities and their events. The targeted seed is proposed in
[`PR #50`](https://github.com/EllAchE/sessionboard-oss/pull/50), which was open, ready, mergeable,
and green when this runbook was written. After review and merge, its commands are:

```bash
bun run db:seed:first-settlement
bun run db:seed:first-settlement --apply --confirm=first-settlement
```

The first command is a dry-run. The second creates or replaces only the named Roman fixture, but it
still requires separate production approval and an explicit `DATABASE_URL`; the PR is not deployed
merely because it is green. Database migrations remain a human-run operation and are not part of
this demo.

## Run of show

The checkpoint column tells the producer what must be visibly true before the driver moves on.

| Time | Segment | Presenter action and line | Checkpoint |
| --- | --- | --- | --- |
| 0:00–1:30 | Required: value first | Sign in as `organizer@example.com`, select **The First Settlement** if deployed, and open the dashboard. Say: “Sessionboard has no central task-completion report; Cicero starts with the accepted speakers who still owe us something.” | Outstanding people, exact tasks, counters, and linked actions are visible. |
| 1:30–3:00 | Required: organizer cold start | In a fresh profile, sign up with an approved disposable address. Create an event, set dates/timezone, then add two tracks, two rooms, and a format. Return to the seeded organizer. | A new organizer reaches event creation without an invitation; tenant separation is evident. |
| 3:00–5:00 | Required: event and CFP configuration | Open Roman Admin → Settings and Order of Debate to show branding, taxonomy, required fields, and a custom field. Switch to the seeded `demo` form for the prebuilt conditional rule and routed track/category, unless approved disposable Roman configuration was prepared. | Event-scoped taxonomy and conditional/routed form configuration are visible without overstating the Roman seed. |
| 5:00–7:00 | Required: cold submission | In incognito, use the seeded `demo` CFP to trigger its conditional question, or `/submit/first-settlement/motions` if an approved Roman condition was prepared. Start cold, progress through the multi-step flow, review, and submit. | Account is created in-flow; confirmation is captured; redirect reaches the portal. |
| 7:00–9:30 | Required: speaker self-service | Show Home, Submissions, Profile, Tasks, and portal resources. Update a disposable bio, upload approved headshot/slides, complete a task, and show an organizer-authored HTML resource. Demonstrate **View portal as** and return to Admin Mode. | Profile/file/task changes are visible to both roles; impersonation can perform work and is reversible. |
| 9:30–12:30 | Required: evaluation | Use the seeded `demo` event for its two rounds, or an approved disposable Roman second round. Show routed reviewer assignments, scorecard criteria, named scores, round one, queue state, round two, and acceptance. | The submission moves through multi-round evaluation to accepted; acceptance mail appears. |
| 12:30–15:30 | Required: agenda | Show the unscheduled rail, drag a disposable accepted session into a slot, provoke room/track and speaker conflicts, switch among list/day/week/room/track views, then return to a valid slot. Keep changes draft until the approved publish moment. | Three conflict classes are visible; draft is private; publish exposes only the intended version. |
| 15:30–17:30 | Required: communications and calendar | Show templates, task reminder, filtered manual audience, and send log. Open the attached `.ics` in a real calendar, reschedule the same session, then show stable `UID` and increased `SEQUENCE`. | The original calendar item updates rather than duplicating; the send log records it. |
| 17:30–18:30 | Required: dashboard closure | Return to the dashboard and show that the completed task left outstanding work while remaining auditable on the speaker. | Dashboard reflects the write without a report rebuild. |
| 18:30–20:00 | Required: public output | Open event, sessions, speakers, gallery, agenda, itinerary, and embeds signed out. Show the changed title/time in public agenda and embed without replacing the iframe snippet. | Public and embedded surfaces agree, work without auth, and reflect publication. |
| 20:00–21:30 | Required: Accelevents outbound | Admin → Integrations → **Push accepted speakers**. Use fixture mode unless a real push was separately approved. Explain verified live scope: speaker create/list, duplicate email treated as already present. | Summary shows `created`, `alreadyThere`, `skipped`, and `failed`; log retains outcomes. |
| 21:30–23:00 | Bonus: Accelevents-shaped program update | Show live OpenAPI first. If the provisional reconcile route exists, preview the First Settlement collection, apply the approved change, repeat for no-ops, and verify the public agenda. | Stable external IDs yield create/update/delete/no-op; second applied run is idempotent. |
| 23:00–24:00 | Bonus: full outbound CRUD fixture | If deployed, reset the deterministic fake Accelevents program, preview drift, safely apply creates/updates, approve the fixture delete, and repeat. Never describe this as live remote support. | Response says `adapter: "fake"`; expected counts and final all-noop result are visible. |
| 24:00–25:00 | Bonus and close | Show the `$manage-cicero-event` prompt, then summarize: open source, Cloudflare deployed, self-hostable, no passwords, API bonus, safe automation. | Audience can name the replacement spine and added value. |

If the Roman event is still 404, do not attempt a production seed during the presentation. Use the
existing `demo` event for the required browser flow, show the Roman seed and expected links as the
prepared scenario, and state exactly which approval remains.

## Requirement-to-demo traceability

| Demo proof | Classification | Requirement rows | Visible evidence |
| --- | --- | --- | --- |
| Deployed entry point and organizer cold start | Required | `D-3`, `E-1`, `T-2`, `T-4`, `T-4a`, `T-7a` | Deployment, on-page magic link, new event screen |
| Event details and tracks, rooms, tags, formats | Required | `E-1`, `E-4` | Settings and Roman taxonomy |
| Form builder, conditional logic, routing, fields | Required | `F-1`–`F-8` | Roman form/taxonomy plus `demo` conditional form |
| Cold submission and account creation | Required | `P-1`–`P-4` | Incognito multi-step submission and portal redirect |
| Draft/resume, review, redirect, confirmation | Important | `F-11`, `F-12`, `P-6`, `P-7` | Draft, review, mail, portal |
| Profile, files, portal pages/HTML | Required | `S-1`–`S-7`, `T-5` | Speaker portal and deliverables |
| Full organizer impersonation | Required | `S-10` | Complete a task as speaker; return to Admin Mode |
| Speaker tasks and completion | Required | `S-14`, `S-15` | Portal tasks and organizer state |
| Statuses, scoring, rounds, evaluation plans | Required | `V-1`–`V-5`, coupled to `F-3` | Queue, scorecard, assignments, acceptance |
| Agenda placement, conflicts, views, fields | Required | `A-1`–`A-4`, `A-7` | Drag, room/track/speaker warnings, view switcher |
| Unscheduled queue and draft/publish | Important | `A-5`, `A-6` | Accepted motion rail; signed-out before/after |
| Templates, messages, ICS update | Required | `C-1`–`C-4`, `T-6` | Mail, audience, ICS, stable UID/raised sequence |
| Outstanding-task dashboard | Required | `B-1`, `S-14`, `S-15` | Before/after task state |
| Public gallery, itinerary, live embeds | Required | `G-1`–`G-3` | Signed-out pages and unchanged embed URL |
| Accepted-speaker Accelevents push | Required | `N-1`, `N-1a`, `N-1b` | Real client contract through deterministic fake |
| Live Accelevents push | Optional | `N-1c` | Only with credentials and mutation approval |
| Public read/write API | Bonus | `Z-5` | OpenAPI, Bearer key, preview/apply/idempotency |
| Inbound Accelevents-shaped reconcile | Added bonus | Not a brief requirement | Stable source IDs, merge/replace, deletion controls |
| Agent-managed event change | Added bonus | Not a brief requirement | OpenAPI, preview, approval, verification, rollback |
| Full event/session/speaker CRUD | Fixture bonus | Not verified live Accelevents capability | `adapter: "fake"` and deterministic reset only |

## Added-value moments versus Sessionboard

| Moment | What it proves |
| --- | --- |
| Lead with outstanding tasks | Cicero supplies a central completion view the incumbent's FAQ says it lacks. |
| Passwordless cold paths | Infrequent speakers do not create and forget another password; evaluation needs no inbox. |
| Full impersonation | Support can finish a stuck task; the live session identifies the organizer, but durable per-action attribution remains a documented hardening gap. |
| Speaker double-booking | Cicero protects against the public failure, not only room and track collisions. |
| Stable calendar UID and sequence | Rescheduling updates an accepted calendar entry instead of creating a stale duplicate. |
| Live server-rendered embeds | Public pages and iframes update from one source without replacing markup. |
| Preview, confirmation, idempotency | Accelevents migration and automation show their work before touching a published program. |
| Honest fixture boundary | Deterministic orchestration is proved without inventing undocumented live capabilities. |

## Bonus API segment: Accelevents-shaped program reconciliation

This contract is implemented in
[`PR #53`](https://github.com/EllAchE/sessionboard-oss/pull/53) but remains **unavailable live until
that PR is reviewed, merged, and deployed and the deployed OpenAPI contains the path**. The endpoint
accepts Accelevents-shaped program records as JSON so field validation, identifiers, and preview
output are explicit and reproducible. Treat this as a provisional deployment segment until those
gates pass.

### Proposed contract

`POST /api/v1/events/{slug}/program/reconcile` uses an event-scoped Bearer API key.

- `source` is `accelevents`.
- `mode` is `merge` by default or `replace`.
- `apply` defaults to `false`; preview is mandatory in the demo.
- Every session carries a stable `externalId` and the complete required field set. `description`,
  `startsAt`, `endsAt`, `room`, `track`, `format`, and `ceuCredits` are present but may carry explicit
  `null` where the schema permits it.
- `merge` upserts supplied records and deletes only IDs in `deleteExternalIds`.
- `replace` also reports source-managed IDs missing from `sessions`. If that creates deletes,
  application is blocked until `confirmDeleteMissing` is exactly `DELETE_MISSING_SESSIONS`.
- Taxonomy references resolve to an event-scoped ID or an exact name after trimming and
  case-insensitive comparison. Ambiguous or missing names are row errors.
- A published session requires start, end, and room. One invalid row blocks the entire write.
- Sessions created by an organizer, CFP, or another integration are never inferred missing.

The proposed response is:

```json
{
  "data": {
    "source": "accelevents",
    "mode": "replace",
    "applied": false,
    "canApply": true,
    "requiresDeleteConfirmation": false,
    "summary": {
      "create": 3,
      "update": 0,
      "delete": 0,
      "noop": 0,
      "error": 0
    },
    "operations": [
      {
        "externalId": "ae-first-settlement-101",
        "action": "create",
        "sessionId": null,
        "changes": ["title", "status", "startsAt", "endsAt", "room", "track", "format"],
        "message": null
      }
    ]
  }
}
```

Counts depend on current event state. Verify that `error` is zero, `canApply` is true, and every
operation matches the intended source record rather than memorizing the illustrative counts.

### First Settlement demonstration input

PR #53 includes the safe request fixture
`docs/fixtures/first-settlement-accelevents-program.json` and its preview-only response fixture
`docs/fixtures/first-settlement-accelevents-program-preview-response.json`. Its initial
full-collection preview uses three fixed demonstration records. The base request deliberately omits
`confirmDeleteMissing`:

```json
{
  "source": "accelevents",
  "mode": "replace",
  "apply": false,
  "sessions": [
    {
      "externalId": "ae-first-settlement-101",
      "title": "Opening of the Senate: The Powers Returned",
      "description": "The consuls lay the first motion before the assembled Senate.",
      "status": "published",
      "startsAt": "2027-01-13T08:00:00.000Z",
      "endsAt": "2027-01-13T08:45:00.000Z",
      "room": "Curia Julia",
      "track": "Constitution & Office",
      "format": "Oratio",
      "ceuCredits": null
    },
    {
      "externalId": "ae-first-settlement-102",
      "title": "The Provinces Requiring Command",
      "description": "A full-collection record that can be updated in place by its Accelevents id.",
      "status": "published",
      "startsAt": "2027-01-13T09:30:00.000Z",
      "endsAt": "2027-01-13T10:00:00.000Z",
      "room": "Curia Julia",
      "track": "Provinces & Frontiers",
      "format": "Relatio",
      "ceuCredits": null
    },
    {
      "externalId": "ae-first-settlement-103",
      "title": "Counsel on the Shape of Peace",
      "description": "Agrippa and Maecenas answer questions from the consular committee.",
      "status": "published",
      "startsAt": "2027-01-13T13:00:00.000Z",
      "endsAt": "2027-01-13T14:00:00.000Z",
      "room": "Portico of Octavia",
      "track": "Peace & Public Works",
      "format": "Consilium",
      "ceuCredits": null
    }
  ],
  "deleteExternalIds": []
}
```

The fixed dates make exact output comparable; they do not track the anniversary dates generated by
the Roman seed. Confirm they fall inside the deployed event before applying, or use a separately
reviewed fixture update.

| Accelevents source value | Request field | Rule |
| --- | --- | --- |
| Accelevents session ID | `externalId` | Required, stable, never derive from a title |
| Session title/description | `title`, `description` | Title is a string; description is required but may be `null` |
| Publish state | `status` | `draft`, `published`, or `cancelled` |
| Start/end | `startsAt`, `endsAt` | Required fields; ISO 8601 with offset or `Z`, or explicit `null` |
| Room/track/format | Same names | Required fields; event-scoped ID, exact trimmed case-insensitive name, or `null` |
| CEU credits | `ceuCredits` | String or explicit `null` |
| Deleted source record | `deleteExternalIds[]` | Explicit in merge mode; never infer from a blank record |

### Copy-ready preview, apply, repeat, and verification

First prove that the route exists in the deployed contract:

```bash
curl --fail-with-body --silent --show-error \
  "${CICERO_BASE_URL:?set CICERO_BASE_URL}/api/v1/openapi.json" \
  | jq -e '.paths["/events/{slug}/program/reconcile"].post'
```

Preview the full collection:

```bash
curl --fail-with-body --silent --show-error \
  -X POST \
  -H "Authorization: Bearer ${CICERO_API_KEY:?set CICERO_API_KEY}" \
  -H 'Content-Type: application/json' \
  --data-binary "@${CICERO_PROGRAM_FILE:?set CICERO_PROGRAM_FILE}" \
  "${CICERO_BASE_URL}/api/v1/events/${CICERO_EVENT_SLUG:?set CICERO_EVENT_SLUG}/program/reconcile" \
  | jq
```

Stop if `canApply` is false, `error` is nonzero, a taxonomy value did not resolve, or a delete is
surprising. For a collection with no inferred deletes, apply the reviewed payload by changing only
`apply`:

```bash
jq '.apply = true' "${CICERO_PROGRAM_FILE}" \
  | curl --fail-with-body --silent --show-error \
      -X POST \
      -H "Authorization: Bearer ${CICERO_API_KEY:?set CICERO_API_KEY}" \
      -H 'Content-Type: application/json' \
      --data-binary @- \
      "${CICERO_BASE_URL}/api/v1/events/${CICERO_EVENT_SLUG}/program/reconcile" \
  | jq
```

Repeat the applied request. Expect create/update/delete/error zero and all supplied records `noop`.
Then verify that only published records appear publicly:

```bash
curl --fail-with-body --silent --show-error \
  "${CICERO_BASE_URL}/api/v1/events/${CICERO_EVENT_SLUG}/agenda" \
  | jq
```

To demonstrate update, change the description or time for `ae-first-settlement-102`, preview, apply,
repeat, and verify. To demonstrate an explicit merge delete, preview one known source-managed ID:

```bash
jq -n '{
  source: "accelevents",
  mode: "merge",
  apply: false,
  sessions: [],
  deleteExternalIds: ["ae-first-settlement-103"]
}' \
  | curl --fail-with-body --silent --show-error \
      -X POST \
      -H "Authorization: Bearer ${CICERO_API_KEY:?set CICERO_API_KEY}" \
      -H 'Content-Type: application/json' \
      --data-binary @- \
      "${CICERO_BASE_URL}/api/v1/events/${CICERO_EVENT_SLUG}/program/reconcile" \
  | jq
```

Do not change that example to `apply: true` without separate live-mutation approval. A replace that
would delete missing source-managed sessions remains blocked with `applied: false`, `canApply:
false`, and `requiresDeleteConfirmation: true`, even if an ordinary request sets `apply` to `true`.
Name every missing external ID. Only after separate delete approval, add both `apply: true` and the
exact confirmation phrase:

```bash
jq '.mode = "replace"
    | .apply = true
    | .confirmDeleteMissing = "DELETE_MISSING_SESSIONS"' \
  "${CICERO_PROGRAM_FILE}" \
  | curl --fail-with-body --silent --show-error \
      -X POST \
      -H "Authorization: Bearer ${CICERO_API_KEY:?set CICERO_API_KEY}" \
      -H 'Content-Type: application/json' \
      --data-binary @- \
      "${CICERO_BASE_URL}/api/v1/events/${CICERO_EVENT_SLUG}/program/reconcile" \
  | jq
```

If the path is absent from live OpenAPI, stop. Show the proposed contract and fixture from the
checked-out implementation PR, then use the existing public GET agenda. Do not call an undocumented
route, create a production key, or bypass the application with a database write.

## Required Accelevents outbound segment

The requirement is one-way accepted-speaker push: Cicero → Accelevents. Choose the Roman event,
open Admin → Integrations, inspect accepted speakers, and click **Push accepted speakers** only in
the approved environment.

The real client is based on Accelevents speaker create/list at
`POST/GET /rest/host/event/{eventUrl}/speaker`. Duplicate-email error `4068906` is a successful
deduplication outcome: Cicero reports `already_there` and leaves the remote record untouched. The
visible summary is `created`, `alreadyThere`, `skipped`, and `failed`, with a per-speaker log. A real
push is optional `N-1c`; credentials are not required to prove client/interface/fixture path
`N-1a`/`N-1b`.

Without real credentials, use `ACCELEVENTS_FAKE=1` in a dedicated approved environment and exercise
the same UI. If unavailable, show the accepted-speaker list, mapping, and recorded test output; do
not substitute an unverified remote endpoint.

## Added fixture bonus: full Accelevents-shaped CRUD

This bonus is implemented in
[`PR #42`](https://github.com/EllAchE/sessionboard-oss/pull/42), whose lint, build, and test checks
were green when this runbook was written. Until it is merged and deployed, it remains a fallback-
ready bonus rather than a live claim.

```text
POST /api/v1/events/{slug}/integrations/accelevents/program
Authorization: Bearer <event API key>
Content-Type: application/json
```

It always returns `adapter: "fake"`. It models event, session, and accepted-speaker create/update/
delete/no-op against a deterministic remote fixture. It is not a claim that Accelevents' live API
supports those operations.

Reset and preview the known drift:

```bash
jq -n '{mode: "preview", allowDeletes: false, resetFixture: "drifted"}' \
  | curl --fail-with-body --silent --show-error \
      -X POST \
      -H "Authorization: Bearer ${CICERO_API_KEY:?set CICERO_API_KEY}" \
      -H 'Content-Type: application/json' \
      --data-binary @- \
      "${CICERO_BASE_URL}/api/v1/events/${CICERO_EVENT_SLUG}/integrations/accelevents/program" \
  | jq
```

The reset rewrites the **fake remote fixture state even though mode is `preview`**. Describe it as
fixture setup/reset followed by reconciliation preview, not as a wholly side-effect-free request.
For the seeded First Settlement, desired remote state is one event, five published sessions, and
six accepted speakers: twelve records. Expected reset-preview counts are:

```json
{
  "create": 7,
  "update": 3,
  "delete": 1,
  "noop": 2,
  "blockedDeletes": 0
}
```

Safely apply creates and updates while blocking the orphan delete:

```bash
jq -n '{mode: "apply", allowDeletes: false}' \
  | curl --fail-with-body --silent --show-error \
      -X POST \
      -H "Authorization: Bearer ${CICERO_API_KEY:?set CICERO_API_KEY}" \
      -H 'Content-Type: application/json' \
      --data-binary @- \
      "${CICERO_BASE_URL}/api/v1/events/${CICERO_EVENT_SLUG}/integrations/accelevents/program" \
  | jq
```

Expected counts remain create 7, update 3, delete 1, noop 2, with `blockedDeletes: 1`. The ten safe
changes apply and the orphan remains. With separate approval for the fixture delete, apply with
`allowDeletes: true`: create 0, update 0, delete 1, noop 12. Repeat and expect create/update/delete
0 and noop 12, all unchanged. Reset by resending the first request. There is no production
Accelevents rollback or migration behind this fixture. If the route is absent, omit this segment and
use the required accepted-speaker UI.

## Added agent bonus: `$manage-cicero-event`

The portable workflow landed through
[`PR #38`](https://github.com/EllAchE/sessionboard-oss/pull/38) with green lint, build, and test
checks. Its [official repo skill](../.agents/skills/manage-cicero-event/SKILL.md) lives at
`.agents/skills/manage-cicero-event/SKILL.md`. It stops when live OpenAPI does not expose the write
route, so use the manual read-only fallback until the inbound API is deployed.

The skill inspects live OpenAPI first, keeps the event key in `CICERO_API_KEY`, previews every
change, requests separate approvals for writes/deletes/outbound effects, replays for no-ops,
verifies public output, and builds an inverse rollback. A reversible prompt is:

```text
$manage-cicero-event

Use the live Cicero OpenAPI to manage exactly this event:

- Base URL: <CICERO_BASE_URL>
- Event slug: first-settlement
- Expected event name: The First Settlement
- Source: accelevents
- Mode: merge

Prepare one Accelevents-sourced published session:

{
  "externalId": "demo-consult-the-auspices-v1",
  "title": "Consult the Auspices",
  "description": "A fifteen-minute recess before the Senate resumes the order of debate.",
  "status": "published",
  "startsAt": "2027-01-13T12:00:00+01:00",
  "endsAt": "2027-01-13T12:15:00+01:00",
  "room": "Curia Julia",
  "track": "Peace & Public Works",
  "format": "Relatio",
  "ceuCredits": null
}

Inspect the live OpenAPI and target event first. Preview only and show the exact operation. Do not
apply until I separately approve it. After approval, apply, replay to prove it is a no-op, verify
the public event, sessions, agenda, page, and embed, then propose an explicit-delete rollback for
only demo-consult-the-auspices-v1. Do not execute rollback without fresh approval. Never expose the
API key.
```

Verification is not “the POST returned 200.” Confirm the second run is a no-op and inspect public
event, session list, agenda API/page, and embed. Rollback is a previewed merge request whose
`deleteExternalIds` contains only `demo-consult-the-auspices-v1`; apply it only after fresh delete
approval, then verify public absence. Email and calendar effects may not be reversible and must be
named before the first apply.

## Reset and rollback

Capture before evidence for every approved write: current API object, public page, task state,
agenda slot, and relevant mail/calendar identifiers.

| Demo mutation | Reset or rollback |
| --- | --- |
| Cold organizer event | Use a disposable event. Delete/archive only through a separately approved supported operation; otherwise retain and label it rehearsal data. |
| CFP submission/review | Use a named disposable submission. Restore status/assignments only if an exact supported inverse is approved. |
| Speaker profile/files/tasks | Record old values; restore profile and task state. Treat files and sent messages as potentially non-reversible. |
| Agenda move/publish | Record original slot/publish state; move back, re-check conflicts, and republish only with approval. |
| ICS update | Keep the same UID. A cancellation/update reaches real calendars and needs approval; deleting local mail does not retract it. |
| Inbound reconcile | Save preview and original source-managed records. Preview the inverse update or explicit delete, obtain fresh approval, apply, replay, verify. |
| Full Accelevents CRUD fixture | Send the documented `resetFixture: "drifted"` request. It resets fake state only. |
| Real Accelevents speaker push | There is no demo rollback promise. Record IDs and coordinate cleanup with the Accelevents owner. |

Do not use a full production seed as reset. Do not use direct SQL, database restore, hidden routes,
or remote Accelevents calls to make the screen look right during a demo.

## Failure fallbacks

| Failure | Presenter response |
| --- | --- |
| First Settlement returns 404 | State that targeted seed approval is pending; use `/demo`; show Roman source and expected URLs. |
| Admin returns Cloudflare 503/1102 | Reload once. The README documents the free-plan 10 ms CPU ceiling. Then use open public tabs and captured evidence. |
| Sign-in email unavailable | Use the on-page magic link or `/admin/mail`; for a seeded speaker, use organizer impersonation. |
| Upload or task write fails | Show pre-seeded file/task state; do not retry with personal files. |
| Calendar client cannot import | Show captured mail attachment and UID/SEQUENCE fixture; do not send another real invitation. |
| Reconcile route missing from OpenAPI | Stop the write segment, show proposed contract/fixture, and use the public read API. |
| API key unavailable | Use public GET and browser UI. Do not create or reveal a key during the presentation. |
| Required Accelevents credentials unavailable | Use the accepted-speaker fixture path; live end-to-end is optional `N-1c`. |
| Full CRUD route unavailable | Omit it; required accepted-speaker push remains the proof. |
| No network | Use README images, local test evidence, committed OpenAPI, Roman seed, and this runbook. Do not claim a live check. |
| No credentials | Restrict to public pages, embeds, public GET, source/tests, and prerecorded approved evidence. |

## Rehearsal checklist

- [ ] Approval owner and scope are written down for every live mutation.
- [ ] Live home, sign-in, `demo` pages, embed, and public API respond.
- [ ] Organizer magic link works without an inbox and `/admin/mail` is reachable.
- [ ] First Settlement is verified live after an approved targeted seed, or fallback wording is in
      the speaker notes.
- [ ] Event switcher selects the intended event before every write.
- [ ] Roman event shows eleven motions, six accepted speakers, twelve confirmed gallery profiles,
      five published sessions, one accepted unscheduled motion, and outstanding tasks.
- [ ] A disposable cold organizer and disposable speaker/submission are identified.
- [ ] The `demo` switch for conditional CFP and multi-round review is rehearsed, or approved
      disposable Roman equivalents are prepared.
- [ ] Conflict and draft/publish paths need no improvised data.
- [ ] Calendar client demonstrates stable UID plus raised sequence, or captured evidence is ready.
- [ ] Required accepted-speaker push uses the fake or separately approved real path.
- [ ] Live OpenAPI is checked immediately before either provisional API segment.
- [ ] Event key is loaded from the approved secret store, event-scoped, unprinted, and scheduled for
      revocation.
- [ ] Preview and exact inverse are reviewed before apply.
- [ ] Repeated applied reconcile produces only no-ops.
- [ ] Public agenda and embed agree after publication.
- [ ] Existing `demo` tabs and no-network evidence are already open.
- [ ] Bonus segments have a clean cut point if required flow runs long.

## Go/no-go checklist

Proceed with the live 25-minute plan only if every required box is true:

- [ ] **GO:** Deployed revision is recorded and required browser flow was rehearsed against it.
- [ ] **GO:** Organizer, speaker, public, and embed routes work in separate browser contexts.
- [ ] **GO:** Every planned production mutation has scope approval and an inverse or acknowledged
      non-reversible effect.
- [ ] **GO:** Required Accelevents segment has fixture mode or separately approved credentials.
- [ ] **GO:** Producer has the `demo` event and offline evidence ready.
- [ ] **GO for bonus API only:** Route is in live OpenAPI and an event-scoped key is available.
- [ ] **GO for Roman claims only:** `/first-settlement` and its agenda return the seeded event;
      otherwise say it is not live.
- [ ] **NO-GO:** Unexpected delete, cross-event record, unresolved taxonomy, row error, or exposed
      secret stops the write portion immediately.

## Post-PR finalization

The runbook remains honest while sibling work is landing. Before declaring the demo final:

- [ ] Confirm [PR #53](https://github.com/EllAchE/sessionboard-oss/pull/53) is reviewed, merged, and
      deployed and the inbound reconcile path is present in live OpenAPI before calling it live.
- [ ] Re-check PR #53's request and preview-response fixtures against the deployed fields, defaults,
      errors, null semantics, and confirmation behavior.
- [ ] Replace illustrative inbound counts with captured approved preview/apply/replay results while
      retaining the state-dependent warning.
- [ ] Link landed Accelevents fixture docs; verify fields and the 7/3/1/2, blocked-delete, delete, and
      twelve-noop sequence.
- [ ] Confirm the fake adapter still refuses to overstate live full-program reconciliation.
- [ ] Confirm the official skill matches the final inbound contract and retains its missing-OpenAPI
      fallback.
- [ ] Record the production revision and exact merge/deploy approvals.
- [ ] Confirm [PR #50](https://github.com/EllAchE/sessionboard-oss/pull/50) is reviewed and merged,
      then use its dry-run `bun run db:seed:first-settlement` and separately approved apply
      `bun run db:seed:first-settlement --apply --confirm=first-settlement`. Never replace it with
      full `db:seed`, and do not imply merge means deployment.
- [ ] Obtain separate approval, run the targeted seed, and verify every First Settlement URL before
      changing “not live” to “live.”
- [ ] Create/revoke the event-scoped demo key under separate approval and retest without printing it.
- [ ] Run one approved end-to-end rehearsal, capture checkpoints/rollback results, and update the
      go/no-go record.
- [ ] Re-run Markdown link and formatting validation after sibling PRs merge.
