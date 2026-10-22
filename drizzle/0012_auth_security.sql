CREATE TABLE "auth_rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_rate_limit_window_idx" ON "auth_rate_limit" USING btree ("window_started_at");
--> statement-breakpoint
-- Revoke sessions created by the now-disabled admin impersonation feature.
DELETE FROM "session" WHERE "impersonated_by" IS NOT NULL;
