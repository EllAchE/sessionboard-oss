CREATE TYPE "public"."review_recusal_status" AS ENUM('active', 'released');--> statement-breakpoint
CREATE TYPE "public"."submission_stage" AS ENUM('accept', 'decline', 'hold');--> statement-breakpoint
CREATE TABLE "review_recusal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"status" "review_recusal_status" DEFAULT 'active' NOT NULL,
	"review_round_id" uuid,
	"reason" text,
	"recused_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"released_by_user_id" uuid,
	CONSTRAINT "review_recusal_pair" UNIQUE("submission_id","reviewer_user_id")
);
--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "staged_decision" "submission_stage";--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "staged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission" ADD COLUMN "staged_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_review_round_id_review_round_id_fk" FOREIGN KEY ("review_round_id") REFERENCES "public"."review_round"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_released_by_user_id_user_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_recusal_submission_idx" ON "review_recusal" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "review_recusal_reviewer_idx" ON "review_recusal" USING btree ("reviewer_user_id");--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_staged_by_user_id_user_id_fk" FOREIGN KEY ("staged_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "review_recusal" ("submission_id", "reviewer_user_id", "status", "review_round_id", "reason", "recused_at")
SELECT ra."submission_id", ra."reviewer_user_id", 'active', ra."review_round_id", ra."comment", COALESCE(ra."completed_at", ra."created_at")
FROM "review_assignment" ra
WHERE ra."status" = 'declined'
  AND NOT EXISTS (
    SELECT 1 FROM "review_recusal" rr
    WHERE rr."submission_id" = ra."submission_id"
      AND rr."reviewer_user_id" = ra."reviewer_user_id"
  )
ON CONFLICT ON CONSTRAINT "review_recusal_pair" DO NOTHING;

/*
 `V-1` and `ABS-12`. Two independent changes, both additive, and neither rewrites a row that
 already exists.

 On the three `submission` columns: every one is nullable, so none of them is the
 `ADD COLUMN ... NOT NULL` that aborts on a populated table — the standing hazard in this folder,
 and the reason `0007` had to be hand-rewritten. Nullable is not a shortcut here, it is the
 meaning. `staged_decision IS NULL` is "no organizer has touched this one", which is what the
 accept and decline queues keep reading off the panel's average, so an upgraded database shows
 exactly the queues it showed before. A `NOT NULL DEFAULT 'none'` would have made "nobody staged
 it" and "somebody staged it as nothing" the same value.

 On `review_recusal`: it is a new table, so its two `NOT NULL DEFAULT` columns are column
 properties inside `CREATE TABLE` rather than a rewrite of existing rows. `review_recusal_pair`
 spans two `NOT NULL` columns, so the Postgres rule that NULLs are distinct in a `UNIQUE`
 constraint — which would quietly let duplicates through a nullable key, and whose fix
 (`UNIQUE NULLS NOT DISTINCT`) is PG 15+ — cannot bite here. The key is deliberately
 `(submission_id, reviewer_user_id)` and not the round: a recusal is a standing fact about a person
 and a talk, and one keyed per round is one that forgets itself the moment round two opens.

 The backfill is the point of the file. A recusal used to be stored *only* as a `declined` review
 assignment, and releasing that assignment deleted the row — so the fact that a reviewer had ever
 recused themselves survived only as long as nobody freed it. Every `declined` assignment that
 still exists is a real recusal, so each becomes an active one here, carrying the reason the
 reviewer gave and the moment they gave it. Without this step an upgraded database would start with
 an empty memory, and auto-assign would re-offer on its very next pass exactly the talks this table
 exists to stop it re-offering.

 The insert is guarded twice — a `NOT EXISTS` and an `ON CONFLICT` — so re-running it inserts
 nothing. It reads only `review_assignment`, so it takes no lock on `submission` beyond the
 foreign-key validation the new column already needs.
*/