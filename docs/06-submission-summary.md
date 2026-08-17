# Cicero — submission (short form)

## Philosophy

Anyone here has context for what was built, and why. What I want to share with you is the philosophy behind my product decisions, the experience/process of building and how that ultimately manifested in Cicero.

### Agent-first, portal-second

The future of all "SaaS" is agent-first. The way I want someone to use this product is by talking to an agent, not by opening a tab.
That is why the landing page leads with an agent quick start instead of a product tour, why the MCP server
is a first-class surface rather than an integration afterthought, and why the REST API is essential.

The portal still has a role under this model: visual review + power user features. Looking at an agenda, reading a proposal, checking what the public page actually renders. Those are judgments a person makes with their eyes, and summarizing them into text is a downgrade. Nearly everything else
— the reading, the reconciling, the drafting, the chasing — is work an agent should be doing on
someone's behalf, and the portal is where they go to confirm it looks right.

The portal complements what you can do with an agent and natural language queries of what you want.
The final form of this is an in-app agent, with that you basically have a full feature set all living within 1 space.
I did not implement the in-app agent because:

1. Was short on time
2. I did not wanna link tokens
3. You expose new attack vectors with a full-access agent

Also, the reality is an app like Session Board is unlikely to dominate your working time, even if you're an organizer. So if your day includes working with other tools as well, you're not going to necessarily want to open a distinct app for each task. A better pattern in that circumstance is to have a central tool like say the Claude or Codex GUI from which you issue requests to all of the different apps you need, in which case an MCP server and/or API is essential; you need them to make the best version possible of the product.

### Power users first

The person to design for is the one who performs an operation five hundred times, not the one who
performs it once. So each design decision gets measured the same way: what is this person spending
the most operations on, and can it be automated away so completely that they never touch it again?

Unfortunately I did not have a chance to actually speak with any users here so I had to make some
speculation about who that would be. But I will walk through 1 example that gives you an idea of
my thought process for this. That example is actually something that did not ship: automatic agenda recalculation (There is a draft PR for it).

The idea is this, as new events are added or moved we automatically recalculate the agenda. An organizer moves one session or a session is
added and the rest of the day settles around it — placements that still
work stay put, the ones that break get recomputed, and the organizer approves a result instead of
dragging fifteen cards behind the one they actually meant to move. To make this work you would have to add
projections in this case, topic metadata to optimize for allowing people with interest in a specific topic to see all speakers
covering that topic rather than booking them concurrently and other custom rules, Attendee, count projections, etcetera. 

Without speaking to users I do not know that it is worth building. It is my guess about where an organizer's hours go. The first
thing I would do with real users is find out whether recalculation saves the afternoon I think it
saves, or whether it solves a problem they have already routed around — or whether the manual drag
is where the judgment actually lives, in which case automating it away makes the product worse. I
owe reviewers and speakers the same conversation. I designed hardest for organizer repetition
because that is the loop I can see from here, not because I have evidence it is the expensive one.

The shipped version of this tenet is the keyboard/hotkey layer - I am a huge fan of the product at Linear
and how quickly I am able to navigate that space using their hotkeys. I believe more SaaS should incorporate
this for their power users. To me, the power users of Sessionboard are the reviewers and they should also
have keyboard first enablement to let them move more quickly when making changes in the app. The keyboard
enablement stops at the organizer workspace on purpose: a speaker visits twice a year and needs an obvious,
forgiving flow rather than a shortcut sheet. If reviewers working a large committee round, or speakers at
an event that keeps them busy, turn out to live in the tool the way an organizer does, the keyboard layer
should follow them there.

### Opinionated over flexible, and subtract before adding

Given the choice between one right answer and a setting that lets each operator pick, I ship the
answer. A configuration surface is a decision handed back to the user along with the obligation to
understand the tradeoff, and most of the time they would rather have the tradeoff made well. My
instinct on a maturing product is to remove features, not to add them.

This submission visibly violates that, and I would rather name it than have a reviewer find it:
Cicero is feature-rich, more so than I would build for a real first release. The breadth is
deliberate — it is how a submission demonstrates that a surface was considered rather than skipped —
but it is not the state I would want to be defending a year in.

So when I say I would talk to users, I do not mean collecting feature requests. I mean consolidating:
which two screens are one screen, which flow loses a click, which action sits furthest from where a
person lands and deserves a hot path straight to it. The work I am describing shrinks the product.

### The line all three sit behind

