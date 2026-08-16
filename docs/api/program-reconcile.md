# Accelevents program reconciliation

`POST /api/v1/events/{slug}/program/reconcile` previews and applies an Accelevents-shaped program
collection. It uses the same per-event Bearer keys as submission reads, so a key issued for one
event cannot read or modify another event.

Each `externalId` is stored as an event-scoped, source-namespaced identity. Sending the same
collection twice therefore produces `noop` operations instead of duplicate sessions. `merge`
upserts listed records and can delete explicit ids in `deleteExternalIds`. `replace` also reconciles
source-managed sessions missing from the supplied collection. Sessions created by organizers, CFP
scheduling, or another integration are never inferred as missing.

Planning, validation, and database row writes are atomic: any row error prevents every write, and
an apply runs in one transaction. Outbound calendar email follows the existing organizer workflow.
A published session must send its `CANCEL` while the old row can still render the prior VEVENT, so
that send occurs before clearing or deleting the row and cannot be rolled back if a later database
write fails. Operators should treat a reported infrastructure failure after cancellation as an
unknown outcome, inspect the event, and safely retry the idempotent collection.

Room, track, and format accept an event-local id or a trimmed exact name, matched case-insensitively.
The `description` field is required but nullable: `null`, an empty string, or whitespace clears it;
other values are trimmed and stored as Markdown.

The checked-in First Settlement fixture is a complete published three-session collection. Preview
it without any write:

```bash
export CICERO_API_KEY='<event-scoped-key>'
curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer ${CICERO_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data-binary @docs/fixtures/first-settlement-accelevents-program.json \
  'https://cicero-three.vercel.app/api/v1/events/first-settlement/program/reconcile'
```

After reviewing every create, update, delete, noop, and error, request an ordinary apply. This stays
non-destructive when a replace preview reports a missing source-managed session: Cicero returns
`applied: false`, `canApply: false`, and `requiresDeleteConfirmation: true` instead of deleting it.

```bash
jq '.apply = true' docs/fixtures/first-settlement-accelevents-program.json | \
  curl --fail-with-body \
    --request POST \
    --header "Authorization: Bearer ${CICERO_API_KEY}" \
    --header 'Content-Type: application/json' \
    --data-binary @- \
    'https://cicero-three.vercel.app/api/v1/events/first-settlement/program/reconcile'
```

Only after explicitly reviewing and accepting every reported replace delete, add the confirmation
to a separate apply request:

```bash
jq \
  '.apply = true | .confirmDeleteMissing = "DELETE_MISSING_SESSIONS"' \
  docs/fixtures/first-settlement-accelevents-program.json | \
  curl --fail-with-body \
    --request POST \
    --header "Authorization: Bearer ${CICERO_API_KEY}" \
    --header 'Content-Type: application/json' \
    --data-binary @- \
    'https://cicero-three.vercel.app/api/v1/events/first-settlement/program/reconcile'
```

A clean First Settlement preview is checked in at
`docs/fixtures/first-settlement-accelevents-program-preview-response.json` and has this shape:

```json
{
  "data": {
    "source": "accelevents",
    "mode": "replace",
    "applied": false,
    "canApply": true,
    "requiresDeleteConfirmation": false,
    "summary": { "create": 3, "update": 0, "delete": 0, "noop": 0, "error": 0 },
    "operations": [
      {
        "externalId": "ae-first-settlement-101",
        "action": "create",
        "sessionId": null,
        "changes": [
          "clientId",
          "title",
          "descriptionMarkdown",
          "status",
          "startsAt",
          "endsAt",
          "roomId",
          "trackId",
          "formatId",
          "ceuCredits"
        ],
        "message": null
      }
    ]
  }
}
```

To demonstrate every reconciliation outcome after the first apply, keep one record unchanged, edit
the title or time of a second, replace the third with a new `externalId`, and preview again. The
report shows `noop`, `update`, `delete`, and `create` before a single database write occurs. Any
per-record validation error prevents the complete apply. Published results appear on the public
agenda and session endpoints; draft and cancelled results do not.
