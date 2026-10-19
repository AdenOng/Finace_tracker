CREATE TYPE "public"."cpf_bucket" AS ENUM('oa', 'sa', 'ma', 'ra');--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'cpf';--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'srs';--> statement-breakpoint
ALTER TABLE "cash_balance" ADD COLUMN "bucket" "cpf_bucket";--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "count_cpf_srs" boolean DEFAULT true NOT NULL;