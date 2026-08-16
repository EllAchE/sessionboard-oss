CREATE TABLE "event_exhibitor_map" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_exhibitor_map_file_unique" UNIQUE("file_id")
);
--> statement-breakpoint
ALTER TABLE "event_exhibitor_map" ADD CONSTRAINT "event_exhibitor_map_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_exhibitor_map" ADD CONSTRAINT "event_exhibitor_map_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE restrict ON UPDATE no action;