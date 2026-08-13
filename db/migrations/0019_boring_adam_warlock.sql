CREATE TYPE "public"."sponsor_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TABLE "sponsor" ADD COLUMN "status" "sponsor_status" DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
-- Sponsors created before publication state existed were already public. Preserve that contract;
-- every row created after this migration takes the fail-closed draft default.
UPDATE "sponsor" SET "status" = 'published';
