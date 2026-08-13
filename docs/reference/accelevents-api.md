# Accelevents API contract used by Cicero

This is a focused reference for the Accelevents API surface Cicero depends on. It is not a survey
of the full vendor API and it does not describe Cicero's own REST API. It was verified against the
official Accelevents pages on 12 August 2026; those pages report that their endpoint content was
last updated on 12 June 2025.

The official documentation now publishes an `llms.txt` index and embeds an OpenAPI 3.1 fragment in
each endpoint's Markdown page. It still does not publish one combined, downloadable specification.
Where the prose, operation parameters, schema, and examples disagree, this document preserves the
disagreement and states the compatibility behavior Cicero uses.

## Scope

Cicero's required integration is a one-way speaker push:

1. List speakers to verify the key and event identifier.
2. Create each accepted speaker that Cicero has not already pushed.
3. Treat a remote duplicate-email rejection as “already there,” never as an update.

Attendee registration is separate. Accelevents documents it as a five-call ticket-order workflow,
not a single create-attendee endpoint. Cicero keeps that workflow experimental because the vendor
does not document a complimentary-ticket flag and a live credentialed run has not been completed.

Sessions, tracks, attendee readback, CSV exports, and webhooks are outside this integration's
contract.

## Base URL, identifiers, and access

| Item | Contract |
| --- | --- |
| API origin | `https://api.accelevents.com` |
| Event identifier | `{eventUrl}`, the slug after `/events/` in an Accelevents event URL |
| Credential | Enterprise API key created by an Enterprise owner under Manage Enterprise → Integrations → API Key |
| Speaker endpoint roles | Super admin, event admin, or event staff |
| Content type | Requests and responses are JSON, even though the speaker-list OpenAPI fragment labels its success response `text/plain` |

`eventUrl` and the numeric `eventId` are different values. The speaker paths require `eventUrl`.
The list-speakers prose also says to send `eventId`, but its OpenAPI parameter is optional and the
path already identifies the event. Cicero is configured with `eventUrl`, not Accelevents' numeric
event ID, and does not send this query parameter; that behavior remains a live-verification item.

## Authentication

The API key is sent as the raw header value. None of the official API-key material documents a
`Bearer` prefix.

The vendor documentation contradicts itself about the header name:

- The OpenAPI security scheme is an API key in a header named `Key`.
- The speaker operations separately declare an `Authorization` header.
- The API-key guide tells users to paste the key into the documentation UI's `AUTHENTICATION`
  header, which is a UI label rather than a wire-level name.

Cicero therefore sends `ACCELEVENTS_AUTH_HEADER` first, defaulting to `Authorization`. If and only
if that request receives HTTP 401, it retries once with the other supported name. The successful
header is recorded in the sync result. Other failures are not retried.

## Endpoint map

| Status | Method | Path | Purpose |
| --- | --- | --- | --- |
| Required | `GET` | `/rest/host/event/{eventUrl}/speaker` | Verify access and list existing speakers |
| Required | `POST` | `/rest/host/event/{eventUrl}/speaker` | Create one speaker |
| Experimental | `GET` | `/rest/events/{eventUrl}/staff/ticketing/settings` | Find ticket types and remaining inventory |
| Experimental | `POST` | `/rest/events/{eventUrl}/calculateFee` | Calculate fees for a paid ticket |
| Experimental | `POST` | `/rest/events/{eventUrl}/staff/ticketing/order` | Reserve an order and receive its ID |
| Experimental | `GET` | `/rest/events/{eventUrl}/staff/ticketing/order/{orderId}/formattributes` | Discover required registration fields |
| Experimental | `POST` | `/rest/events/{eventUrl}/staff/tickets/payment/order/{orderId}?uptodate=true&waitListIds=` | Submit the order and create the ticket holder |

## Create a speaker

```http
POST /rest/host/event/{eventUrl}/speaker
accept: application/json
content-type: application/json
Authorization: <raw API key>
```

The page describes the request as a `SpeakerDTO` JSON body. Its generated OpenAPI fragment places
the DTO fields beneath a property called `RAW_BODY`; Cicero treats that as ReadMe's raw-body schema
label and sends the DTO itself as the top-level JSON body.

