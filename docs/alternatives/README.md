# Alternative designs

Other people's Sessionboard clones, built against the same frozen brief. One file per project in
this directory; this page is the index and the comparison.

Several teams solving one specification is a natural experiment, and the interesting output is not
a ranking — it is the set of different structural choices made for the same requirement. These
notes describe; they do not grade.

## Status

**Not started. 0 repositories analyzed.**

| | Count |
|---|---|
| Projects found | — |
| Projects analyzed | — |
| Found but not analyzed | — |

The survey is specified in [`../handoff/alternative-designs-survey.md`](../handoff/alternative-designs-survey.md).
Until it runs, every table below is empty by fact, not by oversight.

## Features others shipped that Cicero did not

**This is the list the survey exists to produce.** Consolidated across every project analyzed,
deduplicated, each attributed to the projects that have it.

*(empty — nothing analyzed yet)*

## Features Cicero shipped that others did not

*(empty — nothing analyzed yet)*

## Comparison matrix

Features down the side, projects across the top. `✓` shipped and verified in code, `~` partial,
`✗` absent, `?` could not determine.

| Area | Cicero | | |
|---|---|---|---|
| CFP intake | | | |
| Review rounds & scoring | | | |
| Anonymized review | | | |
| Decisions & notifications | | | |
| Agenda / scheduling | | | |
| Conflict detection | | | |
| Speaker portal & tasks | | | |
| Content deliverables | | | |
| Comms / templates | | | |
| Public event pages | | | |
| Embeddable widgets | | | |
| Public REST API | | | |
| AI features | | | |
| Speaker CRM | | | |
| Sponsors | | | |

## Project template

Each `docs/alternatives/<owner>-<repo>.md` follows this shape:

```markdown
# <owner>/<repo>

**Source:** <url> · **Live:** <url or "none found">
**Found via:** <where, e.g. competition Discord #submissions>
**Analyzed:** <date> at commit <sha>

## Stack
Framework, language, ORM, database, styling, auth.

## Scale
Rough LOC, file count, commits, contributors, span of commit dates.

## Feature coverage
Walk the brief's areas. Verified against code, not against README claims.

## Structural choices worth recording
Where domain logic lives; submission table shape; form engine vs. hardcoded;
AI advisory vs. decisive; anything genuinely different from how Cicero did it.

## Shipped that Cicero did not

## Cicero shipped that this did not

## Notes
Anything that does not fit above. No credentials, no tokens, no scraped private content.
```

## Rules

- Verify against code. A README claim is a claim, not a fact.
- Describe, do not grade. This is other people's work.
- **Never** record demo credentials, tokens, API keys, or `.env` contents — not even redacted.
- Note what could not be determined rather than guessing. An honest `?` is worth more than a
  confident wrong `✓`.
