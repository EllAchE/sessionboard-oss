---
name: manage-cicero-event
description: Manage one named Cicero event from an event specification or Accelevents-shaped payload through the live Cicero OpenAPI. Use when asked to preview, create, update, delete, publish, reconcile, or verify a Cicero program; do not use for outbound Cicero-to-Accelevents speaker sync alone.
effort: high
mutation: mutating
worktree: false
lock: "cicero-event:<slug>"
---

# Manage a Cicero event

Turn an event specification into a reviewable Cicero program reconciliation. Preview is mandatory;
an apply or rollback is a separate, explicitly confirmed step.

## 1. Confirm the precondition

Before any network or filesystem mutation, resolve the repository root and run:

```bash
repo_root="$(git rev-parse --show-toplevel)"
test -f "$repo_root/docs/openapi.json"
jq -e '.info.title == "Cicero API"' "$repo_root/docs/openapi.json" >/dev/null
```

Exit without side effects unless both checks pass and the request includes:

- an event spec or Accelevents-shaped program payload;
- one explicit Cicero base URL;
- one explicit event slug.

Never choose an event by display name, by the first result, or by an Accelevents `eventUrl`. Ask for
the missing URL or slug if either is absent.

## 2. Establish the live contract and target

Fetch `<base-url>/api/v1/openapi.json` without credentials. Treat that live document—not the
committed copy—as the contract for a live request.

Require these operations before continuing:

- public event metadata for the selected slug;
- public sessions and agenda reads;
- an API-key-protected program reconcile operation with preview/apply semantics.

The expected inbound operation is currently `POST /api/v1/events/{slug}/program/reconcile`. Read
[`references/api-contract.md`](references/api-contract.md) only after the live OpenAPI advertises
that path, then reconcile its schemas with the live document. If the path or equivalent operation
is absent, stop and report: "This Cicero deployment is read-only for program data; the inbound
program reconcile API has not landed here." Never substitute a UI automation, direct database
write, Server Action, or undocumented route.

Read the public event record and show its name, slug, timezone, dates, and base URL. If those facts
do not agree with the supplied spec, stop for target confirmation before sending credentials.

## 3. Set up authentication without exposing it

Use a per-event key created by an organizer under **Admin → Integrations**. Accept it through the
`CICERO_API_KEY` environment variable or a secure tool secret; never ask the user to paste it into
the event spec.

- Never print, inspect, persist, summarize, or return the key.
- Never put it in a URL, JSON body, tracked file, shell trace, screenshot, or process title.
- Send it only as `Authorization: Bearer ${CICERO_API_KEY:?set CICERO_API_KEY}`.
- Redact authorization headers from command previews and logs.
- If the key is missing or rejected, stop. Do not create, rotate, or revoke a key without a separate
  organizer request and confirmation.

A key is event-scoped. A 401 for the selected slug is not permission to try the same key against
other events.

## 4. Normalize and compare

Map every source session to a stable Accelevents `externalId`; never match by title, speaker email,
time, or array position. Preserve explicit nulls. Convert times to ISO 8601 with an offset and
compare them in the Cicero event timezone.

Resolve room, track, and format only by an event-scoped id or an exact display name from the target
event. Do not invent taxonomy values or silently choose a fuzzy match.

Choose the smallest safe mode:

- `merge` for explicit creates, updates, publications, cancellations, and named deletes;
- `replace` only when the spec declares the complete source-managed collection.

Represent publication through the session status in the live schema. A published session must have
a room, start, and end. Create and update reuse the same `externalId`; delete uses the API's explicit
delete list or confirmed replace semantics. Never use replace merely to save request lines.

Read the current public sessions and agenda, then send the normalized request with preview enabled
(`apply: false`). Save only non-secret before-state data needed to explain the diff and construct an
inverse request. Do not treat a local diff calculation as the authoritative preview.

Public session reads are paginated on newer deployments. Follow `total`, `limit`, and `offset` until
the complete current program has been read; never reconcile against the first page alone.

## 5. Review the preview

Require a successful response with `applied: false`. Present:

- target base URL, event name, and slug;
- mode and source;
- create, update, delete, no-op, and error counts;
- each external id, action, changed fields, and validation message;
- public sessions that will appear, move, change, unpublish, or disappear;
- any conflict warnings returned by the API.

Stop if `canApply` is false, any operation is `error`, identity is ambiguous, the response lacks
operation-level details, or the response proposes work outside the supplied spec.

## 6. Gate every mutation

A preview does not authorize apply. Use the structured question tool when available and show the
exact target and counts. Ask the user to confirm one bounded request before setting `apply: true`.

Deletes require a second destructive confirmation. Name every external id that will be deleted and
state whether the delete removes a public session or sends a cancellation. For replace mode, add the
server's exact `confirmDeleteMissing` phrase only after that confirmation; never copy it from this
skill into an unconfirmed request.

Treat these as separate approvals even if they follow the same preview:

- applying changes to Cicero;
- deleting or replacing Cicero program records;
- pushing Cicero data outbound to Accelevents;
- applying a rollback.

For a live or client-owned host, state the exact HTTP method, path, event slug, mode, and summary
counts before asking. Approval for a plan, preview, local demo, or fake integration never authorizes
a live mutation.

After confirmation, send the identical reviewed payload with only the apply and required delete
confirmation fields changed. If the source payload or live preview changes, preview again.

## 7. Verify from the public side

After a successful apply:

1. Repeat the same preview and require all operations to be no-ops.
2. Re-read the public event, sessions, and agenda APIs.
3. Check the public event page, `/agenda` page, and any affected embed route.
4. Compare the visible result with the approved operation list.
5. Report the applied counts, verification URLs, and any notification failures separately.

Do not claim success from a 2xx apply alone. Publicly published rows must be visible; draft or
cancelled rows must be absent from the public agenda. If the apply says it succeeded but verification
disagrees, stop further writes and report the mismatch.

## 8. Recover safely

Build rollback from the captured before-state and the applied operation list:

- inverse create with an explicit delete;
- inverse update or publish with the complete previous fields and status;
- inverse delete with a re-create under the same stable external id.

Preview the inverse request and obtain fresh mutation and destructive confirmations. Never guess a
previous value or automatically roll back because verification failed. Email, calendar, webhook,
and outbound-Accelevents side effects may not be reversible; call those out before rollback.

If apply returns `applied: false`, do not issue a compensating request. If the response is ambiguous
or partial, preserve request and response metadata with secrets redacted, read the public state, and
stop for investigation.

For a copy-ready reversible walkthrough, load
[`references/first-settlement-demo.md`](references/first-settlement-demo.md).
