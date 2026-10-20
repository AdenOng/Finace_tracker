CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid,
	"job_id" uuid,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_provider_id_llm_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."llm_provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_usage_provider_created_idx" ON "llm_usage" USING btree ("provider_id","created_at");--> statement-breakpoint
-- Carry over tokens already recorded on extraction jobs, so this month's limits stay accurate.
INSERT INTO "llm_usage" ("provider_id", "job_id", "model", "input_tokens", "output_tokens", "created_at")
SELECT "provider_id", "id", "model", coalesce("input_tokens", 0), coalesce("output_tokens", 0), coalesce("finished_at", "created_at")
FROM "extraction_job"
WHERE coalesce("input_tokens", 0) + coalesce("output_tokens", 0) > 0;
