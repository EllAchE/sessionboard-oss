# Copy-ready First Settlement demo prompt

Replace the base URL placeholder with a local or dedicated demo deployment. Set `CICERO_API_KEY` in
the agent environment through a secure secret before running the prompt; do not paste the key into
the prompt.

```text
$manage-cicero-event

Use the live Cicero OpenAPI to manage exactly this event:

- Base URL: <CICERO_BASE_URL>
- Event slug: first-settlement
- Expected event name: The First Settlement
- Source: accelevents
- Mode: merge

Prepare this one-session demo change:

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

First verify the target event metadata and that the deployed OpenAPI advertises an authenticated
program reconcile operation. Read the current public event, sessions, and agenda. Normalize this
spec, submit preview only, and show me the target, operation-level diff, counts, public visibility,
and any conflicts. Do not apply anything yet.

If I later approve the create, apply exactly the reviewed request and then prove it by showing:
1. a replay preview with one no-op and no writes;
2. the new session in the public sessions API and public agenda;
3. the public event and agenda URLs.

Keep a rollback request ready but do not submit it. The rollback must explicitly delete only
externalId demo-consult-the-auspices-v1, require a fresh destructive confirmation, and verify the
session is absent from the public agenda afterwards. Never expose the API key.
```

The new recess is visible and isolated by a dedicated external id. Its inverse deletes only that
row, so the walkthrough demonstrates create, publish, idempotent replay, public verification, and a
bounded rollback without changing a seeded historical session.
