# Database migrations

`0000_init.sql` is the entire schema. Cicero has no database whose contents anyone needs to keep —
every environment is built by `bun run db:migrate && bun run db:seed` — so the migration history is
regenerated rather than accumulated, and the chain is deliberately one file long.

## Changing the schema

Edit `db/schema.ts`, then either:

- **Append a migration** — `bun run db:generate` writes the delta as `0001_*.sql`. Correct while a
  database you care about is already running, including a reviewer's.
- **Regenerate the baseline** — delete every `.sql` and `meta/`, run `bun run db:generate --name init`,
  and drop and recreate every database. Correct once the appended migrations have piled up, which is
  what produced this file.

Regenerating is safe here only because dropping the databases is. The moment one holds data that is
not reproducible from `db/seed.ts`, this stops being true and the append path is the only one left.

## What holds the line

Regeneration replays `db/schema.ts` and nothing else, so anything hand-written into a migration is
lost at the next regeneration — do not hand-correct these files, fix the schema. `migrations.test.ts`
asserts the columns and constraints that individual features' correctness and security arguments
rest on, precisely so a regeneration cannot drop one quietly.

Migrations appended after the baseline must be additive: a `DROP TABLE` or `DROP COLUMN` in one is
data loss against a database that already exists, and `migrations.test.ts` fails on both.
