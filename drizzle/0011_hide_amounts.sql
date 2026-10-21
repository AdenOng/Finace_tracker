ALTER TABLE "user_settings" ADD COLUMN "hide_amounts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "amount_scopes" jsonb DEFAULT '{}'::jsonb NOT NULL;