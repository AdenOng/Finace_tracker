import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, timestamps } from "./_columns";
import { user } from "./auth";
import { financialAccount, transaction } from "./finance";

export const recurringFrequency = pgEnum("recurring_frequency", [
  "weekly",
  "monthly",
  "yearly",
]);

/** Plans never create ledger transactions. Amounts use the linked account's native currency. */
export const recurringSchedule = pgTable(
  "recurring_schedule",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    frequency: recurringFrequency("frequency").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    active: boolean("active").default(true).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("recurring_schedule_owner_idx").on(t.ownerId),
    check("recurring_nonzero_ck", sql`${t.amount} <> 0`),
  ],
);

/** An occurrence is either deliberately skipped or matched to one existing ledger row. */
export const recurringOccurrence = pgTable(
  "recurring_occurrence",
  {
    id: id(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => recurringSchedule.id, { onDelete: "cascade" }),
    dueDate: date("due_date").notNull(),
    transactionId: uuid("transaction_id").references(() => transaction.id, {
      onDelete: "cascade",
    }),
    ...timestamps(),
  },
  (t) => [
    unique("recurring_occurrence_due_uq").on(t.scheduleId, t.dueDate),
    unique("recurring_occurrence_transaction_uq").on(t.transactionId),
  ],
);

export const cardPaymentAccount = pgTable("card_payment_account", {
  cardAccountId: uuid("card_account_id")
    .primaryKey()
    .references(() => financialAccount.id, { onDelete: "cascade" }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => financialAccount.id, { onDelete: "cascade" }),
  ...timestamps(),
});

/** Statement balance includes carried debt; only the latest statement is reserved in forecasts. */
export const cardStatement = pgTable(
  "card_statement",
  {
    id: id(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardAccountId: uuid("card_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => financialAccount.id, { onDelete: "cascade" }),
    statementDate: date("statement_date").notNull(),
    dueDate: date("due_date").notNull(),
    amountDue: money("amount_due").notNull(),
    currency: text("currency").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("card_statement_date_uq").on(t.cardAccountId, t.statementDate),
    index("card_statement_owner_idx").on(t.ownerId),
    check("card_statement_amount_ck", sql`${t.amountDue} >= 0`),
    check("card_statement_dates_ck", sql`${t.dueDate} > ${t.statementDate}`),
  ],
);
