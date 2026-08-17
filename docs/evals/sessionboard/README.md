# Sessionboard evaluation baselines

This directory is the durable, sanitized score history for Cicero's external Sessionboard product
evaluation. Raw browser evidence remains in the isolated evaluator checkout because it is large,
stateful, and may contain fixture identities. A checked-in baseline contains enough information to
compare runs without making a temporary directory the only record that a run happened.

Generate a baseline from a completed `sbek` report with:

```bash
bun run eval:archive -- \
  --run /absolute/path/to/runs/<timestamp> \
  --evaluator-ref <evaluator-commit> \
  --product-ref <deployed-product-commit>
```

Generated files are immutable. Re-running the command with identical input is a no-op; attempting
to replace an existing filename with different content fails. Commit the new baseline before
remediating its findings.

The `2026-08-13T03-57-39.recovered.json` record predates this archive process. Its raw report and
screenshots were kept under `/private/tmp` and discarded, so it contains only facts recoverable
from the independent judge transcript and says so in its provenance.
