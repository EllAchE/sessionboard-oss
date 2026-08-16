# Cicero — submission (short form)

**Live demo:** https://cicero-three.vercel.app
**Source:** https://github.com/EllAchE/sessionboard-oss

A condensation of [`06-submission-narrative.md`](06-submission-narrative.md), sized to paste into a
form field. The full narrative carries the evidence and the reasoning behind each claim here.

---

## What it is

Cicero is an open-source event and speaker management system: it carries an event from an open
call for papers, through reviewer scoring and an accept/decline decision, into a scheduled agenda
and a published public program — with speaker portals, organizer comms, and embeddable widgets for
an existing conference site. Bun, Next.js 15 (App Router), React 19, TypeScript, Drizzle over
Postgres, Zod contracts. It self-hosts with docker-compose and one command.

## The point of view

The brief notes that real customers don't use every feature of the incumbent, so this was built for
coverage of the actual spine rather than parity with a feature list. The thesis underneath it: keep
the human in control, remove the clerical work.

The clearest example is speaker chasing. The obvious build is an autosender — detect an overdue
task, mail the speaker. Instead I read a conference coordinator's thirteen-year Slack archive
(~13,488 messages) and looked at what actually happens when someone is late. Chasing is rarely
about the reminder; it's about knowing who to chase, what they're blocking, and whether someone
already reached out. So Cicero drafts the nudge, shows the organizer exactly who it goes to and
what it says, and sends only on a click — and the send is gated server-side, so if the underlying
task changed between draft and send, the send refuses rather than mailing something stale.

The same boundary holds for AI everywhere in the system: it drafts, summarizes and flags, and it
never decides. No AI output moves a submission's state.

## Architecture, and the decisions worth defending

**The UI never calls its own HTTP API.** Server Components and Server Actions call the service
layer directly; the public REST API is a genuine third-party surface, not the app's own backend.
That removes a whole class of drift where a rule is enforced in the route handler and quietly
missing from the page. The submission deadline, for instance, is enforced at five separate entry
points plus a distinct edit lock — that only stays consistent because there's one place to put it.

**A hard freeze on the schema, service signatures, and `components/ui`.** This is what made it
possible to run many workstreams in parallel without them colliding. Anything crossing a freeze
boundary had to be negotiated rather than merged.

**Magic-link-only auth, no passwords.** Fewer credentials to leak, and it makes the seeded demo
walkable: on the demo instance an on-screen link is issued for pre-existing seeded identities at an
IANA-reserved domain no mailbox can exist behind. Real accounts are unreachable through it.

## Deployment, told straight

Cloudflare Workers is a **first-class, supported target** — `bun run cf:build` and `cf:deploy` work
from this tree today, and `wrangler.jsonc`, the custom worker entry point and the Hyperdrive binding
are all live configuration, not leftovers.

The hosted demo runs on Vercel for one reason, and it's a billing reason. Measured with
`wrangler deploy --dry-run`, the upload is **3.42 MiB gzipped**. Cloudflare weighs the compressed
artifact: that clears Workers Paid's 10 MiB ceiling about three times over, and misses the free
tier's 3 MiB by roughly 14%. The fix is a $5/month subscription and zero code changes. I declined to
put a subscription behind a demo. Upgrade the plan and it deploys as-is.

That number was wrong in the repo until the last day. Four files compared a **13.4 MiB
uncompressed** bundle against a **3 MiB compressed** limit, and one drew the further conclusion that
the paid tier wouldn't have fit either — which is false. It surfaced because two docs disagreed with
each other; rather than pick the more convenient one, I measured. All four now carry the corrected
figure, marked as dated corrections with the original claim quoted rather than silently overwritten.

## What's done, and what isn't

The CFP → review → decision → agenda → publish spine works end to end in a browser, on seeded data,
across organizer, reviewer and speaker personas. The suite is 1,371 tests across 129 files.

Genuinely incomplete, and I'd rather name these than have them found: real outbound email is
configured but unproven on the deployed instance (no verified sender domain, so the demo uses its
own mailbox at `/admin/mail`); R2 storage and SMS are implemented and tested but never exercised
against a paid account; the requirements audit is pinned to an earlier commit and its row-by-row
verdicts have not been re-run against the current tree; and the per-request CPU measurement that
originally pushed us off Cloudflare's free tier has never been re-measured since the fix that
addressed it.

## What I'd do next

Close the two partial requirements around mail and the portal calendar link; re-run the stale audit;
shrink the bundle under 3 MiB to put the free Cloudflare tier back in reach; and exercise the
storage and SMS paths against a real account instead of a test harness.
