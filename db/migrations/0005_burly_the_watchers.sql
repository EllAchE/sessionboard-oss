ALTER TABLE "room" ADD CONSTRAINT "room_event_name" UNIQUE("event_id","name");--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_event_name" UNIQUE("event_id","name");