> Keep the human in control, but remove the clerical work that makes conference operations miserable.

Agent-first is not agent-autonomous. AI proposes review notes and agenda placements but does not
accept a talk or publish a schedule. Cicero drafts a targeted task reminder but does not silently
send it. External programme updates can be previewed and replayed idempotently before they are
applied. The product helps a person move faster without pretending it understands the political,
commercial, and interpersonal context that makes conference work difficult.

## The Journey & The Tools

I've spent a decent amount of time vibe coding so I've built up a good stable of tools, skills, tricks and process for shipping quickly. However still learned so much doing this. Here's my process and learnings. A TLDR first

- Establish an efficient working environment first
- Build eval loops and run them autonomously
- Figure out a way to codify "taste"

I started by creating a new cicero/sessionboard-oss repo, but I was still launching agents from the working directory of my primary codebase rather than from the new clone. The reasoning behind this was that I built a lot of tooling centered around that repo. It worked decently for a while, but ultimately I decided that the setup time was worth it for the performance benefits I would get from running everything from the root repo. From there, super smooth sailing. Takeaway - Establish an efficient working environment first

The next learning I need to give credit to the Smol team for. They built a great eval tool set that I was able to run to assess the coverage of my own product. I ran it multiple times and even attempted to set it to run overnight in a remote dev box one night. I saw massive massive value in codifying outcomes and giving a verification step. You move so much faster, because you can just let an agent keep trying and verifying until it reaches its goal.

I've laid this philosophy out before at String, but without going deeply into it, there's an order of magnitude greater efficiency that you can achieve with a well structured eval loop and when you're still directing each action/agentic session. Building for verification loops is the next paradigm in agentic coding; if you aren't already doing it you're falling behind the frontier. The trade off of letting an agent run like this is that your agent can drift quite far from the original requirements. The best way to mitigate that is strong verification, simplicity and tests.

The last point is less a learning and more an unsolved problem - in this project the biggest challenge came in the final stage, when I needed to incorporate taste. What that meant - baking in all the lifetime learnings I've had about good product design, good UI and good UX in a way that an agent could follow; not just in places where I saw bad design but app wide. I have yet to succeed in getting an agent to generalize good UX/UI/product design beyond any 1 place in which I call out a bad design decision. I have seen so many skills promise this but have yet to see one deliver on that promise. Would love to change that though!

## What it is

Cicero is a self-hostable, open-source event and speaker management system. It carries a conference
from event setup and a public call for speakers, through multi-round review and decisions, into a
conflict-aware agenda, speaker onboarding, communications, and a published public programme with
live embeds.

The brief says the incumbent contains features the team does not use, so Cicero optimizes for
coverage of the real workflow rather than menu-for-menu parity. The product thesis is: **keep the
human in control, but remove the clerical work.** AI may suggest review notes or agenda placements,
but cannot accept a talk or publish a schedule. Task reminders are drafted and reviewed rather than
silently sent.

## The requested feature set

The replacement spine works end to end: event taxonomy and branding; multi-form CFP builder with
custom fields, conditional logic and routing; cold public submission with in-flow account creation,
draft/resume and portal redirect; speaker profile, files, tasks, resources and availability windows;
multi-round review with weighted score, dropdown and text criteria; accept/decline decisions;
drag-and-drop scheduling with room, track, speaker and availability conflicts plus revocable draft
share links; email templates, send log and updating `.ics` invitations; milestone-aware
outstanding-task dashboards; public event/session/speaker pages, agenda starring, a personal
itinerary, seven embeds and portable feeds; and the required one-way accepted-speaker Accelevents
client with a deterministic credential-free demo mode.

MIT source, Docker Compose, Postgres, MinIO-compatible storage, magic-link roles, and a seeded demo
make the product testable without buying another service.

The seed now creates the same sample conference at three idempotent scales: an 18-submission small
event, the 96-submission medium `/demo` used by default, and a 384-submission large event. That makes
queue density, pagination, reviewer load, and agenda legibility inspectable without confusing scale
with different content.

## What we added beyond the brief

The most important additions are operational rather than decorative:

- assisted chasing from every outstanding-task row, with server-enforced preview and stale-state
  refusal;
- whole-event duplication that carries reusable forms, taxonomy, tasks, review setup and templates
  into a clean edition while excluding people, submissions, files, credentials, logs and sync state;
- keyboard-first organizer workflows inspired by Linear: `⌘K`/`Ctrl-K` navigation plus queue and
  review shortcuts for repeated triage, scoring, staging, and decisions;
