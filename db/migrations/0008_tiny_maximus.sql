CREATE TYPE "public"."form_field_entity" AS ENUM('abstract', 'participant');--> statement-breakpoint
CREATE TYPE "public"."form_target_type" AS ENUM('abstract', 'session');--> statement-breakpoint
CREATE TABLE "form_participant_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"kind" "participant_role_kind" NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"min_count" integer DEFAULT 0 NOT NULL,
	"max_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_participant_role_form_kind" UNIQUE("form_id","kind")
);
--> statement-breakpoint
ALTER TABLE "form" ADD COLUMN "target_type" "form_target_type" DEFAULT 'abstract' NOT NULL;--> statement-breakpoint
ALTER TABLE "form" ADD COLUMN "collects_participants" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "form" ADD COLUMN "external_title" text;--> statement-breakpoint
ALTER TABLE "form" ADD COLUMN "page_heading" text;--> statement-breakpoint
ALTER TABLE "form" ADD COLUMN "show_welcome" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "form" ADD COLUMN "max_participants" integer;--> statement-breakpoint
ALTER TABLE "form_field" ADD COLUMN "entity" "form_field_entity" DEFAULT 'abstract' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "form_participant_role" ADD CONSTRAINT "form_participant_role_form_id_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_participant_role_form_idx" ON "form_participant_role" USING btree ("form_id");--> statement-breakpoint
/*
 Everything above is what drizzle-kit generated. Everything below is the upgrade path, which it
 cannot know about.

 Note what is *not* here: a bare `ADD COLUMN ... NOT NULL`. `0007` had to be rewritten by hand
 because that form aborts on a populated table. Every NOT NULL column added above carries a DEFAULT,
 which Postgres applies as a metadata-only fast default, so a single statement is correct here — the
 hazard is the missing default, not the constraint. `first_name` / `last_name` stay nullable on
 purpose: a name that arrived as one word has no surname, and inventing one is worse than leaving it
 empty.

 Three data steps follow.

 1. `F-6`. `user.name` is split into its two halves. The rule is "everything before the last
    whitespace-separated token is the given name", the same rule `lib/person-name.ts` applies at
    runtime, so a row written by the app and a row written here are indistinguishable. `name` itself
    is left exactly as it was — it is what the roster, the agenda, the exports and every merge field
    render, and rewriting forty read sites is not what this requirement asks for.

 2. `F-5`. Every `cfp` form gains the `tags` built-in if it does not have one. This is the fix for a
    live bug rather than a nicety: `publishForm` requires all six built-ins, and both seeds wrote
    five and set `status: 'open'` directly, so a seeded demo call for speakers failed the moment an
    organizer opened it in the builder and pressed Publish. The seeds are corrected too; this repairs
    the databases that already exist.

 3. `F-6` / `F-7`. Every `cfp` form gains the participant field set and a default pair of roles, so
    an existing form behaves like one created after this migration rather than presenting an empty
    participant stage. The defaults are deliberately permissive — one speaker required, co-speakers
    allowed, no ceiling — because a limit nobody chose is a limit that blocks a submission for no
    reason anyone can explain.

 All three are idempotent: re-running this migration inserts nothing twice.
*/
UPDATE "user" SET
  "first_name" = NULLIF(
    regexp_replace(btrim(regexp_replace("name", '\s+', ' ', 'g')), '\s\S+$', ''),
    ''
  ),
  "last_name" = NULLIF(
    (regexp_match(btrim(regexp_replace("name", '\s+', ' ', 'g')), '\s(\S+)$'))[1],
    ''
  )
WHERE "name" IS NOT NULL AND btrim("name") <> '';--> statement-breakpoint
INSERT INTO "form_field" (
  "form_id", "position", "step", "entity", "type", "key", "builtin_key", "label", "required", "max_length"
)
SELECT
  f."id",
  COALESCE(
    (SELECT max(ff."position") FROM "form_field" ff WHERE ff."form_id" = f."id" AND ff."entity" = 'abstract'),
    -1
  ) + 1,
  0,
  'abstract',
  'multi_select',
  'tags',
  'tags',
  'Tags',
  true,
  NULL
FROM "form" f
WHERE f."kind" = 'cfp'
  AND NOT EXISTS (
    SELECT 1 FROM "form_field" ff
    WHERE ff."form_id" = f."id" AND (ff."key" = 'tags' OR (ff."entity" = 'abstract' AND ff."builtin_key" = 'tags'))
  );--> statement-breakpoint
INSERT INTO "form_field" (
  "form_id", "position", "step", "entity", "type", "key", "builtin_key", "label", "required", "max_length"
)
SELECT f."id", spec.position, 0, 'participant', spec.type::field_type, spec.key, spec.key, spec.label, spec.required, spec.max_length
FROM "form" f
CROSS JOIN (
  VALUES
    (0, 'short_text', 'firstName', 'First name', true, 120),
    (1, 'short_text', 'lastName', 'Last name', true, 120),
    (2, 'email', 'email', 'Email', true, 320),
    (3, 'short_text', 'phone', 'Mobile phone', false, 40),
    (4, 'markdown', 'biography', 'Biography', false, 5000)
) AS spec(position, type, key, label, required, max_length)
WHERE f."kind" = 'cfp'
  AND NOT EXISTS (
    SELECT 1 FROM "form_field" ff
    WHERE ff."form_id" = f."id" AND (ff."key" = spec.key OR (ff."entity" = 'participant' AND ff."builtin_key" = spec.key))
  );--> statement-breakpoint
INSERT INTO "form_participant_role" ("form_id", "kind", "label", "position", "min_count", "max_count")
SELECT f."id", spec.kind::participant_role_kind, spec.label, spec.position, spec.min_count, spec.max_count
FROM "form" f
CROSS JOIN (
  VALUES
    ('speaker', 'Speaker', 0, 1, 1),
    ('co_speaker', 'Co-speaker', 1, 0, NULL::integer)
) AS spec(kind, label, position, min_count, max_count)
WHERE f."kind" = 'cfp'
  AND NOT EXISTS (SELECT 1 FROM "form_participant_role" r WHERE r."form_id" = f."id");
