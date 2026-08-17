CREATE TYPE "public"."sponsor_kind" AS ENUM('sponsor', 'exhibitor');--> statement-breakpoint
CREATE TABLE "sponsor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "sponsor_kind" DEFAULT 'sponsor' NOT NULL,
	"name" text NOT NULL,
	"tier" text,
	"website_url" text,
	"description" text,
	"booth_location" text,
	"logo_file_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_event_kind_name" UNIQUE("event_id","kind","name")
);
--> statement-breakpoint
ALTER TABLE "sponsor" ADD CONSTRAINT "sponsor_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsor_event_idx" ON "sponsor" USING btree ("event_id");

/*
 `E-7`. Everything above is what drizzle-kit generated, unedited. Everything below is why it needed
 no editing, which is worth writing down given how much of `0007` and `0010` did.

 This migration only creates a new type and a new table. There is no `ADD COLUMN ... NOT NULL` on a
 populated table anywhere in it — the standing hazard in this folder, where drizzle-kit emits the
 add and the constraint as one statement that aborts on any table that already has a row. The two
 `NOT NULL` columns that carry defaults (`kind`, `position`) are inside a `CREATE TABLE`, where a
 default is a column property rather than a rewrite of existing rows, so the fast-default question
 does not arise. `db/migrations/sponsor-entities.test.ts` pins that shape, because a regenerated
 migration silently loses any hand-editing and the next person to add a sponsor column will run
 `db:generate` over this same file.

 There is no backfill, and there is nothing to backfill: no sponsor existed on `main` at any layer,
 so every existing database is correct with this table empty. Nothing already in the schema gains a
 column or a constraint, which means this file takes no lock on `event`, `file` or any of the
 taxonomy tables beyond the single foreign-key validation against `event` — and that one is
 validated against an empty child table.

 On the unique constraint: `sponsor_event_kind_name` spans three `NOT NULL` columns, so it needs
 none of the care a nullable key would. Postgres treats NULLs as distinct in a `UNIQUE` constraint,
 which would have let duplicates in through a null column, and `UNIQUE NULLS NOT DISTINCT` is
 PG 15+. Neither applies here. `kind` is part of the key on purpose: a company that both sponsors
 and exhibits is two rows sharing a name, and that is the ordinary case rather than a collision.

 `logo_file_id` is a bare `uuid` with no foreign key into `file`, matching `event.logo_file_id` and
 `participant.headshot_file_id` exactly. That is the house pattern for a decorative image, and it
 is deliberate: a cascade from `file` would let deleting an image delete the sponsor.
*/
