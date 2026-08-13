# Cicero speaker API reference

Use the deployed `/api/v1/openapi.json` as the contract. This file is only a routing summary for the
repository version that introduced the speaker agent surface.

## Public reads — no credential

| Operation | Method and path |
| --- | --- |
| `getEvent` | `GET /api/v1/events/{slug}` |
| `listOpenCalls` | `GET /api/v1/events/{slug}/forms` |
| `getOpenCall` | `GET /api/v1/events/{slug}/forms/{formId}` |

## Speaker-owned reads

Send the speaker session as a same-origin `cicero_session` cookie or Bearer token.

| Operation | Method and path |
| --- | --- |
| `getMySpeakerProfile` | `GET /api/v1/events/{slug}/me/profile` |
| `listMySubmissions` | `GET /api/v1/events/{slug}/me/submissions` |
| `getMySubmission` | `GET /api/v1/events/{slug}/me/submissions/{submissionId}` |
| `listMySpeakerTasks` | `GET /api/v1/events/{slug}/me/tasks` |

## Speaker mutations

| Operation | Method and path | Body |
| --- | --- | --- |
| `createSubmission` | `POST /api/v1/events/{slug}/forms/{formId}/submissions` | `answers`, `mode`; optional matching `email` and `name` |
| `updateMySubmission` | `PUT /api/v1/events/{slug}/me/submissions/{submissionId}` | `title`, optional description, level, answers |
| `withdrawMySubmission` | `POST /api/v1/events/{slug}/me/submissions/{submissionId}/withdraw` | none |
| `updateMySpeakerProfile` | `PATCH /api/v1/events/{slug}/me/profile` | changed profile fields only |
| `completeMySimpleTask` | `POST /api/v1/events/{slug}/me/tasks/{assignmentId}/complete` | none |
| `reopenMyTask` | `POST /api/v1/events/{slug}/me/tasks/{assignmentId}/reopen` | none |
| `saveMyTaskForm` | `PUT /api/v1/events/{slug}/me/tasks/{assignmentId}/form` | `answers`, `submit` |

Every response is JSON. Successful collection reads use `{ "data": [...], "total": n }`;
successful item reads and writes use `{ "data": ... }`. Errors use
`{ "error": { "code": string, "message": string, "details"?: object } }`.
