/**
 * Per-user financial records. Every row carries `ownerId`; queries must be filtered through the
 * access scope (src/server/lib/access.ts) so a future household view only has to widen the scope.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { id, money, price, quantity, timestamps } from "./_columns";
import { user } from "./auth";
import { category, institution } from "./catalog";
import { document } from "./ingest";

export const accountType = pgEnum("account_type", [
  "brokerage",
  "retirement",
  "checking",
  "savings",
  "credit_card",
  "crypto_wallet",
  "cash",
  "other",
]);

export const financialAccount = pgTable(
  "financial_account",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id").references(() => institution.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    /** Base currency of the account; individual rows may still be in other currencies. */
    currency: varchar("currency", { length: 3 }).default("SGD").notNull(),
    last4: varchar("last4", { length: 4 }),
    /** Identifier at the institution, used by API sync adapters. */
    externalRef: text("external_ref"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("financial_account_owner_idx").on(t.ownerId)],
);

export const assetClass = pgEnum("asset_class", [
  "stock",
  "etf",
  "fund",
  "bond",
  "option",
  "crypto",
  "cash",
  "other",
]);

/** Global instrument catalogue, shared across users so prices are fetched once. */
export const security = pgTable(
  "security",
  {
    id: id(),
    symbol: text("symbol").notNull(),
    /** Exchange MIC or short code (XSES, XHKG, XNAS…). Empty string when unknown. */
    exchange: text("exchange").default("").notNull(),
    name: text("name"),
    assetClass: assetClass("asset_class").default("stock").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    isin: varchar("isin", { length: 12 }),
    country: varchar("country", { length: 2 }),
    /** Symbol as each price provider spells it, e.g. { yahoo: "D05.SI", longbridge: "D05.SG" }. */
    providerSymbols: jsonb("provider_symbols")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    ...timestamps(),
  },
  (t) => [unique("security_symbol_exchange_uq").on(t.symbol, t.exchange)],
);

export const recordSource = pgEnum("record_source", [
  "manual",
  "statement",
  "api",
]);

/** Point-in-time holdings + cash for one account (from a statement, an API sync or manual entry). */
export const accountSnapshot = pgTable(
  "account_snapshot",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    asOf: date("as_of").notNull(),
    source: recordSource("source").notNull(),
    documentId: uuid("document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [index("account_snapshot_account_asof_idx").on(t.accountId, t.asOf)],
);

export const position = pgTable(
  "position",
  {
    id: id(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => accountSnapshot.id, { onDelete: "cascade" }),
    securityId: uuid("security_id")
      .notNull()
      .references(() => security.id, { onDelete: "restrict" }),
    quantity: quantity("quantity").notNull(),
    averageCost: price("average_cost"),
    costCurrency: varchar("cost_currency", { length: 3 }),
    /** Price and value as printed on the statement (live value comes from the quote table). */
    statementPrice: price("statement_price"),
    statementValue: money("statement_value"),
  },
  (t) => [index("position_snapshot_idx").on(t.snapshotId)],
);

export const cashBalance = pgTable(
  "cash_balance",
  {
    id: id(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => accountSnapshot.id, { onDelete: "cascade" }),
    currency: varchar("currency", { length: 3 }).notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [index("cash_balance_snapshot_idx").on(t.snapshotId)],
);

export const investmentTxnType = pgEnum("investment_txn_type", [
  "buy",
  "sell",
  "dividend",
  "interest",
  "fee",
  "tax",
  "deposit",
  "withdrawal",
  "transfer_in",
  "transfer_out",
  "split",
  "fx",
  "other",
]);

export const investmentTransaction = pgTable(
  "investment_transaction",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    securityId: uuid("security_id").references(() => security.id, {
      onDelete: "restrict",
    }),
    type: investmentTxnType("type").notNull(),
    tradeDate: date("trade_date").notNull(),
    settleDate: date("settle_date"),
    quantity: quantity("quantity"),
    price: price("price"),
    amount: money("amount").notNull(),
    fees: money("fees"),
    currency: varchar("currency", { length: 3 }).notNull(),
    description: text("description"),
    source: recordSource("source").default("manual").notNull(),
    /** Deterministic hash used for exact duplicate detection (see dedupe module). */
    fingerprint: text("fingerprint").notNull(),
    documentId: uuid("document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    unique("investment_txn_account_fingerprint_uq").on(
      t.accountId,
      t.fingerprint,
    ),
    index("investment_txn_owner_date_idx").on(t.ownerId, t.tradeDate),
  ],
);

export const categorySource = pgEnum("category_source", ["ai", "user", "rule"]);

/** Line-item spending / income from bank and card statements. Negative amount = money out. */
export const transaction = pgTable(
  "transaction",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    postedDate: date("posted_date").notNull(),
    transactionDate: date("transaction_date"),
    description: text("description").notNull(),
    merchant: text("merchant"),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    /** Amount in a foreign currency when the card converted it (e.g. USD 12.00 on an SGD card). */
    originalAmount: money("original_amount"),
    originalCurrency: varchar("original_currency", { length: 3 }),
    categoryId: uuid("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    categorySource: categorySource("category_source"),
    isTransfer: boolean("is_transfer").default(false).notNull(),
    notes: text("notes"),
    source: recordSource("source").default("manual").notNull(),
    fingerprint: text("fingerprint").notNull(),
    documentId: uuid("document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    unique("transaction_account_fingerprint_uq").on(t.accountId, t.fingerprint),
    index("transaction_owner_date_idx").on(t.ownerId, t.postedDate),
    index("transaction_category_idx").on(t.categoryId),
  ],
);

/** User-defined "merchant text contains X → category Y" rules, applied before the LLM's guess. */
export const merchantRule = pgTable(
  "merchant_rule",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [index("merchant_rule_owner_idx").on(t.ownerId)],
);

export const financialAccountRelations = relations(
  financialAccount,
  ({ one, many }) => ({
    owner: one(user, {
      fields: [financialAccount.ownerId],
      references: [user.id],
    }),
    institution: one(institution, {
      fields: [financialAccount.institutionId],
      references: [institution.id],
    }),
    snapshots: many(accountSnapshot),
    transactions: many(transaction),
  }),
);

export const accountSnapshotRelations = relations(
  accountSnapshot,
  ({ one, many }) => ({
    account: one(financialAccount, {
      fields: [accountSnapshot.accountId],
      references: [financialAccount.id],
    }),
    positions: many(position),
    cashBalances: many(cashBalance),
  }),
);

export const positionRelations = relations(position, ({ one }) => ({
  snapshot: one(accountSnapshot, {
    fields: [position.snapshotId],
    references: [accountSnapshot.id],
  }),
  security: one(security, {
    fields: [position.securityId],
    references: [security.id],
  }),
}));

export const cashBalanceRelations = relations(cashBalance, ({ one }) => ({
  snapshot: one(accountSnapshot, {
    fields: [cashBalance.snapshotId],
    references: [accountSnapshot.id],
  }),
}));

export const transactionRelations = relations(transaction, ({ one }) => ({
  account: one(financialAccount, {
    fields: [transaction.accountId],
    references: [financialAccount.id],
  }),
  category: one(category, {
    fields: [transaction.categoryId],
    references: [category.id],
  }),
}));
