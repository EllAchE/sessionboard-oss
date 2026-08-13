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
ALTER TABLE "user" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_verification_transport" text;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_verification_challenge" ADD CONSTRAINT "phone_verification_challenge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_token" ADD CONSTRAINT "unsubscribe_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_token" ADD CONSTRAINT "unsubscribe_token_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_preference_event_idx" ON "notification_preference" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "phone_verification_user_created_idx" ON "phone_verification_challenge" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "unsubscribe_token_hash_idx" ON "unsubscribe_token" USING btree ("token_hash");