ALTER TYPE "public"."content_revision_kind" ADD VALUE 'scheduled_session';--> statement-breakpoint
ALTER TYPE "public"."content_revision_kind" ADD VALUE 'sponsor';--> statement-breakpoint
ALTER TABLE "content_revision" ADD COLUMN "revision_number" integer;--> statement-breakpoint
UPDATE "content_revision" AS "target" SET "revision_number" = "numbered"."rank" FROM (SELECT "id", row_number() OVER (PARTITION BY "event_id", "entity_kind", "entity_id" ORDER BY "created_at" ASC, "id" ASC) AS "rank" FROM "content_revision") AS "numbered" WHERE "target"."id" = "numbered"."id";--> statement-breakpoint
ALTER TABLE "content_revision" ALTER COLUMN "revision_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_entity_number" UNIQUE("event_id","entity_kind","entity_id","revision_number");