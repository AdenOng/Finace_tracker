/** Market data (quotes, daily closes, FX) and derived net-worth history. */
import {
  date,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  numeric,
} from "drizzle-orm/pg-core";

import { id, money, price, timestamps } from "./_columns";
import { user } from "./auth";
import { security } from "./finance";

/** Latest quote per security. Refreshed only while someone is looking at the app. */
export const securityQuote = pgTable("security_quote", {
  securityId: uuid("security_id")
    .primaryKey()
    .references(() => security.id, { onDelete: "cascade" }),
  price: price("price").notNull(),
  previousClose: price("previous_close"),
  currency: varchar("currency", { length: 3 }).notNull(),
  source: text("source").notNull(),
  quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
});

export const priceHistory = pgTable(
  "price_history",
  {
    securityId: uuid("security_id")
      .notNull()
      .references(() => security.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    close: price("close").notNull(),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.securityId, t.date] })],
);

export const fxRate = pgTable(
  "fx_rate",
  {
    date: date("date").notNull(),
    base: varchar("base", { length: 3 }).notNull(),
    quote: varchar("quote", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 24, scale: 10 }).notNull(),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.base, t.quote] })],
);

export const networthSnapshot = pgTable(
  "networth_snapshot",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    total: money("total").notNull(),
    /** Per-account and per-asset-class totals in `currency`. */
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull(),
    ...timestamps(),
  },
  (t) => [unique("networth_owner_date_uq").on(t.ownerId, t.date)],
);
