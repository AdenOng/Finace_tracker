CREATE TABLE "admin_bootstrap" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_bootstrap_single_row" CHECK ("admin_bootstrap"."id" = 1)
);
