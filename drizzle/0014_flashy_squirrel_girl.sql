ALTER TABLE "investment_transaction" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "reference" text;--> statement-breakpoint
UPDATE "staged_row"
SET "decision" = 'pending'
FROM "extraction_job"
WHERE "staged_row"."job_id" = "extraction_job"."id"
  AND "extraction_job"."status" = 'needs_review'
  AND "staged_row"."match_status" = 'possible_duplicate'
  AND "staged_row"."decision" = 'accept'
  AND "staged_row"."committed_record_id" IS NULL;
