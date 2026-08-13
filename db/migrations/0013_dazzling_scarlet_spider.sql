CREATE TYPE "public"."sms_consent_status" AS ENUM('opted_in', 'opted_out');--> statement-breakpoint
ALTER TYPE "public"."sms_status" ADD VALUE 'delivered' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."sms_status" ADD VALUE 'undelivered' BEFORE 'failed';--> statement-breakpoint
CREATE TABLE "sms_consent" (
	"phone" text PRIMARY KEY NOT NULL,
	"status" "sms_consent_status" NOT NULL,
	"source" text NOT NULL,
	"consented_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_log" ADD COLUMN "status_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sms_log_provider_message_idx" ON "sms_log" USING btree ("provider_message_id");--> statement-breakpoint
/*
 Existing preferences predate an auditable consent record, so an upgrade requires renewed consent
 instead of silently treating the old boolean as legal authorization. Preserve numbers that can be
 made unambiguous (international or NANP national format), block them in sms_consent, and clear
 values that cannot safely be converted without guessing a country.
*/
UPDATE "user"
SET "phone" = CASE
  WHEN btrim("phone") = '' THEN NULL
  WHEN regexp_replace("phone", '[[:space:]().-]', '', 'g') ~ '^\+[1-9][0-9]{7,14}$'
    THEN regexp_replace("phone", '[[:space:]().-]', '', 'g')
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^[2-9][0-9]{9}$'
    THEN '+1' || regexp_replace("phone", '[^0-9]', '', 'g')
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^1[2-9][0-9]{9}$'
    THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE "phone" IS NOT NULL;--> statement-breakpoint
INSERT INTO "sms_consent" ("phone", "status", "source", "opted_out_at")
SELECT DISTINCT "phone", 'opted_out'::"sms_consent_status", 'migration_reconsent', now()
FROM "user"
WHERE "phone" IS NOT NULL
ON CONFLICT ("phone") DO NOTHING;--> statement-breakpoint
UPDATE "user" SET "notify_sms" = false WHERE "notify_sms" = true;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_e164_check" CHECK ("user"."phone" is null or "user"."phone" ~ '^\+[1-9][0-9]{7,14}$');
