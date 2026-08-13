# Cicero onboarding milestone map

Use this map only for the milestone returned by `onboarding_state.py next`. The completion evidence
is deliberately stricter than seeing that a page or command exists.

## `hosting-ready`

Choose one path and save its explicit base URL:

- **Existing deployment:** save `hosting=existing`. Verify `GET <base-url>/api/v1/openapi.json`
  returns the Cicero contract. A failed read is a diagnostic, not permission to deploy or mutate.
- **Local Docker:** from a Cicero clone containing `docker-compose.yml`, propose
  `docker compose up` and `http://localhost:3000`. Starting containers builds images, creates local
  volumes, and runs migrations, so obtain confirmation first. Verify the home page responds.
- **Other self-host:** save `hosting=self-hosted-other`. Follow the operator's deployment process;
  do not invent credentials or infrastructure. Verify the explicit base URL.
- **Cloudflare:** save `hosting=cloudflare`. Read the repository Deployment section and current
  `wrangler.jsonc`. Show the exact account, Worker, Hyperdrive target, and deploy command, then get
  confirmation before any live deploy. A local build is not proof of a successful deployment.

Mark complete only after the explicit base URL responds as Cicero.

## `account-ready`

Open `<base-url>/signup` when an organizer account is needed. The user owns their inbox and magic
link. Do not read, copy, persist, or follow that link for them. If an existing authenticated account
is ready, confirm it can reach `<base-url>/admin`.

Mark complete only after the organizer is authenticated and can reach the admin surface.

## `event-ready`

Open `<base-url>/events/new` to create an event, or use the event switcher for one that already
exists. Creation is a write: summarize the name, dates, timezone, and requested slug before the
user submits it. Save the exact slug from the resulting event, never a display-name guess.

When a slug is supplied for an existing event, verify it with
`GET <base-url>/api/v1/events/<slug>`. Mark complete only when the saved slug identifies the intended
event.

## `cfp-open`

Open `<base-url>/admin/forms`, select or create the call-for-speakers form, review its fields and
limits, then deliberately publish it. Publishing is a separate write. Verify the published public
form URL in a signed-out context before marking complete.

## `submissions-reviewed`

Open `<base-url>/admin/submissions`. Review the intended submission against the event scorecard.
Acceptance and rejection are human decisions; the guide may summarize but never decide. Confirm
the exact submission and decision before saving it. Mark complete after at least the intended
program submissions have a deliberate decision, or after the user explicitly states this event
does not use CFP submissions.

## `program-built`

Open `<base-url>/admin/agenda`. Place accepted sessions, resolve room, track, and speaker conflicts,
and leave them in draft while arranging. Mark complete when the intended sessions have valid rooms
and times and the organizer has reviewed the draft.

## `program-published`

From the agenda, show which draft sessions or day will become public and confirm before publishing.
Verify published sessions through both `GET <base-url>/api/v1/events/<slug>/agenda` and the public
`<base-url>/<slug>/agenda` page. Do not send or simulate communications as part of this check.

## `api-key-ready`

Open `<base-url>/admin/integrations`. A key is scoped to the selected event. Minting, rotating, or
revoking one is a credential mutation and requires its own confirmation. The user must place the
new value in a secure tool secret or `CICERO_API_KEY`; never ask them to paste it into chat, a spec,
the onboarding state, a command argument, or a tracked file.

Check only whether `CICERO_API_KEY` is non-empty. Verify authentication only against the saved event
slug, with authorization headers redacted from output. A rejection is not permission to try other
events or rotate the key.

If the user chooses public-only exploration, save `api-key=read-only` but leave this milestone
unfinished so onboarding can resume here later.

## `handoff-ready`

Require a verified base URL, exact event slug, completed program milestones, and
`api-key=configured`. Then use the handoff in `SKILL.md`. A successful handoff begins with a
side-effect-free preview; it does not imply permission to apply, delete, replace, deploy, send, or
submit anything externally.
