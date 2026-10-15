import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "~/server/db";
import {
  accountReconciliation,
  category,
  financialAccount,
  transaction,
} from "~/server/db/schema";
import { writableBy, type AccessScope } from "~/server/lib/access";

export type FinanceDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
export const transactionIdsInput = z
  .array(z.uuid())
  .min(1)
  .max(500)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Select each transaction only once",
  );

export async function checkCategory(
  db: FinanceDatabase,
  categoryId: string | null,
) {
  if (!categoryId) return;
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.id, categoryId), isNull(category.archivedAt)))
    .limit(1);
  if (!row)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Pick an active category from the list",
    });
}

/** All spending writes and reconciliation commits lock accounts first, in a stable order. */
export async function lockAccounts(
  db: FinanceDatabase,
  scope: AccessScope,
  ids: string[],
) {
  const uniqueIds = [...new Set(ids)].sort();
  const rows = await db
    .select({ id: financialAccount.id })
    .from(financialAccount)
    .where(
      and(
        inArray(financialAccount.id, uniqueIds),
        writableBy(scope, financialAccount.ownerId),
      ),
    )
    .orderBy(asc(financialAccount.id))
    .for("update");
  if (rows.length !== uniqueIds.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
}

export async function writableTransactions(
  db: FinanceDatabase,
  scope: AccessScope,
  ids: string[],
  extraAccountIds: string[] = [],
) {
  const where = and(
    inArray(transaction.id, ids),
    writableBy(scope, transaction.ownerId),
  );
  const before = await db
    .select({ accountId: transaction.accountId })
    .from(transaction)
    .where(where);
  if (before.length !== ids.length)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Some selected transactions no longer exist or are not yours",
    });
  await lockAccounts(db, scope, [
    ...before.map((r) => r.accountId),
    ...extraAccountIds,
  ]);
  const rows = await db
    .select()
    .from(transaction)
    .where(where)
    .orderBy(asc(transaction.id))
    .for("update");
  const locked = new Set(before.map((r) => r.accountId));
  if (
    rows.length !== ids.length ||
    rows.some((r) => !locked.has(r.accountId))
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Transactions changed. Refresh and try again.",
    });
  }
  return rows;
}

export function requireUnreconciled(
  rows: { reconciliationId: string | null }[],
) {
  if (rows.some((r) => r.reconciliationId))
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Reopen the reconciled statement period before changing these transactions",
    });
}

export async function requireOpenPeriod(
  db: FinanceDatabase,
  scope: AccessScope,
  row: {
    accountId: string;
    currency: string;
    postedDate: string;
  },
) {
  const [closed] = await db
    .select({ id: accountReconciliation.id })
    .from(accountReconciliation)
    .where(
      and(
        writableBy(scope, accountReconciliation.ownerId),
        eq(accountReconciliation.accountId, row.accountId),
        eq(accountReconciliation.currency, row.currency),
        lte(accountReconciliation.startDate, row.postedDate),
        gte(accountReconciliation.endDate, row.postedDate),
      ),
    )
    .limit(1);
  if (closed)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Reopen the reconciled statement period before adding or moving transactions into it",
    });
}
