CREATE TABLE "track_reviewer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_reviewer_pair" UNIQUE("track_id","reviewer_user_id")
);
--> statement-breakpoint
ALTER TABLE "track_reviewer" ADD CONSTRAINT "track_reviewer_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_reviewer" ADD CONSTRAINT "track_reviewer_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "track_reviewer_track_idx" ON "track_reviewer" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "track_reviewer_reviewer_idx" ON "track_reviewer" USING btree ("reviewer_user_id");
/*
 Everything above is what drizzle-kit generated. Everything below is the upgrade path.

 There is no data step, and that is the decision rather than an omission.

 The obvious backfill — every existing reviewer covers every existing track — would preserve
 today's behaviour exactly, because assignment already treats the whole pool as eligible. It would
 also write a cross product of noise (ten tracks by eight reviewers is eighty rows) that says
 nothing an organizer chose, and that they would then have to prune before routing meant anything.
 A row in this table is a statement about a panel; inventing eighty of them makes the table lie on
 the first day.

 The same upgrade is instead handled in `lib/services/review.ts`: an event with no rows here has no
 routing configured, and assignment falls back to the whole selected pool, which is what it did
 before this migration. The moment an organizer covers a single track, routing becomes the
 authority for that event and every track without a reviewer is reported as a gap rather than
 quietly assigned. So a database migrated from `0008` behaves identically until somebody opts in.

 Note also what is not here: no `ADD COLUMN ... NOT NULL` on a populated table, which is what had to
 be rewritten by hand in `0007`. This migration only creates a new table, so it holds no lock on
 `track`, `user` or `review_assignment` beyond the two foreign-key validations, and those are
 against an empty child table.
*/