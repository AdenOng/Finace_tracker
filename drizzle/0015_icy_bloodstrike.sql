CREATE TABLE "transfer_exclusion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"transaction_id" uuid,
	"investment_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_exclusion_transaction_uq" UNIQUE("transaction_id"),
	CONSTRAINT "transfer_exclusion_investment_uq" UNIQUE("investment_transaction_id"),
	CONSTRAINT "transfer_exclusion_side_ck" CHECK (num_nonnulls("transfer_exclusion"."transaction_id", "transfer_exclusion"."investment_transaction_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "transfer_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"outgoing_transaction_id" uuid,
	"outgoing_investment_id" uuid,
	"incoming_transaction_id" uuid,
	"incoming_investment_id" uuid,
	"fee_amount" numeric(20, 4),
	"fee_currency" varchar(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_link_outgoing_transaction_uq" UNIQUE("outgoing_transaction_id"),
	CONSTRAINT "transfer_link_incoming_transaction_uq" UNIQUE("incoming_transaction_id"),
	CONSTRAINT "transfer_link_outgoing_investment_uq" UNIQUE("outgoing_investment_id"),
	CONSTRAINT "transfer_link_incoming_investment_uq" UNIQUE("incoming_investment_id"),
	CONSTRAINT "transfer_link_outgoing_ck" CHECK (num_nonnulls("transfer_link"."outgoing_transaction_id", "transfer_link"."outgoing_investment_id") = 1),
	CONSTRAINT "transfer_link_incoming_ck" CHECK (num_nonnulls("transfer_link"."incoming_transaction_id", "transfer_link"."incoming_investment_id") = 1),
	CONSTRAINT "transfer_link_distinct_ck" CHECK ("transfer_link"."outgoing_transaction_id" is distinct from "transfer_link"."incoming_transaction_id" or "transfer_link"."outgoing_investment_id" is distinct from "transfer_link"."incoming_investment_id"),
	CONSTRAINT "transfer_link_fee_ck" CHECK (("transfer_link"."fee_amount" is null and "transfer_link"."fee_currency" is null) or ("transfer_link"."fee_amount" is not null and "transfer_link"."fee_amount" >= 0 and "transfer_link"."fee_currency" is not null))
);
--> statement-breakpoint
ALTER TABLE "transfer_exclusion" ADD CONSTRAINT "transfer_exclusion_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_exclusion" ADD CONSTRAINT "transfer_exclusion_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_exclusion" ADD CONSTRAINT "transfer_exclusion_investment_transaction_id_investment_transaction_id_fk" FOREIGN KEY ("investment_transaction_id") REFERENCES "public"."investment_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_link" ADD CONSTRAINT "transfer_link_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_link" ADD CONSTRAINT "transfer_link_outgoing_transaction_id_transaction_id_fk" FOREIGN KEY ("outgoing_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_link" ADD CONSTRAINT "transfer_link_outgoing_investment_id_investment_transaction_id_fk" FOREIGN KEY ("outgoing_investment_id") REFERENCES "public"."investment_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_link" ADD CONSTRAINT "transfer_link_incoming_transaction_id_transaction_id_fk" FOREIGN KEY ("incoming_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_link" ADD CONSTRAINT "transfer_link_incoming_investment_id_investment_transaction_id_fk" FOREIGN KEY ("incoming_investment_id") REFERENCES "public"."investment_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_exclusion_owner_idx" ON "transfer_exclusion" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transfer_link_owner_idx" ON "transfer_link" USING btree ("owner_id");--> statement-breakpoint
-- Serialize both roles of a side too: per-column UNIQUE alone cannot prevent cross-role reuse.
CREATE FUNCTION transfer_link_unique_sides() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM "transaction"
    WHERE id IN (NEW.outgoing_transaction_id, NEW.incoming_transaction_id)
    ORDER BY id FOR UPDATE;
  PERFORM id FROM investment_transaction
    WHERE id IN (NEW.outgoing_investment_id, NEW.incoming_investment_id)
    ORDER BY id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM transfer_link AS existing
    WHERE existing.id <> NEW.id AND (
      existing.outgoing_transaction_id IN (NEW.outgoing_transaction_id, NEW.incoming_transaction_id)
      OR existing.incoming_transaction_id IN (NEW.outgoing_transaction_id, NEW.incoming_transaction_id)
      OR existing.outgoing_investment_id IN (NEW.outgoing_investment_id, NEW.incoming_investment_id)
      OR existing.incoming_investment_id IN (NEW.outgoing_investment_id, NEW.incoming_investment_id)
    )
  ) THEN
    RAISE EXCEPTION 'Transfer side is already linked' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfer_link_unique_sides
  BEFORE INSERT OR UPDATE ON transfer_link
  FOR EACH ROW EXECUTE FUNCTION transfer_link_unique_sides();
