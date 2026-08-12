CREATE TABLE "file_blob" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
