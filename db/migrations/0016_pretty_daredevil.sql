CREATE TYPE "public"."session_recording_source" AS ENUM('upload', 'external');--> statement-breakpoint
CREATE TABLE "session_recording" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"source" "session_recording_source" NOT NULL,
	"file_id" uuid,
	"external_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_recording_session_unique" UNIQUE("session_id"),
	CONSTRAINT "session_recording_exactly_one_source" CHECK (("session_recording"."source" = 'upload' AND "session_recording"."file_id" IS NOT NULL AND "session_recording"."external_url" IS NULL) OR ("session_recording"."source" = 'external' AND "session_recording"."file_id" IS NULL AND "session_recording"."external_url" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "session_recording" ADD CONSTRAINT "session_recording_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recording" ADD CONSTRAINT "session_recording_session_id_scheduled_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."scheduled_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recording" ADD CONSTRAINT "session_recording_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_recording_event_idx" ON "session_recording" USING btree ("event_id");