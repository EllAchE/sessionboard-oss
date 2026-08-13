---
name: explore-cicero-event
description: Search and explain one public Cicero event through its live OpenAPI without credentials. Use when a viewer wants event details, open calls for speakers, published sessions, accepted speakers, agenda results, combined filters, pagination, comparisons, or recommendations grounded in a Cicero program. Never use for private submissions or any mutation.
---

# Explore a Cicero event

Query the deployed public API directly. Keep the workflow read-only and never request a credential.

## Establish the target and contract

Require one Cicero base URL and event slug. If either is absent and cannot be resolved from a URL in
the request, ask for it rather than choosing an event by display name.

Fetch `<base-url>/api/v1/openapi.json` without authentication. Treat the live document as the
contract. Require `getEvent` and use only unauthenticated `GET` operations advertised there. Do not
send cookies, API keys, session tokens, or guessed headers to a public endpoint.

Read the event record first and state its name, slug, timezone, dates, and base URL. Stop for target
confirmation if these do not match the user's request.

## Query the public program

Use the smallest operation that answers the question:

- `listSessions` for published sessions. Combine `q`, `track`, `room`, `format`, `speaker`,
  `startsAfter`, and `startsBefore` when the live schema advertises them.
- `listSpeakers` for accepted speakers. Combine `q`, `company`, and `session` when available.
- `getAgenda` for complete day grouping and unscheduled published sessions.
- `listOpenCalls` and `getOpenCall` for public CFP discovery and field requirements.

URL-encode every query value. Follow `total`, `limit`, and `offset` until enough results have been
read; do not silently treat the first page as the whole event. When a live deployment lacks a
filter, fetch the relevant public pages and filter locally, then say that the filtering was local.

Published program data is intentionally narrower than organizer data: draft/cancelled sessions,
unaccepted speakers, private submissions, email addresses, review state, and speaker tasks are not
public. Never infer those from missing results.

## Answer with evidence

Name the applied filters and distinguish exact API facts from recommendations or inference. Include
stable event/session/speaker links when the payload provides enough identity to construct them.
For recommendations, explain the match in terms of returned title, description, track, format,
speaker, or time; do not invent program details.

## Preserve the boundary

This skill never calls `POST`, `PUT`, `PATCH`, or `DELETE`, even if the live OpenAPI advertises one.
Route speaker-owned work to `$manage-cicero-speaker-work` and organizer event changes to
`$manage-cicero-event`.