The subset Cicero sends is:

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "title": "Engineer",
  "company": "Difference Engine Co",
  "bio": "Ada builds analytical engines.",
  "pronouns": "she/her",
  "imageUrl": "https://example.com/headshots/ada.jpg",
  "linkedIn": "https://www.linkedin.com/in/ada",
  "twitter": "https://x.com/ada",
  "instagram": "https://www.instagram.com/ada",
  "position": 0,
  "moderator": false,
  "allowAttendeeAccess": true
}
```

| Field | Cicero rule | Vendor caveat |
| --- | --- | --- |
| `firstName`, `lastName` | Split the display name at its final word; a one-word name has an empty last name | The page names these fields but does not publish a required-field array |
| `email` | Trim and lowercase before deduplication and sending | Duplicate email is rejected, not updated |
| `title`, `company`, `pronouns` | Omit when absent | — |
| `bio` | Flatten Markdown to plain text before sending | The API exposes a string, with no documented markup format |
| `imageUrl` | Send an absolute, publicly reachable URL | Accelevents must be able to fetch it |
| `linkedIn`, `twitter`, `instagram` | Send profile URLs as strings | The create schema types `linkedIn` as boolean while the list schema and example return a URL string |
| `position` | Numeric display order | Vendor prose shows positions in increments of 1000 but does not make that a validation rule |
| `moderator` | `false` for Cicero's speaker push | — |
| `allowAttendeeAccess` | `true` | The docs do not establish that this alone issues a complimentary ticket |

The create page's success prose names an `id`, while its OpenAPI example is a bare integer such as
`12`. To tolerate those documented forms, Cicero accepts a bare integer, a numeric string, or an
object containing `speakerId` or `id`. The remote identifier is optional in Cicero's result because
the create operation can succeed without a response shape that supplies one.

### Create errors that affect behavior

| HTTP/API code | Meaning | Cicero behavior |
| --- | --- | --- |
| `400` + `4068906` | A speaker already exists with the same email | Record “already there”; do not update or fail the remaining batch |
| `406` | More than one user exists with the same email | Surface a conflict |
| `4030201` | The credential is not an event host | Surface an authorization failure |
| `4040200` | Event not found | Surface a not-found failure |
| HTTP `401` | Header or key rejected | Retry once with the alternate documented header name, then fail |
| HTTP `403` / `404` | Forbidden or missing resource | Surface the vendor failure |

Accelevents does not document an idempotency key. Email deduplication and the local successful-sync
record are therefore the idempotency mechanism for this integration.

## List speakers

```http
GET /rest/host/event/{eventUrl}/speaker?expand=sessionDTO&page=0&size=10
accept: application/json
Authorization: <raw API key>
```

| Query parameter | Contract |
| --- | --- |
| `expand` | Required by the OpenAPI fragment; comma-separated expansions |
| `searchString` | Optional text filter |
| `page` | Optional, zero-indexed |
| `size` | Optional; the page says the default is 10 |
| `eventId` | Mentioned as required in prose but optional in OpenAPI; distinct from `{eventUrl}` |

The response is a JSON object with `recordsTotal`, `recordsFiltered`, `data`, and `error`. Each
`data` item may include:

- identity: `speakerId`, `userId`, `firstName`, `lastName`, `email`;
- profile: `title`, `pronouns`, `company`, `bio`, `imageUrl`, and social links;
- ordering and role: `position`, `moderator`, `showModerator`;
- access and state: `ticketTypesForSpeaker`, `allowAttendeeAccess`, `allowOverrideDetails`,
  `deviceChecked`, and `loggedInAtVEH`;
- expanded sessions in `sessionDTO`.

Cicero only needs `recordsTotal` for connection testing and the speaker records for its fixture
contract. The sync is one-way: list results never overwrite Cicero participant data.

## Experimental attendee registration

The official attendee guide requires an order before an attendee can exist. The documented
sequence is:

1. `GET .../staff/ticketing/settings` and choose a ticket type whose `remainingTickets` is greater
   than zero. The relevant fields are ticket-type `id`, `name`, `price`, and remaining inventory.
2. For a paid ticket, `POST .../calculateFee` with an array containing `ticketQuantity`,
   `ticketingTypeId`, and `ticketPrice`. The response adds `totalPayable`.
3. `POST .../staff/ticketing/order` with `clientDate`, `paymentType`, and one `ticketings` entry.
   The success response is an object containing `orderId`.
4. `GET .../order/{orderId}/formattributes`. The response declares the registration fields for
   that event and ticket type. The guide always requires first name, last name, and email, but an
   implementation must also honor any additional fields returned for the event.
5. `POST .../payment/order/{orderId}` with the purchaser attributes and payment type. The official
   example returns an array whose item contains `eventTicketId`, `email`, and `attendeeId`; those
   identifiers are strings in the example, and `attendeeId` is not purely numeric.

The guide does not define a complimentary-ticket flag. Cicero's experimental interpretation is a
zero-priced ticket type with `CASH` payment. That interpretation must not be promoted to the
required path until a live event confirms the exact order fields, dynamic attributes, response
shape, and resulting attendee access.

## Known contract gaps

- There is no combined OpenAPI document for the whole API; only per-page fragments are published.
- The authentication header name is contradictory, as described above.
- The list endpoint disagrees on whether numeric `eventId` is required.
- The create and list schemas disagree on the type of `linkedIn`.
- The create page disagrees on whether success is an `id` property or a bare integer.
- The list endpoint labels a JSON example as `text/plain`.
- No rate limit, retry policy, idempotency key, webhook payload schema, or webhook signature scheme
  is documented for this integration.
- No live end-to-end result is recorded in this repository. The fixture-backed tests prove Cicero's
  speaker-adapter behavior against the published shapes, not that an Accelevents account currently
  accepts every call.

## Verification

The contract fixtures, live client, fake gateway, and tests live under `lib/accelevents/`. Run:

```bash
npm test -- lib/accelevents/accelevents.test.ts
```

With no vendor credential, `ACCELEVENTS_FAKE=1` exercises speaker creation, duplicate-email
handling, and the attendee-order sequence through the same gateway interface.

A credentialed verification should first use the read-only list call with `size=1`, record which
header succeeds, and confirm whether `eventId` is enforced. Creating a disposable speaker or order
is an external write and should only be done against an event where that mutation is explicitly
authorized. Record the sanitized request shape, HTTP status, API error code, and response shape in
the fixtures after such a run; never commit the API key or attendee data.

## Official sources

- [Documentation index](https://developer.accelevents.com/llms.txt)
- [API key guide](https://developer.accelevents.com/docs/getting-started)
- [Create speaker](https://developer.accelevents.com/reference/create-speaker)
- [Get speakers list](https://developer.accelevents.com/reference/get-all-speakers)
- [Adding attendees](https://developer.accelevents.com/docs/adding-attendees)
