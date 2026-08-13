# Inbound program reconcile contract

The write API is developed separately from this skill. Never infer that a deployed Cicero instance
supports it from this reference alone. Fetch the instance's live `/api/v1/openapi.json` and stop if
the operation is absent or its live schema differs.

## Expected operation

```http
POST /api/v1/events/{slug}/program/reconcile
Authorization: Bearer <event API key>
Content-Type: application/json
```

Expected request shape:

```json
{
  "source": "accelevents",
  "mode": "merge",
  "apply": false,
  "sessions": [
    {
      "externalId": "stable-source-id",
      "title": "Session title",
      "description": "Optional markdown",
      "status": "published",
      "startsAt": "2027-01-13T12:00:00+01:00",
      "endsAt": "2027-01-13T12:15:00+01:00",
      "room": "Curia Julia",
      "track": "Peace & Public Works",
      "format": "Relatio",
      "ceuCredits": null
    }
  ],
  "deleteExternalIds": []
}
```

`mode` is `merge` or `replace`. `apply` defaults to false. `confirmDeleteMissing` is omitted unless
a reviewed replace apply would delete source-managed sessions and the user has separately confirmed
those deletes. Use the exact confirmation value advertised by the live schema.

Expected result shape:

```json
{
  "data": {
    "source": "accelevents",
    "mode": "merge",
    "applied": false,
    "canApply": true,
    "summary": {
      "create": 1,
      "update": 0,
      "delete": 0,
      "noop": 0,
      "error": 0
    },
    "operations": [
      {
        "externalId": "stable-source-id",
        "action": "create",
        "sessionId": null,
        "changes": ["title", "status", "startsAt", "endsAt", "room"]
      }
    ]
  }
}
```

Any row error should make `canApply` false and prevent all writes. Stable identities are scoped and
stored as `accelevents:<externalId>` within the selected Cicero event.

## Outbound Accelevents reconciliation

Outbound Cicero-to-Accelevents synchronization is a separate operation and a separate external
effect. When the live OpenAPI exposes its preview/apply contract, default to preview, keep deletion
disabled unless explicitly confirmed, and expect per-item create/update/delete/no-op results plus
summary counts. A Cicero apply approval never authorizes the outbound apply.
