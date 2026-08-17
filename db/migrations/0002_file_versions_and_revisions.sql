CREATE TYPE "public"."content_revision_kind" AS ENUM('session', 'participant');--> statement-breakpoint
CREATE TABLE "content_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_kind" "content_revision_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"summary" text NOT NULL,
	"editor_user_id" uuid,
	"editor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_name" text NOT NULL,
	"body_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "root_file_id" uuid;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_round" ADD COLUMN "anonymized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_editor_user_id_user_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comment" ADD CONSTRAINT "file_comment_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comment" ADD CONSTRAINT "file_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_revision_entity_idx" ON "content_revision" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "file_comment_file_idx" ON "file_comment" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_root_idx" ON "file" USING btree ("root_file_id");