CREATE TYPE "public"."content_approval_status" AS ENUM('in_review', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."speaker_workflow_status" AS ENUM('invited', 'confirmed', 'declined', 'withdrawn');--> statement-breakpoint
ALTER TABLE "participant" ADD COLUMN "workflow_status" "speaker_workflow_status" DEFAULT 'invited' NOT NULL;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "content_status" "content_approval_status" DEFAULT 'approved' NOT NULL;