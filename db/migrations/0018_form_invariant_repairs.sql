/*
 `F-5`. Forms written before `0008` already had Title and Description rows, so that migration's
 insert-only repair never gave those rows the 255 / 5,000 character ceilings. Preserve any tighter
 limit an organizer deliberately chose, fill NULL, and clamp only values above the product ceiling.
 The `IS DISTINCT FROM` guard makes a second run a no-op rather than rewriting every matching row.
*/
UPDATE "form_field" AS ff
SET "max_length" = LEAST(COALESCE(ff."max_length", limits."cap"), limits."cap")
FROM "form" AS f,
  (VALUES
    ('title', 255),
    ('description', 5000)
  ) AS limits("builtin_key", "cap")
WHERE ff."form_id" = f."id"
  AND f."kind" = 'cfp'
  AND ff."entity" = 'abstract'
  AND ff."builtin_key" = limits."builtin_key"
  AND ff."max_length" IS DISTINCT FROM
    LEAST(COALESCE(ff."max_length", limits."cap"), limits."cap");--> statement-breakpoint
/*
 `F-4` / `F-7`. Repair any already-enabled participant stage that has no roles. This is the data
 counterpart to `updateForm` seeding roles when the toggle is turned on: upgraded databases and
 future writes end at the same invariant. The empty-set guard avoids changing an organizer's
 configured role set, while the unique-key conflict guard also makes concurrent/repeated execution
 harmless.
*/
INSERT INTO "form_participant_role" (
  "form_id", "kind", "label", "position", "min_count", "max_count"
)
SELECT
  f."id",
  defaults."kind"::participant_role_kind,
  defaults."label",
  defaults."position",
  defaults."min_count",
  defaults."max_count"
FROM "form" AS f
CROSS JOIN (
  VALUES
    ('speaker', 'Speaker', 0, 1, 1),
    ('co_speaker', 'Co-speaker', 1, 0, NULL::integer)
) AS defaults("kind", "label", "position", "min_count", "max_count")
WHERE f."kind" = 'cfp'
  AND f."collects_participants" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "form_participant_role" AS existing
    WHERE existing."form_id" = f."id"
  )
ON CONFLICT ON CONSTRAINT "form_participant_role_form_kind" DO NOTHING;
