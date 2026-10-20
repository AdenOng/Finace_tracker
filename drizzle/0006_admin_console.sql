CREATE TABLE "instance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"two_factor_policy" text,
	"max_session_days" integer,
	"workspace_invite_signups" boolean DEFAULT true NOT NULL,
	"new_device_alerts" boolean DEFAULT true NOT NULL,
	"document_retention_days" integer,
	"fallback_provider_id" uuid,
	"provider_health_checks" boolean DEFAULT true NOT NULL,
	"cpf_srs_enabled" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_single_row" CHECK ("instance_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sign_in_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"email" text,
	"success" boolean NOT NULL,
	"method" text NOT NULL,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"device" text,
	"session_id" text,
	"new_device" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "file_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "last_tested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "last_test_ok" boolean;--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "last_test_error" text;--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "last_test_latency_ms" integer;--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "input_cost_per_mtok" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "output_cost_per_mtok" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "monthly_token_limit" integer;--> statement-breakpoint
ALTER TABLE "llm_provider" ADD COLUMN "pause_at_limit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_fallback_provider_id_llm_provider_id_fk" FOREIGN KEY ("fallback_provider_id") REFERENCES "public"."llm_provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_in_event" ADD CONSTRAINT "sign_in_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sign_in_event_created_idx" ON "sign_in_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sign_in_event_user_idx" ON "sign_in_event" USING btree ("user_id","created_at");