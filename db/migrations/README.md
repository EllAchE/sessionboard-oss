# Database migrations

The original migration identifiers are part of Cicero's upgrade contract. Persistent local and
hosted databases record each journal timestamp in `drizzle.__drizzle_migrations`; deleting or
rebasing those entries makes Drizzle replay an initial schema over populated databases.

Treat every committed migration, snapshot, and journal timestamp as immutable. Future schema
changes must append a new migration. If a migration has shipped, do not squash, renumber, rename,
or regenerate it even when a fresh database can be built successfully from a shorter baseline.
