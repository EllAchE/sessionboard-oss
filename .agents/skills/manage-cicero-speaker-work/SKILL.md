---
name: manage-cicero-speaker-work
description: Review and manage the signed-in speaker's own work for one Cicero event through the live OpenAPI. Use when a speaker wants to discover an open CFP, draft or submit a proposal, read or edit their proposals, update their event profile, review or complete onboarding tasks, save task-form answers, reopen a task, or withdraw a proposal. Requires a speaker-scoped session for every private read and mutation; never use an organizer API key or act on another speaker's records.
---

# Manage Cicero speaker work

Act only as the authenticated speaker. Read current state, present the exact change, obtain any
required confirmation, mutate once, and verify by reading the same speaker-owned record again.

## Establish the target and live contract

Require one Cicero base URL and event slug. Fetch `<base-url>/api/v1/openapi.json` without a
credential and read [`references/api-contract.md`](references/api-contract.md). Treat the live
document as authoritative when it differs from the reference.

Require the live contract to advertise speaker security plus the operation needed for the request.
If it does not, stop rather than using UI automation, a direct database write, an organizer route,
or an undocumented endpoint.

Read the public event record and show its name, slug, timezone, dates, and base URL. Stop for target
confirmation when those facts disagree with the request.

## Authenticate as the speaker

Use either the existing same-origin `cicero_session` cookie in a signed-in browser or a speaker
session supplied through the secure `CICERO_SPEAKER_TOKEN` secret as
`Authorization: Bearer ${CICERO_SPEAKER_TOKEN:?set CICERO_SPEAKER_TOKEN}`.

- Never print, inspect, persist, summarize, or return the token.
- Never place it in a URL, JSON body, tracked file, screenshot, command preview, or process title.
- Never substitute the event-wide organizer API key; it has the wrong identity and scope.
- A 401 is not permission to try another event or identity. Ask the user to sign in through Cicero's
  magic-link flow or supply the session through a secure secret channel.

Authenticate by reading `getMySpeakerProfile`. The returned email and event must agree with the
request before any mutation.

## Read before writing

Use the speaker-owned reads before preparing a change:

- `listMySubmissions` and `getMySubmission` for proposal identity, status, editability, current
  content, custom answers, and schedule.
- `getMySpeakerProfile` for current profile and notification preferences.
- `listMySpeakerTasks` for assignment id, kind, state, deadline, form fields, link, and file rules.
- Public `listOpenCalls` and `getOpenCall` for an open CFP's exact field keys, choices, conditions,
  limits, and deadline.

Never select a record by array position or fuzzy title when an id is available. If multiple records
match the user's wording, ask which one.

## Prepare and gate mutations

Map answers to the exact field keys and option ids returned by the live form. Preserve current
fields the user did not ask to change. Show the event, operation, record id/ref, and material before
calling a write operation. An explicit request to make that exact bounded change is confirmation;
otherwise ask once.

Apply these additional rules:

- A new proposal is non-idempotent. Prefer `mode: draft` when the user is still composing. Before
  `mode: submit`, show the title and every required answer.
- An edit is allowed only when `editable` is true. Show a compact before/after diff.
- A profile patch may contain only changed fields; an empty string intentionally clears text and an
  empty `links` array intentionally clears links.
- Complete only `acknowledge` or `link` tasks through the simple completion operation. Use the form
  operation for `form` tasks, with `submit: false` to save progress or `submit: true` to complete.
- File-upload tasks remain browser-only until the live OpenAPI advertises an authenticated upload
  operation. Give the exact portal URL instead of encoding files into an undocumented request.
- Withdrawing a proposal is destructive and preserves a terminal audit record. Name the proposal,
  explain that it leaves review/program consideration, and obtain fresh explicit confirmation.

Send exactly one mutation after confirmation. If the payload changes, review it again.

## Verify and report

Re-read the affected proposal, profile, or task immediately. Require the intended content/status
and report any discrepancy without attempting another write. For a new proposal, verify that its id
appears in `listMySubmissions`; do not retry a timed-out create blindly because it may have succeeded.

Report the event, operation, record id/ref, verified result, and portal URL. Keep organizer-only
work out of scope; route event-wide changes to `$manage-cicero-event`.
