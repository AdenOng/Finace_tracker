import DecimalJs from "decimal.js";
import { and, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  addDays,
  forecastBalance,
  isCashFlowAccount,
  matchesOccurrence,
  occurrenceDates,
  statementPaymentStatus,
} from "~/lib/cash-flow";
import { todayIso } from "~/lib/dates";
import type { Database } from "~/server/db";
import {
  cardPaymentAccount,
  cardStatement,
  financialAccount,
  recurringOccurrence,
  recurringSchedule,
  transaction,
  transferLink,
} from "~/server/db/schema";
import { writableBy, type AccessScope } from "~/server/lib/access";
import { latestHoldings } from "~/server/modules/portfolio/holdings";

const Decimal = DecimalJs.clone({ precision: 40 });
const transactionFields = {
  id: transaction.id,
  accountId: transaction.accountId,
  postedDate: transaction.postedDate,
  amount: transaction.amount,
  currency: transaction.currency,
  description: transaction.description,
  isTransfer: transaction.isTransfer,
};

function candidateKey(
  accountId: string,
  currency: string,
  amount: string,
  date: string,
) {
  return JSON.stringify([
    accountId,
    currency,
    new Decimal(amount).toFixed(),
    date,
  ]);
}

export async function loadPlanning(
  db: Database,
  scope: AccessScope,
  days: number,
) {
  const today = todayIso();
  const from = addDays(today, -90);
  const through = addDays(today, days);
  const [accounts, schedules, decisions, profiles, statements, transactions] =
    await Promise.all([
      db
        .select()
        .from(financialAccount)
        .where(writableBy(scope, financialAccount.ownerId))
        .orderBy(financialAccount.name),
      db
        .select()
        .from(recurringSchedule)
        .where(writableBy(scope, recurringSchedule.ownerId))
        .orderBy(recurringSchedule.createdAt),
      db
        .select({
          id: recurringOccurrence.id,
          scheduleId: recurringOccurrence.scheduleId,
          dueDate: recurringOccurrence.dueDate,
          transactionId: recurringOccurrence.transactionId,
        })
        .from(recurringOccurrence)
        .innerJoin(
          recurringSchedule,
          eq(recurringSchedule.id, recurringOccurrence.scheduleId),
        )
        .where(writableBy(scope, recurringSchedule.ownerId)),
      db
        .select()
        .from(cardPaymentAccount)
        .where(writableBy(scope, cardPaymentAccount.ownerId)),
      db
        .select()
        .from(cardStatement)
        .where(writableBy(scope, cardStatement.ownerId))
        .orderBy(cardStatement.statementDate, cardStatement.id),
      db
        .select(transactionFields)
        .from(transaction)
        .where(
          and(
            writableBy(scope, transaction.ownerId),
            gte(transaction.postedDate, addDays(from, -7)),
            lte(transaction.postedDate, addDays(through, 7)),
            lte(transaction.postedDate, today),
          ),
        ),
    ]);
  const bankSide = alias(transaction, "bill_bank_payment");
  const cardSide = alias(transaction, "bill_card_payment");
  const payments = await db
    .select({
      id: transferLink.id,
      bankAccountId: bankSide.accountId,
      cardAccountId: cardSide.accountId,
      date: cardSide.postedDate,
      amount: cardSide.amount,
      currency: cardSide.currency,
    })
    .from(transferLink)
    .innerJoin(bankSide, eq(bankSide.id, transferLink.outgoingTransactionId))
    .innerJoin(cardSide, eq(cardSide.id, transferLink.incomingTransactionId))
    .where(
      and(
        writableBy(scope, transferLink.ownerId),
        writableBy(scope, bankSide.ownerId),
        writableBy(scope, cardSide.ownerId),
        eq(bankSide.isTransfer, true),
        eq(cardSide.isTransfer, true),
        lt(bankSide.amount, "0"),
        gt(cardSide.amount, "0"),
        eq(bankSide.currency, cardSide.currency),
        lte(bankSide.postedDate, today),
        lte(cardSide.postedDate, today),
      ),
    );

  const cashAccounts = accounts.filter(
    (a) => !a.archivedAt && isCashFlowAccount(a.type),
  );
  const referencedIds = [
    ...new Set(
      decisions.flatMap((d) => (d.transactionId ? [d.transactionId] : [])),
    ),
  ];
  const [holdings, referencedTransactions] = await Promise.all([
    latestHoldings(
      db,
      scope,
      cashAccounts.map((a) => a.id),
    ),
    referencedIds.length
      ? db
          .select(transactionFields)
          .from(transaction)
          .where(
            and(
              writableBy(scope, transaction.ownerId),
              inArray(transaction.id, referencedIds),
              lte(transaction.postedDate, today),
            ),
          )
      : Promise.resolve([]),
  ]);
  // Each account has its own snapshot boundary; older movements still count even
  // when they are outside the recurring-match window. SUM stays NUMERIC in SQL.
  const snapshotBounds = [...holdings].map(([accountId, snapshot]) =>
    and(
      eq(transaction.accountId, accountId),
      gt(transaction.postedDate, snapshot.asOf),
    ),
  );
  const movements = snapshotBounds.length
    ? await db
        .select({
          accountId: transaction.accountId,
          currency: transaction.currency,
          amount: sql<string>`sum(${transaction.amount})::text`,
        })
        .from(transaction)
        .where(
          and(
            writableBy(scope, transaction.ownerId),
            lte(transaction.postedDate, today),
            or(...snapshotBounds),
          ),
        )
        .groupBy(transaction.accountId, transaction.currency)
    : [];
  const movementOf = new Map(
    movements.map((m) => [JSON.stringify([m.accountId, m.currency]), m.amount]),
  );
  const candidates = new Map<
    string,
    { row: (typeof transactions)[number]; index: number }[]
  >();
  transactions.forEach((row, index) => {
    if (row.isTransfer) return;
    const key = candidateKey(
      row.accountId,
      row.currency,
      row.amount,
      row.postedDate,
    );
    const bucket = candidates.get(key) ?? [];
    bucket.push({ row, index });
    candidates.set(key, bucket);
  });
  const accountOf = new Map(accounts.map((a) => [a.id, a]));
  const scheduleOf = new Map(schedules.map((s) => [s.id, s]));
  const transactionOf = new Map(
    [...transactions, ...referencedTransactions].map((t) => [t.id, t]),
  );
  const decisionOf = new Map(
    decisions.map((d) => [`${d.scheduleId}:${d.dueDate}`, d]),
  );
  // An edited ledger row that no longer fits restores the expected payment instead of hiding it.
  const used = new Set(
    decisions.flatMap((d) => {
      const schedule = scheduleOf.get(d.scheduleId);
      const row = d.transactionId ? transactionOf.get(d.transactionId) : null;
      return schedule && row && matchesOccurrence(schedule, d.dueDate, row)
        ? [row.id]
        : [];
    }),
  );
  const occurrences = schedules
    .filter(
      (s) =>
        s.active &&
        !accountOf.get(s.accountId)?.archivedAt &&
        isCashFlowAccount(accountOf.get(s.accountId)?.type ?? ""),
    )
    .flatMap((schedule) =>
      occurrenceDates(schedule, from, through).map((dueDate) => {
        const decision = decisionOf.get(`${schedule.id}:${dueDate}`);
        const row = decision?.transactionId
          ? transactionOf.get(decision.transactionId)
          : null;
        const matched =
          row && matchesOccurrence(schedule, dueDate, row) ? row : null;
        const skipped = !!decision && decision.transactionId === null;
        return {
          scheduleId: schedule.id,
          accountId: schedule.accountId,
          dueDate,
          name: schedule.name,
          amount: schedule.amount,
          currency: schedule.currency,
          matched,
          skipped,
          staleMatch: !!decision?.transactionId && !matched,
          suggestions:
            matched || skipped
              ? []
              : Array.from(
                  { length: 15 },
                  (_, offset) =>
                    candidates.get(
                      candidateKey(
                        schedule.accountId,
                        schedule.currency,
                        schedule.amount,
                        addDays(dueDate, offset - 7),
                      ),
                    ) ?? [],
                )
                  .flat()
                  .filter(({ row }) => !used.has(row.id))
                  // Keep the ledger query's order across date buckets.
                  .sort((a, b) => a.index - b.index)
                  .slice(0, 10)
                  .map(({ row }) => row),
        };
      }),
    )
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.scheduleId.localeCompare(b.scheduleId),
    );

  const bills = statements.map((bill) => ({
    ...bill,
    ...statementPaymentStatus(bill, payments, today),
  }));
  const latestBill = new Map(bills.map((bill) => [bill.cardAccountId, bill]));
  const forecasts = cashAccounts.map((account) => {
    const snapshot = holdings.get(account.id);
    const recorded =
      snapshot?.cash.filter((c) => c.currency === account.currency) ?? [];
    const opening = recorded.length
      ? recorded.reduce((sum, row) => sum.plus(row.amount), new Decimal(0))
      : null;
    const balance =
      opening
        ?.plus(
          movementOf.get(JSON.stringify([account.id, account.currency])) ?? "0",
        )
        .toFixed() ?? null;
    const events = [
      ...occurrences
        .filter((o) => o.accountId === account.id && !o.matched && !o.skipped)
        .map((o) => ({ date: o.dueDate, name: o.name, amount: o.amount })),
      ...[...latestBill.values()]
        .filter(
          (b) =>
            b.bankAccountId === account.id &&
            !accountOf.get(b.cardAccountId)?.archivedAt &&
            b.dueDate <= through &&
            new Decimal(b.remaining).gt(0),
        )
        .map((b) => ({
          date: b.dueDate,
          name: `${accountOf.get(b.cardAccountId)?.name ?? "Card"} bill`,
          amount: new Decimal(b.remaining).negated().toFixed(),
        })),
    ];
    const points = forecastBalance(balance, events, today, days);
    const lowest = points.reduce<string | null>(
      (min, p) =>
        p.balance === null
          ? min
          : min === null || new Decimal(p.balance).lt(min)
            ? p.balance
            : min,
      null,
    );
    return {
      accountId: account.id,
      name: account.name,
      currency: account.currency,
      asOf: snapshot?.asOf ?? null,
      balance,
      projected: points.at(-1)!.balance,
      lowest,
      points,
      events,
    };
  });
  return {
    today,
    through,
    from,
    accounts: accounts.map(({ id, name, type, currency, archivedAt }) => ({
      id,
      name,
      type,
      currency,
      archived: !!archivedAt,
    })),
    schedules,
    occurrences,
    profiles,
    bills,
    forecasts,
  };
}
