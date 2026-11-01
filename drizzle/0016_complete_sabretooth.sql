CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "card_payment_account" (
	"card_account_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"card_account_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"statement_date" date NOT NULL,
	"due_date" date NOT NULL,
	"amount_due" numeric(20, 4) NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_statement_date_uq" UNIQUE("card_account_id","statement_date"),
	CONSTRAINT "card_statement_amount_ck" CHECK ("card_statement"."amount_due" >= 0),
	CONSTRAINT "card_statement_dates_ck" CHECK ("card_statement"."due_date" > "card_statement"."statement_date")
);
--> statement-breakpoint
CREATE TABLE "recurring_occurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_occurrence_due_uq" UNIQUE("schedule_id","due_date"),
	CONSTRAINT "recurring_occurrence_transaction_uq" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" text NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_nonzero_ck" CHECK ("recurring_schedule"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "card_payment_account" ADD CONSTRAINT "card_payment_account_card_account_id_financial_account_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_payment_account" ADD CONSTRAINT "card_payment_account_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_payment_account" ADD CONSTRAINT "card_payment_account_bank_account_id_financial_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_card_account_id_financial_account_id_fk" FOREIGN KEY ("card_account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_statement" ADD CONSTRAINT "card_statement_bank_account_id_financial_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrence" ADD CONSTRAINT "recurring_occurrence_schedule_id_recurring_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."recurring_schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrence" ADD CONSTRAINT "recurring_occurrence_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_account_id_financial_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_statement_owner_idx" ON "card_statement" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "recurring_schedule_owner_idx" ON "recurring_schedule" USING btree ("owner_id");