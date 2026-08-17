CREATE TYPE "public"."api_key_scope" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TYPE "public"."contact_activity_kind" AS ENUM('created', 'imported', 'updated', 'stage_change', 'event_added', 'email_sent', 'merged');--> statement-breakpoint
CREATE TYPE "public"."content_approval_status" AS ENUM('in_review', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."content_revision_kind" AS ENUM('session', 'participant', 'scheduled_session', 'sponsor');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('short_text', 'long_text', 'markdown', 'select', 'multi_select', 'radio', 'checkbox', 'number', 'email', 'url', 'date', 'file', 'section_break');--> statement-breakpoint
CREATE TYPE "public"."form_field_entity" AS ENUM('abstract', 'participant');--> statement-breakpoint
CREATE TYPE "public"."form_kind" AS ENUM('cfp', 'portal');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."form_target_type" AS ENUM('abstract', 'session');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('organizer', 'reviewer', 'speaker');--> statement-breakpoint
CREATE TYPE "public"."participant_role_kind" AS ENUM('speaker', 'co_speaker', 'moderator', 'panelist');--> statement-breakpoint
CREATE TYPE "public"."prospect_stage" AS ENUM('researching', 'identified', 'contacted', 'interested', 'confirmed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."review_assignment_status" AS ENUM('pending', 'completed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."review_recusal_status" AS ENUM('active', 'released');--> statement-breakpoint
CREATE TYPE "public"."review_round_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."scheduled_session_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scorecard_criterion_type" AS ENUM('numeric', 'select', 'text');--> statement-breakpoint
CREATE TYPE "public"."segment_kind" AS ENUM('dynamic', 'curated');--> statement-breakpoint
CREATE TYPE "public"."session_recording_source" AS ENUM('upload', 'external');--> statement-breakpoint
CREATE TYPE "public"."share_link_view" AS ENUM('agenda', 'itinerary', 'sessions', 'speakers', 'gallery', 'sponsors');--> statement-breakpoint
CREATE TYPE "public"."sms_consent_status" AS ENUM('opted_in', 'opted_out');--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('queued', 'sent', 'delivered', 'undelivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."speaker_workflow_status" AS ENUM('invited', 'confirmed', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."sponsor_kind" AS ENUM('sponsor', 'exhibitor');--> statement-breakpoint
CREATE TYPE "public"."sponsor_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."submission_stage" AS ENUM('accept', 'decline', 'hold');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'under_review', 'accepted', 'declined', 'waitlisted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_audience" AS ENUM('all_participants', 'accepted_participants', 'manual');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('form', 'file_upload', 'acknowledge', 'link');--> statement-breakpoint
CREATE TYPE "public"."task_scope" AS ENUM('contact', 'group', 'submission');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('not_started', 'in_progress', 'completed', 'waived');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('queued', 'delivered', 'failed');--> statement-breakpoint
CREATE TABLE "accelevents_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid,
	"remote_id" text,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"request_body" jsonb,
	"response_body" jsonb,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"review_round_id" uuid,
	"model" text NOT NULL,
	"rationale_markdown" text NOT NULL,
	"criterion_scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airtable_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"remote_record_id" text,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airtable_sync_entity" UNIQUE("event_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" "api_key_scope" DEFAULT 'write' NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"job_title" text,
	"company" text,
	"bio_markdown" text,
	"headshot_url" text,
	"location" text,
	"source" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"merged_into_contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_owner_email" UNIQUE("owner_user_id","email")
);
--> statement-breakpoint
CREATE TABLE "contact_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"prospect_id" uuid,
	"kind" "contact_activity_kind" NOT NULL,
	"summary" text NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"event_id" uuid,
	"subject" text NOT NULL,
	"body_markdown" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_campaign_recipient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid,
	"email" text NOT NULL,
	"rendered_subject" text NOT NULL,
	"email_log_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_event_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_event_link_pair" UNIQUE("contact_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "contact_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"prospect_id" uuid,
	"author_user_id" uuid,
	"author_name" text NOT NULL,
	"body_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "segment_kind" DEFAULT 'dynamic' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"member_contact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_kind" "content_revision_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"summary" text NOT NULL,
	"editor_user_id" uuid,
	"editor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revision_entity_number" UNIQUE("event_id","entity_kind","entity_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "crm_field" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "field_type" NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_field_owner_key" UNIQUE("owner_user_id","key")
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"to_email" text NOT NULL,
	"from_email" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"template_key" text,
	"ics_body" text,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_markdown" text NOT NULL,
	"sms_body" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"attach_ics" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_template_event_key" UNIQUE("event_id","key")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"description_markdown" text,
	"event_type" text,
	"theme" text,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"starts_on" text NOT NULL,
	"ends_on" text NOT NULL,
	"website_url" text,
	"venue_name" text,
	"venue_address" text,
	"logo_file_id" uuid,
	"banner_file_id" uuid,
	"owner_user_id" uuid NOT NULL,
	"submission_seq" integer DEFAULT 0 NOT NULL,
	"session_seq" integer DEFAULT 0 NOT NULL,
	"agenda_conflict_policy" text DEFAULT 'warn' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_slug_unique" UNIQUE("slug"),
	CONSTRAINT "event_agenda_conflict_policy_check" CHECK ("event"."agenda_conflict_policy" in ('warn', 'block'))
);
--> statement-breakpoint
CREATE TABLE "event_exhibitor_map" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_exhibitor_map_file_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "field_library_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "field_type" NOT NULL,
	"help_text" text,
	"options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_library_event_key" UNIQUE("event_id","key")
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by_user_id" uuid,
	"root_file_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_blob" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
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
CREATE TABLE "file_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"accepted_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_size_mb" integer DEFAULT 25 NOT NULL,
	"allow_multiple" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "form_kind" DEFAULT 'cfp' NOT NULL,
	"target_type" "form_target_type" DEFAULT 'abstract' NOT NULL,
	"collects_participants" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"external_title" text,
	"page_heading" text,
	"show_welcome" boolean DEFAULT true NOT NULL,
	"status" "form_status" DEFAULT 'draft' NOT NULL,
	"intro_markdown" text,
	"max_participants" integer,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"max_submissions_per_user" integer,
	"allow_drafts" boolean DEFAULT true NOT NULL,
	"notify_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmation_subject" text,
	"confirmation_body_markdown" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_event_slug" UNIQUE("event_id","slug")
);
--> statement-breakpoint
CREATE TABLE "form_field" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"type" "field_type" NOT NULL,
	"key" text NOT NULL,
	"builtin_key" text,
	"label" text NOT NULL,
	"help_text" text,
	"placeholder" text,
	"required" boolean DEFAULT false NOT NULL,
	"entity" "form_field_entity" DEFAULT 'abstract' NOT NULL,
	"options" jsonb,
	"show_if" jsonb,
	"min_length" integer,
	"max_length" integer,
	"char_limit_group" text,
	"library_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_field_form_key" UNIQUE("form_id","key")
);
--> statement-breakpoint
CREATE TABLE "form_participant_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"kind" "participant_role_kind" NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"min_count" integer DEFAULT 0 NOT NULL,
	"max_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_participant_role_form_kind" UNIQUE("form_id","kind")
);
--> statement-breakpoint
CREATE TABLE "inbound_rate_limit" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_user_event_role" UNIQUE("user_id","event_id","role")
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid,
	"scope_key" text NOT NULL,
	"template_key" text DEFAULT '*' NOT NULL,
	"notify_email" boolean,
	"notify_sms" boolean,
	"timezone" text,
	"quiet_start_minute" integer,
	"quiet_end_minute" integer,
	"sms_hourly_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preference_user_scope_template" UNIQUE("user_id","scope_key","template_key"),
	CONSTRAINT "notification_preference_scope_check" CHECK (("notification_preference"."scope_key" = 'global' and "notification_preference"."event_id" is null) or "notification_preference"."scope_key" = "notification_preference"."event_id"::text),
	CONSTRAINT "notification_preference_quiet_start_check" CHECK ("notification_preference"."quiet_start_minute" is null or ("notification_preference"."quiet_start_minute" between 0 and 1439)),
	CONSTRAINT "notification_preference_quiet_end_check" CHECK ("notification_preference"."quiet_end_minute" is null or ("notification_preference"."quiet_end_minute" between 0 and 1439)),
	CONSTRAINT "notification_preference_quiet_window_check" CHECK (("notification_preference"."quiet_start_minute" is null) = ("notification_preference"."quiet_end_minute" is null)),
	CONSTRAINT "notification_preference_sms_rate_check" CHECK ("notification_preference"."sms_hourly_limit" is null or ("notification_preference"."sms_hourly_limit" between 1 and 100))
);
--> statement-breakpoint
CREATE TABLE "participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text,
	"salutation" text,
	"honorific" text,
	"pronouns" text,
	"gender" text,
	"job_title" text,
	"company" text,
	"bio_markdown" text,
	"headshot_file_id" uuid,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timezone" text,
	"workflow_status" "speaker_workflow_status" DEFAULT 'invited' NOT NULL,
	"dietary_notes" text,
	"accessibility_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_event_user" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "participant_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"kind" "participant_role_kind" DEFAULT 'speaker' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_role_pair" UNIQUE("submission_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "persona" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_verification_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"delivery_transport" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_verification_transport_check" CHECK ("phone_verification_challenge"."delivery_transport" in ('log', 'twilio'))
);
--> statement-breakpoint
CREATE TABLE "portal_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"allow_raw_html" boolean DEFAULT true NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_page_event_slug" UNIQUE("event_id","slug")
);
--> statement-breakpoint
CREATE TABLE "portal_theme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"logo_file_id" uuid,
	"accent_color" text,
	"welcome_markdown" text,
	"support_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_theme_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "prospect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"event_id" uuid,
	"stage" "prospect_stage" DEFAULT 'identified' NOT NULL,
	"score" integer,
	"rationale" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_round_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"status" "review_assignment_status" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "review_assignment_triple" UNIQUE("review_round_id","submission_id","reviewer_user_id")
);
--> statement-breakpoint
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
CREATE TABLE "review_round" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" "review_round_status" DEFAULT 'draft' NOT NULL,
	"decision_queue_bar_tenths" integer DEFAULT 30 NOT NULL,
	"blind_until_close" boolean DEFAULT true NOT NULL,
	"anonymized" boolean DEFAULT false NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_round_decision_queue_bar_range" CHECK ("review_round"."decision_queue_bar_tenths" between 10 and 50)
);
--> statement-breakpoint
CREATE TABLE "room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"floor" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_event_name" UNIQUE("event_id","name")
);
--> statement-breakpoint
CREATE TABLE "saved_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"submission_id" uuid,
	"ref" integer NOT NULL,
	"title" text NOT NULL,
	"description_markdown" text,
	"room_id" uuid,
	"track_id" uuid,
	"format_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" "scheduled_session_status" DEFAULT 'draft' NOT NULL,
	"ceu_credits" text,
	"client_id" text,
	"ics_uid" text NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_session_event_ref" UNIQUE("event_id","ref")
);
--> statement-breakpoint
CREATE TABLE "score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_assignment_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"value" integer,
	"text_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_assignment_criterion" UNIQUE("review_assignment_id","criterion_id")
);
--> statement-breakpoint
CREATE TABLE "scorecard_criterion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_round_id" uuid NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"type" "scorecard_criterion_type" DEFAULT 'numeric' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"max_score" integer DEFAULT 5 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_cookie" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"impersonated_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_cookie_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "session_format" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "share_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"label" text NOT NULL,
	"view" "share_link_view" DEFAULT 'agenda' NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_link_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
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
CREATE TABLE "sms_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"to_phone" text NOT NULL,
	"from_phone" text NOT NULL,
	"body" text NOT NULL,
	"template_key" text,
	"status" "sms_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"status_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "sponsor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "sponsor_kind" DEFAULT 'sponsor' NOT NULL,
	"status" "sponsor_status" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"tier" text,
	"website_url" text,
	"description" text,
	"booth_location" text,
	"logo_file_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_event_kind_name" UNIQUE("event_id","kind","name")
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"ref" integer NOT NULL,
	"submitter_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description_markdown" text,
	"format_id" uuid,
	"track_id" uuid,
	"level" text,
	"persona_id" uuid,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"content_status" "content_approval_status" DEFAULT 'approved' NOT NULL,
	"staged_decision" "submission_stage",
	"staged_at" timestamp with time zone,
	"staged_by_user_id" uuid,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_event_ref" UNIQUE("event_id","ref")
);
--> statement-breakpoint
CREATE TABLE "submission_tag" (
	"submission_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "submission_tag_pair" UNIQUE("submission_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_event_name" UNIQUE("event_id","name")
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description_markdown" text,
	"kind" "task_kind" NOT NULL,
	"audience" "task_audience" DEFAULT 'accepted_participants' NOT NULL,
	"scope" "task_scope" DEFAULT 'contact' NOT NULL,
	"submission_id" uuid,
	"form_id" uuid,
	"file_request_id" uuid,
	"link_url" text,
	"due_at" timestamp with time zone,
	"required" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"reminder_days_before" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reminder_days_after_send" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_reminder_days_after_send_positive" CHECK ("task"."reminder_days_after_send" is null or "task"."reminder_days_after_send" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"status" "task_status" DEFAULT 'not_started' NOT NULL,
	"submission_id" uuid,
	"scope" "task_scope" DEFAULT 'contact' NOT NULL,
	"file_id" uuid,
	"answers" jsonb,
	"completed_at" timestamp with time zone,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_event_name" UNIQUE("event_id","name")
);
--> statement-breakpoint
CREATE TABLE "track_reviewer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_reviewer_pair" UNIQUE("track_id","reviewer_user_id")
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unsubscribe_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"phone_verification_transport" text,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_sms" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phone_e164_check" CHECK ("user"."phone" is null or "user"."phone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"signing_secret" text NOT NULL,
	"secret_prefix" text NOT NULL,
	"event_types" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoint_event_url" UNIQUE("event_id","url")
);
--> statement-breakpoint
ALTER TABLE "accelevents_sync" ADD CONSTRAINT "accelevents_sync_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_sync" ADD CONSTRAINT "accelevents_sync_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review" ADD CONSTRAINT "ai_review_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review" ADD CONSTRAINT "ai_review_review_round_id_review_round_id_fk" FOREIGN KEY ("review_round_id") REFERENCES "public"."review_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_sync" ADD CONSTRAINT "airtable_sync_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_activity" ADD CONSTRAINT "contact_activity_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_activity" ADD CONSTRAINT "contact_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_campaign" ADD CONSTRAINT "contact_campaign_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_campaign" ADD CONSTRAINT "contact_campaign_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_campaign_recipient" ADD CONSTRAINT "contact_campaign_recipient_campaign_id_contact_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."contact_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_campaign_recipient" ADD CONSTRAINT "contact_campaign_recipient_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_campaign_recipient" ADD CONSTRAINT "contact_campaign_recipient_email_log_id_email_log_id_fk" FOREIGN KEY ("email_log_id") REFERENCES "public"."email_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_event_link" ADD CONSTRAINT "contact_event_link_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_event_link" ADD CONSTRAINT "contact_event_link_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_event_link" ADD CONSTRAINT "contact_event_link_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_note" ADD CONSTRAINT "contact_note_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_note" ADD CONSTRAINT "contact_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_segment" ADD CONSTRAINT "contact_segment_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_editor_user_id_user_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_field" ADD CONSTRAINT "crm_field_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_exhibitor_map" ADD CONSTRAINT "event_exhibitor_map_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_exhibitor_map" ADD CONSTRAINT "event_exhibitor_map_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_library_entry" ADD CONSTRAINT "field_library_entry_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comment" ADD CONSTRAINT "file_comment_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comment" ADD CONSTRAINT "file_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_request" ADD CONSTRAINT "file_request_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form" ADD CONSTRAINT "form_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_form_id_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_field" ADD CONSTRAINT "form_field_library_entry_id_field_library_entry_id_fk" FOREIGN KEY ("library_entry_id") REFERENCES "public"."field_library_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_participant_role" ADD CONSTRAINT "form_participant_role_form_id_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_token" ADD CONSTRAINT "magic_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_token" ADD CONSTRAINT "magic_token_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant" ADD CONSTRAINT "participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_role" ADD CONSTRAINT "participant_role_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_role" ADD CONSTRAINT "participant_role_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona" ADD CONSTRAINT "persona_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_verification_challenge" ADD CONSTRAINT "phone_verification_challenge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_page" ADD CONSTRAINT "portal_page_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_theme" ADD CONSTRAINT "portal_theme_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_review_round_id_review_round_id_fk" FOREIGN KEY ("review_round_id") REFERENCES "public"."review_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_review_round_id_review_round_id_fk" FOREIGN KEY ("review_round_id") REFERENCES "public"."review_round"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_recusal" ADD CONSTRAINT "review_recusal_released_by_user_id_user_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_round" ADD CONSTRAINT "review_round_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_session" ADD CONSTRAINT "scheduled_session_format_id_session_format_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."session_format"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_review_assignment_id_review_assignment_id_fk" FOREIGN KEY ("review_assignment_id") REFERENCES "public"."review_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_criterion_id_scorecard_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."scorecard_criterion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_criterion" ADD CONSTRAINT "scorecard_criterion_review_round_id_review_round_id_fk" FOREIGN KEY ("review_round_id") REFERENCES "public"."review_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_cookie" ADD CONSTRAINT "session_cookie_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_cookie" ADD CONSTRAINT "session_cookie_impersonated_by_user_id_user_id_fk" FOREIGN KEY ("impersonated_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_format" ADD CONSTRAINT "session_format_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recording" ADD CONSTRAINT "session_recording_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recording" ADD CONSTRAINT "session_recording_session_id_scheduled_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."scheduled_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_recording" ADD CONSTRAINT "session_recording_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_log" ADD CONSTRAINT "sms_log_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_unavailability" ADD CONSTRAINT "speaker_unavailability_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_unavailability" ADD CONSTRAINT "speaker_unavailability_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor" ADD CONSTRAINT "sponsor_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_form_id_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_submitter_user_id_user_id_fk" FOREIGN KEY ("submitter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_format_id_session_format_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."session_format"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_staged_by_user_id_user_id_fk" FOREIGN KEY ("staged_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_tag" ADD CONSTRAINT "submission_tag_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_tag" ADD CONSTRAINT "submission_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_form_id_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."form"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_file_request_id_file_request_id_fk" FOREIGN KEY ("file_request_id") REFERENCES "public"."file_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment" ADD CONSTRAINT "task_assignment_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment" ADD CONSTRAINT "task_assignment_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment" ADD CONSTRAINT "task_assignment_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignment" ADD CONSTRAINT "task_assignment_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_reviewer" ADD CONSTRAINT "track_reviewer_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_reviewer" ADD CONSTRAINT "track_reviewer_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_token" ADD CONSTRAINT "unsubscribe_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_token" ADD CONSTRAINT "unsubscribe_token_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accelevents_sync_event_idx" ON "accelevents_sync" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ai_review_submission_idx" ON "ai_review" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "api_key_prefix_idx" ON "api_key" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "contact_owner_idx" ON "contact" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "contact_name_idx" ON "contact" USING btree ("name");--> statement-breakpoint
CREATE INDEX "contact_activity_contact_idx" ON "contact_activity" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_campaign_owner_idx" ON "contact_campaign" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "contact_campaign_recipient_idx" ON "contact_campaign_recipient" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "contact_event_link_contact_idx" ON "contact_event_link" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_note_contact_idx" ON "contact_note" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_segment_owner_idx" ON "contact_segment" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "content_revision_entity_idx" ON "content_revision" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "email_log_event_created_idx" ON "email_log" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "file_event_idx" ON "file" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "file_root_idx" ON "file" USING btree ("root_file_id");--> statement-breakpoint
CREATE INDEX "file_comment_file_idx" ON "file_comment" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_request_event_idx" ON "file_request" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "form_field_form_idx" ON "form_field" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "form_participant_role_form_idx" ON "form_participant_role" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "magic_token_user_idx" ON "magic_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "membership_event_idx" ON "membership" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "notification_preference_event_idx" ON "notification_preference" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "participant_role_participant_idx" ON "participant_role" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "persona_event_idx" ON "persona" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "phone_verification_user_created_idx" ON "phone_verification_challenge" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "prospect_owner_stage_idx" ON "prospect" USING btree ("owner_user_id","stage");--> statement-breakpoint
CREATE INDEX "review_assignment_reviewer_idx" ON "review_assignment" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_assignment_submission_idx" ON "review_assignment" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "review_recusal_submission_idx" ON "review_recusal" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "review_recusal_reviewer_idx" ON "review_recusal" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "review_round_event_idx" ON "review_round" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "room_event_idx" ON "room" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "saved_view_user_surface_idx" ON "saved_view" USING btree ("user_id","surface");--> statement-breakpoint
CREATE INDEX "scheduled_session_event_start_idx" ON "scheduled_session" USING btree ("event_id","starts_at");--> statement-breakpoint
CREATE INDEX "scheduled_session_room_idx" ON "scheduled_session" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "scorecard_criterion_round_idx" ON "scorecard_criterion" USING btree ("review_round_id");--> statement-breakpoint
CREATE INDEX "session_cookie_user_idx" ON "session_cookie" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_format_event_idx" ON "session_format" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "session_recording_event_idx" ON "session_recording" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "share_link_prefix_idx" ON "share_link" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "share_link_event_idx" ON "share_link" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sms_log_event_created_idx" ON "sms_log" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_log_provider_message_idx" ON "sms_log" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "speaker_unavailability_participant_idx" ON "speaker_unavailability" USING btree ("participant_id","starts_at");--> statement-breakpoint
CREATE INDEX "speaker_unavailability_event_idx" ON "speaker_unavailability" USING btree ("event_id","starts_at");--> statement-breakpoint
CREATE INDEX "sponsor_event_idx" ON "sponsor" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "submission_event_status_idx" ON "submission" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "submission_form_idx" ON "submission" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "task_event_idx" ON "task" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignment_contact_key" ON "task_assignment" USING btree ("task_id","participant_id") WHERE "task_assignment"."submission_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignment_session_key" ON "task_assignment" USING btree ("task_id","participant_id","submission_id") WHERE "task_assignment"."submission_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "task_assignment_group_key" ON "task_assignment" USING btree ("task_id","submission_id") WHERE "task_assignment"."scope" = 'group';--> statement-breakpoint
CREATE INDEX "task_assignment_participant_idx" ON "task_assignment" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "task_assignment_submission_idx" ON "task_assignment" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "task_assignment_status_idx" ON "task_assignment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "track_event_idx" ON "track" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "track_reviewer_track_idx" ON "track_reviewer" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "track_reviewer_reviewer_idx" ON "track_reviewer" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX "unsubscribe_token_hash_idx" ON "unsubscribe_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_created_idx" ON "webhook_delivery" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpoint_created_idx" ON "webhook_delivery" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_event_idx" ON "webhook_endpoint" USING btree ("event_id");