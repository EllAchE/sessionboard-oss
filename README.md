# PR evidence

Screen captures attached to pull requests. This branch holds no code and is never merged; it exists
so image URLs in PR bodies keep resolving after the PR branch is deleted.

## `pr-340/` — communications simulator

Captured against a local dev server on `MAIL_TRANSPORT=log` / `SMS_TRANSPORT=log`, signed in as an
organizer on the seeded demo event. The three messages were produced by the product's own service
functions (`sendDecisionNotice`, `sendSessionInvites`, `sendSms`), not by rows written into
`email_log` / `sms_log` by hand.

| File | What it shows |
| --- | --- |
| `comms-simulator.gif` | A live run: three sends fire, the poller picks them up, toasts stack, then each is opened. |
| `01-toast-stack.png` | Three stacked toasts — two emails and one SMS — with the sign-in-link and invite flags. |
| `02-dialog-email.png` | The acceptance email opened: rendered HTML, headers, sign-in-link callout, extracted links. |
| `03-dialog-sms.png` | The SMS opened: recipient, template key, and the message body as sent. |
