CREATE TYPE "public"."account_type" AS ENUM('brokerage', 'retirement', 'checking', 'savings', 'credit_card', 'crypto_wallet', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('stock', 'etf', 'fund', 'bond', 'option', 'crypto', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('expense', 'income', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('ai', 'user', 'rule');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('bank_statement', 'card_statement', 'brokerage_statement', 'trade_confirmation', 'screenshot', 'csv', 'other');--> statement-breakpoint
CREATE TYPE "public"."ingest_method" AS ENUM('api', 'csv', 'statement_ocr');--> statement-breakpoint
CREATE TYPE "public"."institution_kind" AS ENUM('broker', 'bank', 'card_issuer', 'crypto_exchange', 'depository', 'other');--> statement-breakpoint
CREATE TYPE "public"."investment_txn_type" AS ENUM('buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'split', 'fx', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'needs_review', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."llm_provider_kind" AS ENUM('opencode', 'openai_compatible', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('new', 'duplicate', 'possible_duplicate');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('manual', 'statement', 'api');--> statement-breakpoint
CREATE TYPE "public"."staged_decision" AS ENUM('pending', 'accept', 'skip');--> statement-breakpoint
CREATE TYPE "public"."staged_row_kind" AS ENUM('transaction', 'investment_transaction', 'position', 'cash_balance');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"source" "record_source" NOT NULL,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" numeric(20, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" DEFAULT 'expense' NOT NULL,
	"parent_id" uuid,
	"color" varchar(7),
	"ai_hint" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "currency" (
	"code" varchar(3) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"minor_units" integer DEFAULT 2 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid,
	"institution_id" uuid,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"kind" "document_kind" DEFAULT 'other' NOT NULL,
	"period_start" date,
	"period_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_owner_sha_uq" UNIQUE("owner_id","sha256")
);
--> statement-breakpoint
CREATE TABLE "extraction_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"document_id" uuid NOT NULL,
	"provider_id" uuid,
	"model" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"institution_id" uuid,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" varchar(3) DEFAULT 'SGD' NOT NULL,
	"last4" varchar(4),
	"external_ref" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"date" date NOT NULL,
	"base" varchar(3) NOT NULL,
	"quote" varchar(3) NOT NULL,
	"rate" numeric(24, 10) NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "fx_rate_date_base_quote_pk" PRIMARY KEY("date","base","quote")
);
--> statement-breakpoint
CREATE TABLE "institution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "institution_kind" NOT NULL,
	"country" varchar(2),
	"website" text,
	"ingest_methods" "ingest_method"[] DEFAULT '{"statement_ocr"}' NOT NULL,
	"api_adapter" text,
	"extraction_hints" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "investment_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"security_id" uuid,
	"type" "investment_txn_type" NOT NULL,
	"trade_date" date NOT NULL,
	"settle_date" date,
	"quantity" numeric(28, 10),
	"price" numeric(24, 8),
	"amount" numeric(20, 4) NOT NULL,
	"fees" numeric(20, 4),
	"currency" varchar(3) NOT NULL,
	"description" text,
	"source" "record_source" DEFAULT 'manual' NOT NULL,
	"fingerprint" text NOT NULL,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_txn_account_fingerprint_uq" UNIQUE("account_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "llm_provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"kind" "llm_provider_kind" NOT NULL,
	"base_url" text,
	"api_key_encrypted" text,
	"default_model" text NOT NULL,
	"supports_vision" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"pattern" text NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "networth_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"date" date NOT NULL,
	"currency" varchar(3) NOT NULL,
	"total" numeric(20, 4) NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "networth_owner_date_uq" UNIQUE("owner_id","date")
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"security_id" uuid NOT NULL,
	"quantity" numeric(28, 10) NOT NULL,
	"average_cost" numeric(24, 8),
	"cost_currency" varchar(3),
	"statement_price" numeric(24, 8),
	"statement_value" numeric(20, 4)
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"security_id" uuid NOT NULL,
	"date" date NOT NULL,
	"close" numeric(24, 8) NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "price_history_security_id_date_pk" PRIMARY KEY("security_id","date")
);
--> statement-breakpoint
CREATE TABLE "security" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text DEFAULT '' NOT NULL,
	"name" text,
	"asset_class" "asset_class" DEFAULT 'stock' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"isin" varchar(12),
	"country" varchar(2),
	"provider_symbols" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_symbol_exchange_uq" UNIQUE("symbol","exchange")
);
--> statement-breakpoint
CREATE TABLE "security_quote" (
	"security_id" uuid PRIMARY KEY NOT NULL,
	"price" numeric(24, 8) NOT NULL,
	"previous_close" numeric(24, 8),
	"currency" varchar(3) NOT NULL,
	"source" text NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staged_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "staged_row_kind" NOT NULL,
	"data" jsonb NOT NULL,
	"match_status" "match_status" DEFAULT 'new' NOT NULL,
	"matched_record_id" uuid,
	"decision" "staged_decision" DEFAULT 'pending' NOT NULL,
	"committed_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"posted_date" date NOT NULL,
	"transaction_date" date,
	"description" text NOT NULL,
	"merchant" text,
	"amount" numeric(20, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"original_amount" numeric(20, 4),
	"original_currency" varchar(3),
	"category_id" uuid,
	"category_source" "category_source",
	"is_transfer" boolean DEFAULT false NOT NULL,
	"notes" text,
	"source" "record_source" DEFAULT 'manual' NOT NULL,
	"fingerprint" text NOT NULL,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_account_fingerprint_uq" UNIQUE("account_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_currency" varchar(3) DEFAULT 'SGD' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshot" ADD CONSTRAINT "account_snapshot_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshot" ADD CONSTRAINT "account_snapshot_account_id_financial_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshot" ADD CONSTRAINT "account_snapshot_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_balance" ADD CONSTRAINT "cash_balance_snapshot_id_account_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."account_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_account_id_financial_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_institution_id_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_job" ADD CONSTRAINT "extraction_job_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_job" ADD CONSTRAINT "extraction_job_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_job" ADD CONSTRAINT "extraction_job_provider_id_llm_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."llm_provider"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_institution_id_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction" ADD CONSTRAINT "investment_transaction_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction" ADD CONSTRAINT "investment_transaction_account_id_financial_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction" ADD CONSTRAINT "investment_transaction_security_id_security_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."security"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction" ADD CONSTRAINT "investment_transaction_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_provider" ADD CONSTRAINT "llm_provider_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rule" ADD CONSTRAINT "merchant_rule_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rule" ADD CONSTRAINT "merchant_rule_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "networth_snapshot" ADD CONSTRAINT "networth_snapshot_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_snapshot_id_account_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."account_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_security_id_security_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."security"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_security_id_security_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."security"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_quote" ADD CONSTRAINT "security_quote_security_id_security_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."security"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_row" ADD CONSTRAINT "staged_row_job_id_extraction_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."extraction_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_row" ADD CONSTRAINT "staged_row_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_financial_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_snapshot_account_asof_idx" ON "account_snapshot" USING btree ("account_id","as_of");--> statement-breakpoint
CREATE INDEX "cash_balance_snapshot_idx" ON "cash_balance" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "extraction_job_owner_status_idx" ON "extraction_job" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "financial_account_owner_idx" ON "financial_account" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "institution_kind_idx" ON "institution" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "investment_txn_owner_date_idx" ON "investment_transaction" USING btree ("owner_id","trade_date");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "llm_provider_owner_idx" ON "llm_provider" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "merchant_rule_owner_idx" ON "merchant_rule" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credential_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "position_snapshot_idx" ON "position" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staged_row_job_idx" ON "staged_row" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "transaction_owner_date_idx" ON "transaction" USING btree ("owner_id","posted_date");--> statement-breakpoint
CREATE INDEX "transaction_category_idx" ON "transaction" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");