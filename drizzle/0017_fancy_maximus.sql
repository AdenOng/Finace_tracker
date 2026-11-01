CREATE TABLE "llm_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_reservation" ADD CONSTRAINT "llm_reservation_provider_id_llm_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."llm_provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_reservation_provider_idx" ON "llm_reservation" USING btree ("provider_id","expires_at");