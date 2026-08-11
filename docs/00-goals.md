# Goals

Text-only statement of what we are building and why. No implementation detail — see
[`01-requirements.md`](01-requirements.md) for the tagged requirement list.

## The one-sentence goal

Build an open-source, self-hostable replacement for **Sessionboard** that is good enough that the
AI Engineer conference team never has to renew their Sessionboard contract.

## Why this exists

The AI Engineer team runs their conference speaker and content program on Sessionboard, a closed-
source SaaS. It costs them **more than $40,000 per year**. They use a small fraction of what it
does. That combination — high price, low utilization — is what makes it a good clone target and a
bad thing to keep paying for.

They are running a public competition ("$10,000 Kill My SaaS") to get it built. Prize is $10,000
cash plus a latent.space writeup. Up to $500 of token spend is reimbursed for any valid submission,
including Codex Pro / Claude Max subscription costs.

## What success looks like

The brief states the bar plainly, twice, and both statements should govern every scoping decision:

> "We do NOT expect to use everything ... Which makes it easier for you to clone and makes less
> sense for us to pay."

> "Cloning the exact design is not a requirement; the point is to make a good-enough open source
> alternative that we never have to pay for this closed source SaaS if we can help it."

Two consequences we should hold ourselves to:

1. **Visual fidelity is not the goal.** Do not spend time matching Sessionboard's design. The
   screenshots in `reference/screenshots/` are there to establish *what the feature does and what
   data it holds*, not what it should look like.
2. **Coverage of the workflow beats depth on any one feature.** A judge walking the end-to-end
   speaker journey and hitting a dead end is worse than any single screen being plain.

## The workflow we have to make work end to end

This is the spine. Everything in the requirements doc hangs off it.

1. An organizer configures an event and builds a **call-for-speakers form**.
2. The form is published at a **public URL**; speakers submit talks against it, creating an account
   in the process.
3. Submitters land in a **speaker portal** where they fill in bio, headshot, links, slides, and
   other supporting material.
4. Organizers **review and score** submissions, then accept or decline them.
5. Accepted sessions get **placed on a schedule** across rooms and tracks, with conflicts surfaced.
6. Speakers receive **templated, automated email** through the process — confirmations, reminders,
   and calendar invites that land on their own calendar.
7. Organizers watch a **dashboard** of who still owes them something.
8. The finished program is **published back out** to the event website as an embeddable schedule
   and speaker gallery.

## Judging, and what it implies

The winner is picked by the AI Engineer team (explicitly *not* swyx alone) through independent
evaluation. The stated tiebreaker: whichever entrant made the subjective product judgment calls
they would actually want to use and buy.

That tiebreaker is the most actionable sentence in the brief. Where the spec is ambiguous, we
should decide the way a conference organizer would want, and be able to say why.

Submission requires three things: their entry form filled out, an open-source repo, and a deployed
site that can be tested against their walkthrough video.

## Hard constraint

**Deadline: Wednesday, August 12, 10:00 PM PT.**

The brief also promises a more polished walkthrough video posted Saturday and Sunday, after which
**requirements freeze**. Anything not in the frozen set is out of scope for the competition entry.

## Reference material

Everything below is cited directly in the brief.

| What | Where |
| --- | --- |
| Source brief (competition doc) | [`reference/source-brief.txt`](reference/source-brief.txt) |
| Annotated screenshots, 42 of them | [`reference/screenshots/`](reference/screenshots/README.md) |
| Walkthrough video by the organizers | https://youtu.be/vUuK4Knl7oc |
| Sessionboard product docs / videos | https://learn.sessionboard.com/videos/overview |
| Organizer point of view | https://learn.sessionboard.com/get-started/overview |
| Participant point of view | https://learn.sessionboard.com/participants/overview |
| Live public CFP to poke at | https://appv2.sessionboard.com/submit/ai-engineer-sandbox-event/b7d4d7cd-3012-45c2-9c08-a8ee9185182f |
| Sessionboard public API (bonus points reference) | https://sessionboard.mintlify.app/introduction |
| Speaker CRM — explicitly optional extras | https://www.sessionboard.com/products/speaker-crm |
| Competition Discord | https://discord.gg/XYXaapF4q |

Sessionboard marketing pages the brief calls out as primary interest:
`/products/call-for-papers`, `/capabilities/speaker-management`, `/products/abstract-management`,
`/capabilities/content-management`, `/capabilities/conference-speaker-management`,
`/capabilities/ai-agenda` (less so — "cover the basics"), and `/capabilities/sessions-list-1`
(List of Sessions, List of Speakers, Agenda, Schedule Itinerary, Speaker Gallery).
