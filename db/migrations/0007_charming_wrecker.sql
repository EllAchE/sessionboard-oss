/*
 `E-1`. `starts_on` / `ends_on` were nullable, date-only text. They become a required `timestamptz`
 pair, `starts_at` / `ends_at`, with the date-only columns kept as their projection into the event
 timezone so the public pages, the merge fields and the shipped `/api/v1` payload keep reading a
 `YYYY-MM-DD` string.

 The generated form of this migration added both columns `NOT NULL` in one statement, which aborts
 on any table that already has a row. So the columns arrive nullable, the backfill runs, and the
 `SET NOT NULL` comes last — all inside this migration, so there is no window where the constraint
 is missing.

 Backfill rule, mirrored in `backfillEventWindow` in `lib/event-dates.ts` and asserted against this
 file by `lib/event-dates.test.ts`:

   * a timezone that is not a real zone becomes `UTC` — `AT TIME ZONE` errors on anything else, and
     a migration that aborts on one bad row is worse than one that normalises it;
   * a `starts_on` that is a real `YYYY-MM-DD` date becomes 09:00 local on that date;
   * anything else — NULL, empty, junk, `2026-02-31` — becomes 09:00 local thirty days out, which
     reads as "nobody set this" rather than as a date somebody might trust;
   * `ends_at` is 17:00 local on `ends_on`, falling back to `starts_on` for a one-day event and to
     the resolved start date otherwise;
   * an end that did not land after its start is pushed to start + 8 hours;
   * `starts_on` / `ends_on` are then rewritten from the instants, so the projection is true even
     for the rows that had nothing.

 The parse goes through a function rather than an inline cast because the column is free text and
 `'2026-02-31'::date` raises rather than returning NULL — a shape-only regex is not enough to tell a
 date from something that merely looks like one. The function is dropped again before the migration
 ends.
*/
ALTER TABLE "event" ADD COLUMN "event_type" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "banner_file_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
CREATE FUNCTION cicero_0007_date(value text) RETURNS date AS $$
BEGIN
  IF value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NULL;
  END IF;
  RETURN value::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
UPDATE "event" SET "timezone" = 'UTC'
WHERE "timezone" IS NULL
   OR lower("timezone") NOT IN (SELECT lower(name) FROM pg_timezone_names);--> statement-breakpoint
UPDATE "event" SET "starts_at" = (
  to_char(
    COALESCE(
      cicero_0007_date("starts_on"),
      (now() AT TIME ZONE "timezone")::date + 30
    ),
    'YYYY-MM-DD'
  ) || ' 09:00:00'
)::timestamp AT TIME ZONE "timezone";--> statement-breakpoint
UPDATE "event" SET "ends_at" = (
  to_char(
    COALESCE(
      cicero_0007_date("ends_on"),
      cicero_0007_date("starts_on"),
      ("starts_at" AT TIME ZONE "timezone")::date
    ),
    'YYYY-MM-DD'
  ) || ' 17:00:00'
)::timestamp AT TIME ZONE "timezone";--> statement-breakpoint
UPDATE "event" SET "ends_at" = "starts_at" + interval '8 hours' WHERE "ends_at" < "starts_at";--> statement-breakpoint
UPDATE "event" SET
  "starts_on" = to_char("starts_at" AT TIME ZONE "timezone", 'YYYY-MM-DD'),
  "ends_on" = to_char("ends_at" AT TIME ZONE "timezone", 'YYYY-MM-DD');--> statement-breakpoint
DROP FUNCTION cicero_0007_date(text);--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "ends_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "starts_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "ends_on" SET NOT NULL;
