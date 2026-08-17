# Submission evidence

This is the dated verification record behind the claims in
[`06-submission-narrative.md`](06-submission-narrative.md). It separates what was exercised on the
current source tree from what is available on the hosted demo, because those two environments were
not on the same revision when this evidence was captured.

**Verified:** 2026-08-16

**Source revision:** `ce8d88b` (`origin/main` at the start of the verification)

**Hosted demo:** <https://cicero-three.vercel.app>

**Readable HTML:** <https://cicero-three.vercel.app/submission/evidence>

## Readable submission mirror: current-branch verification

After the original product walkthrough below, the three canonical submission documents were wired
to public HTML views and verified from the current PR branch against the same isolated seeded
Postgres and MinIO stack. The app ran at `http://localhost:3218`, with its local Hyperdrive binding
pointed explicitly at that seeded database.

| Route | Source | Browser result |
| --- | --- | --- |
| `/submission` | `docs/06-submission-narrative.md` | Full write-up, internal document links, relative GitHub source links, headings, code and feature tables rendered |
| `/submission/summary` | `docs/06-submission-summary.md` | Short-form copy rendered and the Short form tab was identified as the active document |
| `/submission/evidence` | `docs/06-submission-evidence.md` | Evidence tables and all five locally bundled screenshots resolved from emitted Next.js assets |

`bun run lint`, `bun run typecheck`, `bun run build`, `bun run db:check`, and the full 1,433-test
suite passed. A headless browser then navigated through all three documents and recorded four
full-page screenshots plus a video; those visual artifacts are attached to
[PR #185](https://github.com/EllAchE/sessionboard-oss/pull/185).

The production demo cannot expose these new routes until this PR is merged and deployed. That is a
deployment-order constraint, not hidden parity: the hosted core checks in this document remain the
current production evidence, while the submission mirror is current-branch evidence. The HTML
routes must be repeated against the hosted origin as part of the final pre-submission deploy check.

## Current source: local production build and seeded walkthrough

The current source was run as the production Docker image, backed by fresh Postgres and MinIO
containers. Host ports `3217`, `5545`, `9100`, and `9101` were used so unrelated local stacks were
left untouched.

```bash
docker compose \
  -f docker-compose.yml \
  -f /private/tmp/cicero-s134501-compose.override.yml \
  up -d --build
docker compose \
  -f docker-compose.yml \
  -f /private/tmp/cicero-s134501-compose.override.yml \
  exec app npm run db:seed
```

The image build completed successfully, the app ran its migrations before serving, and the seed
reported:

| Event | Submissions | Speakers | Scheduled sessions | Tasks |
| --- | ---: | ---: | ---: | ---: |
| `demo` / Cicero Forum 2026 | 14 | 7 | 5 | 7 |
| `first-settlement` / The First Settlement | 11 | 12 | 5 | 4 |

The following browser checks were then performed against `http://localhost:3217`:

| Surface | What was exercised | Result |
| --- | --- | --- |
| `/` | Public landing page | Rendered successfully |
| `/demo/agenda` | Signed-out published programme | Two dates, five published sessions, three rooms |
| Reserved demo sign-in | `organizer@example.com`, on-screen single-use magic link | Redeemed and redirected to `/organizer` |
| `/organizer` | Seeded organizer dashboard | Current event, counters, next actions, and 38 outstanding tasks rendered |
| Command menu | `⌘K` / `Ctrl-K` | Opened searchable organizer navigation and actions |
| Health & quick actions | Persistent bottom-corner control | Readiness explanation and one-click organizer, event, portal, and public-programme routes rendered |

The broader submission queue and review bindings described in the narrative were verified against
the current source and its component tests; only the global command menu was exercised in this
browser capture.

### Local evidence

#### Seeded organizer dashboard

![Seeded organizer dashboard](images/submission-evidence/local-seeded-organizer.png)

#### Keyboard command menu

![Keyboard command menu](images/submission-evidence/local-command-menu.png)

#### Workspace readiness and quick actions

![Workspace readiness and quick actions](images/submission-evidence/local-health-quick-actions.png)

#### Signed-out published agenda

![Seeded public agenda](images/submission-evidence/local-seeded-agenda.png)

## Hosted demo verification

The following checks were performed against <https://cicero-three.vercel.app>:

| Surface | Result on 2026-08-16 |
| --- | --- |
| `/demo/agenda` | Rendered five published sessions in the three-room agenda |
| `/embed/demo/agenda` | Rendered the same signed-out agenda as an embed |
| `/api/v1/events/demo/agenda` | HTTP 200, JSON, two days, five sessions, three rooms, zero unscheduled |
| `/first-settlement` | Rendered the seeded public event: five sessions, twelve speakers, four tracks |
| `/submit/first-settlement/motions` | Public CFP route resolved from the event page |
| Reserved organizer demo access | On-page magic link redeemed successfully |
| Organizer dashboard | Authenticated dashboard rendered counters, next actions, task ownership, and seeded records |

### Hosted evidence

#### Hosted agenda

![Hosted demo agenda](images/submission-evidence/deployed-demo-agenda.png)

## Deployment parity finding

The hosted demo is healthy for the public and authenticated core paths above, but it is running an
older application revision than the current source tree:

- the hosted organizer shell uses legacy `/admin` routes; current source uses `/organizer`;
- the hosted landing content is the earlier Roman-themed version;
- current-source additions such as the expanded command-driven review workflow, Updates navigation,
  Exhibitor map navigation, and the latest assisted-chasing surface should be demonstrated locally
  until a fresh deployment is made.

This is a deployment-parity gap, not a claim that the hosted demo is down. Submission language
should say that the hosted **core demo works**, and should not say that every screenshot from current
`main` is already deployed. A final pre-submission deploy and repeat of this checklist would close
the gap.

## What the persistent “Health” control means

The control is deliberately a **workspace-readiness** indicator. It means the organizer is signed
in and an active event is selected in that browser. It does not poll Postgres, object storage,
email/SMS providers, Accelevents, or the deployment platform. Both the UI and the submission use
that narrower term so a green indicator is never mistaken for infrastructure monitoring.
