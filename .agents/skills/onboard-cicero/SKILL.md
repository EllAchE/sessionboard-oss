---
name: onboard-cicero
description: Establish or resume stateful onboarding for a Cicero conference instance and event. Use when an organizer is starting from a bare clone, connecting to an existing Cicero deployment, continuing an interrupted setup, creating or locating an event, opening its CFP, reviewing submissions, building and publishing the program, preparing an event-scoped API key, or getting ready to hand ongoing program work to the manage-cicero-event skill.
---

# Onboard Cicero

Resume from a small non-secret state file in the caller's working directory. Discover what is
already true, guide only the first unfinished milestone, and hand off ongoing program management
instead of becoming a second Cicero front end.

## Establish local state

Resolve the caller's working directory before changing directories. Keep the skill directory and
the caller directory separate:

```bash
caller_root="$(pwd -P)"
skill_root="<directory containing this SKILL.md>"
python3 "$skill_root/scripts/onboarding_state.py" --root "$caller_root" show
```

If the command reports that no state exists, tell the user that onboarding will create
`<caller_root>/.cicero/onboarding.json`, then initialize it:

```bash
python3 "$skill_root/scripts/onboarding_state.py" --root "$caller_root" init
```

The invocation authorizes this one local, reversible write. Do not initialize another directory.
Never put a credential, token, cookie, email magic link, database URL, or provider account id in
the state. The file records only the base URL, event slug, hosting choice, readiness statuses, and
completed milestones.

On every later invocation, show a compact summary of saved state and resume at `progress.next`.
Do not repeat questions whose answers are already saved. If the user corrects a saved answer,
update it with the script before continuing.

## Discover the current position

Use local evidence first: repository files can reveal that self-hosting is available, but they do
not prove a container, deployment, account, event, or API key exists. Public `GET` requests may
verify an explicit base URL and event slug without mutation. Never probe guessed hosts or slugs.

Ask only for facts that remain unknown, in this order:

1. Whether the user is connecting to an existing deployment, running local Docker, self-hosting
   another way, or deploying to Cloudflare.
2. The explicit base URL for that choice.
3. Whether the organizer account is ready or still needed.
4. Whether the event exists and, if it does, its exact slug.
5. Whether work has already reached any later milestone.
6. Whether work should remain read-only or `CICERO_API_KEY` is securely configured.

Do not ask for the API key value. Determine only whether the environment variable is non-empty,
without printing it:

```bash
if test -n "${CICERO_API_KEY:-}"; then printf 'configured\n'; else printf 'missing\n'; fi
```

Record confirmed non-secret facts with `set`, and confirmed milestones with `mark`. Run `--help`
for the exact enums and command syntax. Do not mark a milestone from intention, a route's existence,
or an unverified inference.

## Walk only the next milestone

Read [`references/setup-map.md`](references/setup-map.md) before guiding a setup milestone. Run:

```bash
python3 "$skill_root/scripts/onboarding_state.py" --root "$caller_root" next
```

Handle only that milestone unless the user explicitly asks for the whole remaining checklist.
Give one concrete URL or command, the expected evidence of completion, and the next safe choice.
After the user confirms or read-only evidence proves completion, mark it and ask `next` again.

Prefer browser instructions for organizer-only operations. The public API is not an alternative to
account creation, form building, review decisions, or API-key issuance. Never use direct database
writes, undocumented routes, UI automation that bypasses confirmation, or another event selected
by display name.

## Keep effects behind boundaries

Public reads and local state updates are safe discovery. Treat every other effect separately:

- Ask before starting Docker containers, migrations, seed jobs, or a local development server.
- Show the exact account, host, project, and command before any Cloudflare or other live deploy.
- Let the user sign up and follow their own magic link; never capture, persist, or replay it.
- Treat creating an event, publishing a CFP, accepting a submission, publishing a program, sending
  communications, and minting or rotating a key as distinct user-authorized actions.
- Never send email/SMS, apply program changes, delete/replace records, rotate/revoke credentials,
  deploy, or submit anything to a competition as an implied part of onboarding.
- Re-preview after inputs or live state change. Destructive work always requires a separate,
  target-specific confirmation.

If the user declines an effect, save the non-secret context already learned and stop at the same
milestone so the next invocation resumes cleanly.

## Handoff

When all milestones through `api-key-ready` are verified and the key status is `configured`, mark
`handoff-ready` and transfer ongoing event work to `$manage-cicero-event`. Supply only the saved
base URL and exact event slug plus the user's attached or pasted event specification. Require its
compare → preview → confirm → apply → verify workflow; onboarding does not authorize apply.

Use this handoff prompt:

```text
$manage-cicero-event

Manage exactly this Cicero event:
- Base URL: <saved base_url>
- Event slug: <saved event_slug>
- Event spec: <attach or paste>

Read the live OpenAPI and current public program, then show a preview with operation-level diffs.
Do not apply anything yet.
```

If the key status is `read-only`, stop before the organizer handoff and offer
`$explore-cicero-event` for public event, session, speaker, agenda, and CFP reads. Preserve the same
state so a later invocation can continue at API-key setup.

At the end of every invocation, report the state path, completed milestone, next milestone, and
whether any confirmation is waiting. Never echo secrets.