- a persistent Actions panel, demo-first role entry, live sample embeds, and quick actions with
  discoverable keyboard bindings;
- a landing page that gives API, embeds, and agent setup one proof-bearing home instead of repeating
  them as abstract About-page claims;
- one truncation rule across dense organizer tables, explicit score scales, and in-place recording
  updates that preserve working context;
- speaker double-booking, availability windows, event-level warn/block conflict policy, and private
  draft-programme previews;
- versioned speaker files and comments, numbered restorable content revisions, and post-conference
  recordings;
- browser-local, event-scoped attendee schedules plus JSON, XML and subscribable `.ics` output from
  the same embed configuration;
- SMS consent/verification/preferences/quiet hours and no-login unsubscribe;
- cross-event speaker CRM, sponsor/exhibitor data, and a public exhibitor-map embed;
- organizer Updates, accurate overdue pacing, advisory event milestones, review permalinks,
  decision-note exports, unified Messages navigation, and full speaker-portal assistance;
- REST/OpenAPI with readable and Scalar references, browser CORS, signed webhooks, MCP and agent
  workflows, per-event `llms.txt`, Airtable mirroring, and safe preview/apply/idempotency patterns.

## What we deliberately left for later

We excluded payments because the brief says they are not needed. We did not build autonomous
per-person chasing because real operations evidence favored escalation by a named human. Intelligent
agenda optimization needs demand, audience-overlap, venue-capacity, and schedule-quality data before
its output can be evaluated. Automatic post-event messaging needs opt-in timing, preference
enforcement, and an editable purpose. Interactive exhibitor maps and presigned uploads were also
unnecessary for the first release.

Mobile responsiveness received less design and verification time on the dense organizer workflows,
where power users are most likely to review, triage, and schedule on a desktop. The higher-priority
mobile case is attendee-facing output—especially agenda, itinerary, and speaker embeds inside event
websites—and those surfaces still need a focused device and host-site compatibility pass.

The most useful proposed integration is provider-neutral external task sync, with Linear first and
Jira, Asana, Trello, and GitHub Issues following. Cicero would remain the source of conference task
truth while an operations team works in its existing project. Stable IDs, explicit state mappings,
webhooks, reconciliation, and loop prevention are required. The first version should send canonical
links—not silently copy speaker PII, files, or comments into third parties.

Event cloning is now shipped. The next trust and operations work is an append-only Updates source,
headshot consent bound to the exact published file version, scoped dual-attributed organizer
assistance, and provider-neutral task sync with Linear first.

## Architecture and evidence

The UI and public API call one shared service layer; the UI never calls its own HTTP routes. That
keeps deadlines, authorization, publication filters, conflicts, and idempotency consistent across
human and automated entry points. Core programme fields are typed Postgres columns; flexible form
answers use JSONB. Magic links are short-lived and single-use, with guarded on-screen access for
reserved seeded identities. The acting user is resolved once per request, malformed identifiers and
input become useful client errors, and database outages become retryable service-unavailable
responses rather than opaque 500s.

On 2026-08-16, the then-current source was production-built in Docker, migrated, seeded, and walked
in a browser. The 2026-08-17 refresh audited merged product changes through `1017ca9`, regenerated
the standalone reading copies, and reran the source checks recorded in the evidence document. A live
recheck returned HTTP 200 for the demo, public agenda, and agenda API with five sessions in three
rooms, but confirmed that the host is still on an older `/admin` organizer and landing-page revision
than current `/organizer` source. The dedicated submission Worker was refreshed and verified on 17
August; the core application demo works, while the new application features above remain
current-source claims until a fresh application deployment closes that separate gap.

## Links

**Live demo:** <https://cicero-three.vercel.app>

**Readable HTML:** <https://cicero-submission.elehche.workers.dev/submission/summary.html>

**Repository mirror:** [`submission/summary.html`](submission/summary.html)

**Field survey:** <https://cicero-field-survey.elehche.workers.dev/>

**Source:** <https://github.com/EllAchE/sessionboard-oss>

**License:** MIT

**Full narrative:** [`06-submission-narrative.md`](06-submission-narrative.md) — this document is its
compact public version.

**Copy-ready form answers:** [`06-submission-form-answers.md`](06-submission-form-answers.md)

**Evidence:** [`06-submission-evidence.md`](06-submission-evidence.md) — dated browser and deployment
proof.
