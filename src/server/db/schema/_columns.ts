import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/** Shared column builders so every domain table follows the same conventions. */

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Money is stored as NUMERIC and surfaced as strings to avoid float rounding. Use decimal.js for
 * arithmetic (see src/lib/money.ts).
 */
export const money = (name: string) =>
  numeric(name, { precision: 20, scale: 4 });
export const price = (name: string) =>
  numeric(name, { precision: 24, scale: 8 });
export const quantity = (name: string) =>
  numeric(name, { precision: 28, scale: 10 });
