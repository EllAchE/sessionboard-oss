# Accelevents demo

Cicero's required Accelevents integration is one-way: organizers push accepted speakers to the documented Accelevents speaker endpoint. The
live client preserves Accelevents' duplicate-email reject, records per-speaker outcomes, and never reads remote changes back into Cicero.

The full published-program reconciliation below is an added demo bonus. Accelevents does not publish verified event, session, update, or
delete endpoints for this use case, so create/update/ delete/no-op reconciliation is deliberately available only through Cicero's
deterministic fixture adapter. The response labels that boundary as `"adapter": "fake"`.

## Repeatable fixture walkthrough

Enable fixture mode with `ACCELEVENTS_FAKE=1`, create an event API key under Admin → Integrations, and set these shell variables:

```bash
export CICERO_URL=https://cicero.elehche.workers.dev
export CICERO_EVENT=first-settlement
export CICERO_API_KEY='<copy the event API key shown once>'
```

Reset the fake remote collection to a known drifted state and preview the plan. `resetFixture` intentionally rewrites only the fake
remote state; the reconciliation itself stays read-only. For the seeded First Settlement collection (one event, five published sessions,
six accepted speakers), the preview reports `7` creates, `3` updates, `1` delete, and `2` no-ops:

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${CICERO_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data '{"mode":"preview","allowDeletes":false,"resetFixture":"drifted"}' \
  "${CICERO_URL}/api/v1/events/${CICERO_EVENT}/integrations/accelevents/program"
```

Apply the creates and updates while proving the orphaned session is protected. The response reports `blockedDeletes: 1` and leaves
`session:retired-motion` in place:

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${CICERO_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data '{"mode":"apply","allowDeletes":false}' \
  "${CICERO_URL}/api/v1/events/${CICERO_EVENT}/integrations/accelevents/program"
```

Then authorize the delete. That request reports `1` delete and `12` no-ops. Run the same apply request again to prove idempotency: create,
update, and delete are all `0`; all `12` published event, session, and speaker records return `noop` with status `unchanged`.

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${CICERO_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data '{"mode":"apply","allowDeletes":true}' \
  "${CICERO_URL}/api/v1/events/${CICERO_EVENT}/integrations/accelevents/program"
```

The stable mapping is resource type plus Cicero ID. Titles and speaker emails can change without creating a second fake remote record;
deletion is never inferred from a renamed display field.
