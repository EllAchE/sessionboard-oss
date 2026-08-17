CREATE TABLE "speaker_unavailability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"authored_timezone" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speaker_unavailability_window_check" CHECK ("speaker_unavailability"."ends_at" > "speaker_unavailability"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "speaker_unavailability" ADD CONSTRAINT "speaker_unavailability_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_unavailability" ADD CONSTRAINT "speaker_unavailability_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "speaker_unavailability_participant_idx" ON "speaker_unavailability" USING btree ("participant_id","starts_at");--> statement-breakpoint
CREATE INDEX "speaker_unavailability_event_idx" ON "speaker_unavailability" USING btree ("event_id","starts_at");