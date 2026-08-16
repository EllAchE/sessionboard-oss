# Database migrations

The migration history was rebased into `0000_init.sql` while Cicero had no persistent deployment
that depended on the earlier migration identifiers. The remaining snapshot and `_journal.json` are
the minimum metadata Drizzle needs to generate and apply later migrations.

Treat this baseline as immutable once a persistent database is created. Future schema changes
should append migrations instead of regenerating `0000_init.sql`.
