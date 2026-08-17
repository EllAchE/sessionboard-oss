# Cicero documentation map

The repository contains both current operating documentation and records from the August 2026
competition build. A historical document can still explain a decision, but it is not current
deployment status or maintenance policy.

## Current operations and architecture

- [`../README.md`](../README.md) — setup, deployment, features, and known gaps
- [`02-architecture.md`](02-architecture.md) — runtime, hosting, storage, database, and service boundaries
- [`04-user-roles-and-actions.md`](04-user-roles-and-actions.md) — actor and permission model
- [`04-demo-runbook.md`](04-demo-runbook.md) — current presentation flow, safety gates, and fallbacks
- [`04-adversarial-test-plan.md`](04-adversarial-test-plan.md) — hostile-input matrix and regression status
- [`performance-benchmark.md`](performance-benchmark.md) — benchmark method and captured evidence
- [`first-settlement-seed.md`](first-settlement-seed.md) — targeted fixture plan and safe seed commands
- [`accelevents-demo.md`](accelevents-demo.md) — deterministic Accelevents adapter walkthrough
- [`api/program-reconcile.md`](api/program-reconcile.md) — inbound program preview/apply contract

## Generated contracts

- [`openapi.json`](openapi.json) — generated OpenAPI 3.1 contract
- [`mcp-tools.json`](mcp-tools.json) — generated MCP tool manifest

Regenerate them with `bun run docs:openapi` and `bun run docs:mcp`. CI rejects drift.

## Historical competition record

These documents preserve the original brief, delivery decisions, and submission. Dates, counts,
workstream ownership, open-PR references, and deployment observations inside them are historical.

- [`00-goals.md`](00-goals.md), [`01-requirements.md`](01-requirements.md), and
  [`05-additional-requirements.md`](05-additional-requirements.md) — frozen scope ledgers
- [`03-plan.md`](03-plan.md) — 24-hour competition delivery plan
- [`requirements-audit-checklist.md`](requirements-audit-checklist.md) — audit pinned to commit `416101e`
- [`06-submission-form-answers.md`](06-submission-form-answers.md) — copy-ready submission form draft
- [`06-submission-summary.md`](06-submission-summary.md),
  [`06-submission-narrative.md`](06-submission-narrative.md), and
  [`06-submission-evidence.md`](06-submission-evidence.md) — short form, public write-up, and dated proof
- [`decisions-long-form.md`](decisions-long-form.md) — build-time product rationale
- [`reference/source-brief.txt`](reference/source-brief.txt) and
  [`reference/screenshots/README.md`](reference/screenshots/README.md) — source brief and evidence

## Surveys and completed handoffs

- [`alternatives/README.md`](alternatives/README.md) — completed survey of 32 alternative designs
- [`reference/sessionboard-survey.md`](reference/sessionboard-survey.md) — incumbent-product survey
- [`reference/accelevents-api.md`](reference/accelevents-api.md) — captured external API research
- [`handoff/`](handoff/) — retained task briefs and evaluation procedures; check each file's status
  before treating it as unfinished work
