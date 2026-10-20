ALTER TABLE "security" DROP CONSTRAINT "security_symbol_exchange_uq";--> statement-breakpoint
ALTER TABLE "security" ADD CONSTRAINT "security_listing_uq" UNIQUE("symbol","exchange","currency");