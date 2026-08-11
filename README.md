# sessionboard-oss

Spec workspace for an open-source replacement for **Sessionboard**, built for the
**"$10,000 Kill My SaaS"** competition run by the AI Engineer team.

**Deadline: Wednesday, August 12, 10:00 PM PT.**

## Read in this order

1. **[`docs/00-goals.md`](docs/00-goals.md)** — what we are building and why, in prose. Start here.
2. **[`docs/01-requirements.md`](docs/01-requirements.md)** — every requirement and deliverable,
   each tagged `[REQUIRED]` / `[IMPORTANT]` / `[OPTIONAL]` / `[EXCLUDED]` / `[BONUS]`.

## Reference material

- [`docs/reference/source-brief.txt`](docs/reference/source-brief.txt) — the competition brief,
  extracted verbatim, with screenshot positions marked inline
- [`docs/reference/screenshots/`](docs/reference/screenshots/README.md) — all 42 screenshots from
  the brief, filed by section, with the author's hand-drawn priority annotations catalogued
- [`docs/reference/sessionboard-survey.md`](docs/reference/sessionboard-survey.md) — an independent
  inventory of the real Sessionboard product. **Not a scope list.**

## Provenance

Everything in `docs/00-goals.md` and `docs/01-requirements.md` is derived **only** from the
competition brief and its screenshots. Nothing is inferred from Sessionboard's own product
documentation. Where the brief was silent or contradicted itself, the requirements doc records the
decision and its reasoning under *Resolved ambiguities* rather than leaving a hole.

`docs/reference/sessionboard-survey.md` was produced by a separate agent with no access to the
brief or to either spec document, working only from Sessionboard's own public sources. The two
derivations never touched. It exists as a coverage check: anything the survey documents that the
requirements never mention is either something the AI Engineer team deliberately does not use, or a
gap in our reading of the brief. It is deliberately much larger than the spec — the brief says
outright that most of Sessionboard is not needed.
