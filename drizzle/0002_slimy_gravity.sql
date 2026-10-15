CREATE TABLE "account_reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"opening_balance" numeric(20, 4) NOT NULL,
	"closing_balance" numeric(20, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "cleared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "reconciliation_id" uuid;--> statement-breakpoint
ALTER TABLE "account_reconciliation" ADD CONSTRAINT "account_reconciliation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_reconciliation" ADD CONSTRAINT "account_reconciliation_account_id_financial_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_account_period_idx" ON "account_reconciliation" USING btree ("account_id","currency","start_date","end_date");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_reconciliation_id_account_reconciliation_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."account_reconciliation"("id") ON DELETE set null ON UPDATE no action;