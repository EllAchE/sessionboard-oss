CREATE TYPE "public"."scorecard_criterion_type" AS ENUM('numeric', 'select', 'text');--> statement-breakpoint
ALTER TABLE "score" ALTER COLUMN "value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "score" ADD COLUMN "text_value" text;--> statement-breakpoint
ALTER TABLE "scorecard_criterion" ADD COLUMN "type" "scorecard_criterion_type" DEFAULT 'numeric' NOT NULL;--> statement-breakpoint
ALTER TABLE "scorecard_criterion" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;