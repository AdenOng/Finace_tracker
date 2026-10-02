/**
 * Admin-managed reference data shared by every user: currencies, institutions (brokers, banks…)
 * and spending categories. Rows are seeded from a preset pack (src/presets) by stable `key`, then
 * owned by the database — admin edits are never overwritten by re-seeding.
 */
import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_columns";

export const currency = pgTable("currency", {
  code: varchar("code", { length: 3 }).primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  minorUnits: integer("minor_units").default(2).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const institutionKind = pgEnum("institution_kind", [
  "broker",
  "bank",
  "card_issuer",
  "crypto_exchange",
  "depository",
  "other",
]);

export const ingestMethod = pgEnum("ingest_method", [
  "api",
  "csv",
  "statement_ocr",
]);

export const institution = pgTable(
  "institution",
  {
    id: id(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    kind: institutionKind("kind").notNull(),
    country: varchar("country", { length: 2 }),
    website: text("website"),
    ingestMethods: ingestMethod("ingest_methods")
      .array()
      .default(["statement_ocr"])
      .notNull(),
    /** Identifier of the sync adapter (e.g. "ibkr_flex", "longbridge") when `api` is supported. */
    apiAdapter: text("api_adapter"),
    /** Extra instructions given to the LLM when parsing this institution's documents. */
    extractionHints: text("extraction_hints"),
    isSystem: boolean("is_system").default(false).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [index("institution_kind_idx").on(t.kind)],
);

export const categoryKind = pgEnum("category_kind", [
  "expense",
  "income",
  "transfer",
]);

export const category = pgTable(
  "category",
  {
    id: id(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    kind: categoryKind("kind").default("expense").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => category.id, {
      onDelete: "set null",
    }),
    color: varchar("color", { length: 7 }),
    /** Describes what belongs here; sent to the LLM so it categorises consistently. */
    aiHint: text("ai_hint"),
    isSystem: boolean("is_system").default(false).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [index("category_parent_idx").on(t.parentId)],
);

export const categoryRelations = relations(category, ({ one, many }) => ({
  parent: one(category, {
    fields: [category.parentId],
    references: [category.id],
    relationName: "category_parent",
  }),
  children: many(category, { relationName: "category_parent" }),
}));
