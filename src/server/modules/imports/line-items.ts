import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";

import { cpfBucketLabels } from "~/lib/accounts";
import {
  accountSnapshot,
  auditLog,
  cashBalance,
  document,
  extractionJob,
  financialAccount,
  investmentTransaction,
  position,
  security,
  stagedRow,
  transaction,
} from "~/server/db/schema";
import { writableBy, type AccessScope } from "~/server/lib/access";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import { stagedSchemas } from "~/server/modules/imports/rows";
import { hasSnapshotEntries } from "~/server/modules/portfolio/holdings";
import {
  type FinanceDatabase,
  requireOpenPeriod,
  requireUnreconciled,
} from "~/server/modules/spending/guards";

export const LINE_REMOVED = "import.row_removed";

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
const sameNumber = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : new Decimal(a).eq(b);

/** Resolve only the record actually created by this import, never a deduplicated match. */
export async function importLinePreview(
  db: FinanceDatabase,
  scope: AccessScope,
  input: { jobId: string; rowId: string },
) {
  const [row] = await db
    .select({
      id: stagedRow.id,
      kind: stagedRow.kind,
      data: stagedRow.data,
      recordId: stagedRow.committedRecordId,
      documentId: document.id,
      accountId: document.accountId,
      status: extractionJob.status,
    })
    .from(stagedRow)
    .innerJoin(extractionJob, eq(extractionJob.id, stagedRow.jobId))
    .innerJoin(document, eq(document.id, extractionJob.documentId))
    .where(
      and(
        eq(stagedRow.id, input.rowId),
        eq(stagedRow.jobId, input.jobId),
        writableBy(scope, stagedRow.ownerId),
        writableBy(scope, extractionJob.ownerId),
        writableBy(scope, document.ownerId),
      ),
    );
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (row.status !== "completed" || !row.recordId)
    conflict(
      "This row has no saved record. Uncheck unsaved rows to exclude them.",
    );
  const [removed] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(eq(auditLog.action, LINE_REMOVED), eq(auditLog.targetId, row.id)),
    );
  if (removed) conflict("This imported row has already been removed.");
  if (!row.accountId)
    conflict(
      "The original account was deleted. Adding the broker again creates a separate account; this import is not automatically transferred.",
    );
  await requireWritableAccount(db, scope, row.accountId, {
    allowArchived: true,
  });
  const [account] = await db
    .select({ archivedAt: financialAccount.archivedAt })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, row.accountId),
        writableBy(scope, financialAccount.ownerId),
      ),
    );
  if (account?.archivedAt)
    conflict(
      "This import belongs to an archived account. Restore the original account from this import page or Accounts → Archived before removing its rows. Adding the broker again creates a separate account.",
    );

  const recordId = row.recordId;
  const accountId = row.accountId;
  const facts: { label: string; value: string }[] = [];
  let targetId = recordId;
  let snapshotId: string | null = null;
  let lastInSnapshot = false;
  let label = "";
  let effect = "";
  let versionData: unknown;

  if (row.kind === "transaction") {
    const [saved] = await db
      .select({
        ...getTableColumns(transaction),
        version: sql<string>`${transaction.updatedAt}::text`,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.id, recordId),
          eq(transaction.accountId, accountId),
          eq(transaction.documentId, row.documentId),
          writableBy(scope, transaction.ownerId),
        ),
      );
    if (!saved)
      conflict("This transaction is no longer saved in this account.");
    requireUnreconciled([saved]);
    await requireOpenPeriod(db, scope, saved);
    label = saved.description;
    facts.push(
      { label: "Date", value: saved.postedDate },
      { label: "Amount", value: `${saved.currency} ${saved.amount}` },
    );
    effect =
      "Removes this transaction from Spending. The recorded account balance is unchanged.";
    versionData = saved;
  } else if (row.kind === "investment_transaction") {
    const [saved] = await db
      .select({
        ...getTableColumns(investmentTransaction),
        version: sql<string>`${investmentTransaction.updatedAt}::text`,
      })
      .from(investmentTransaction)
      .where(
        and(
          eq(investmentTransaction.id, recordId),
          eq(investmentTransaction.accountId, accountId),
          eq(investmentTransaction.documentId, row.documentId),
          writableBy(scope, investmentTransaction.ownerId),
        ),
      );
    if (!saved)
      conflict("This trade or payment is no longer saved in this account.");
    label = saved.description ?? saved.type;
    facts.push(
      { label: "Date", value: saved.tradeDate },
      { label: "Amount", value: `${saved.currency} ${saved.amount}` },
    );
    effect =
      "Removes this trade or payment from account activity. Holdings and cash balances are unchanged.";
    versionData = saved;
  } else {
    const [snapshot] = await db
      .select({
        id: accountSnapshot.id,
        asOf: accountSnapshot.asOf,
        version: sql<string>`${accountSnapshot.updatedAt}::text`,
      })
      .from(accountSnapshot)
      .where(
        and(
          eq(accountSnapshot.id, recordId),
          eq(accountSnapshot.accountId, accountId),
          eq(accountSnapshot.documentId, row.documentId),
          eq(accountSnapshot.source, "statement"),
          writableBy(scope, accountSnapshot.ownerId),
        ),
      );
    if (!snapshot)
      conflict(
        "This dated entry was removed or replaced. Open Entry history to manage current holdings.",
      );
    snapshotId = snapshot.id;
    const positions = await db
      .select({ id: position.id })
      .from(position)
      .where(eq(position.snapshotId, snapshot.id));
    const balances = await db
      .select({ id: cashBalance.id })
      .from(cashBalance)
      .where(eq(cashBalance.snapshotId, snapshot.id));
    const [current] = await db
      .select({ id: accountSnapshot.id })
      .from(accountSnapshot)
      .where(
        and(
          eq(accountSnapshot.accountId, accountId),
          writableBy(scope, accountSnapshot.ownerId),
          hasSnapshotEntries(db),
        ),
      )
      .orderBy(
        desc(accountSnapshot.asOf),
        desc(accountSnapshot.createdAt),
        desc(accountSnapshot.id),
      )
      .limit(1);
    lastInSnapshot = positions.length + balances.length === 1;
    facts.push({ label: "Entry date", value: snapshot.asOf });
    let saved: unknown;
    const adjusted =
      "This holding or balance has changed since import. Use Edit in Entry history to remove the current row.";
    if (row.kind === "position") {
      const data = stagedSchemas.position.parse(row.data);
      const matches = await db
        .select({
          id: position.id,
          quantity: position.quantity,
          averageCost: position.averageCost,
          price: position.statementPrice,
          value: position.statementValue,
        })
        .from(position)
        .innerJoin(security, eq(security.id, position.securityId))
        .where(
          and(
            eq(position.snapshotId, snapshot.id),
            eq(security.symbol, data.symbol),
            eq(security.exchange, data.exchange),
            eq(security.currency, data.currency),
          ),
        );
      if (matches.length !== 1) conflict(adjusted);
      const match = matches[0]!;
      const value =
        data.value ??
        (data.price === null
          ? null
          : new Decimal(data.quantity).times(data.price).toFixed(4));
      if (
        !sameNumber(match.quantity, data.quantity) ||
        !sameNumber(match.averageCost, data.averageCost) ||
        !sameNumber(match.price, data.price) ||
        !sameNumber(match.value, value)
      )
        conflict(adjusted);
      targetId = match.id;
      label = `${data.symbol}${data.exchange ? ` · ${data.exchange}` : ""}`;
      facts.push(
        { label: "Quantity", value: match.quantity },
        {
          label: "Statement value",
          value:
            match.value === null
              ? "No value recorded"
              : `${data.currency} ${match.value}`,
        },
      );
      saved = match;
    } else {
      const data = stagedSchemas.cash_balance.parse(row.data);
      const matches = await db
        .select()
        .from(cashBalance)
        .where(
          and(
            eq(cashBalance.snapshotId, snapshot.id),
            eq(cashBalance.currency, data.currency),
            data.bucket
              ? eq(cashBalance.bucket, data.bucket)
              : isNull(cashBalance.bucket),
          ),
        );
      if (matches.length !== 1 || !sameNumber(matches[0]!.amount, data.amount))
        conflict(adjusted);
      const match = matches[0]!;
      targetId = match.id;
      label = data.bucket
        ? `${cpfBucketLabels[data.bucket]} ${data.currency}`
        : `${data.currency} cash`;
      facts.push({
        label: "Amount",
        value: `${data.currency} ${match.amount}`,
      });
      saved = match;
    }
    effect =
      current?.id === snapshot.id
        ? "Removes this row from the current dated entry and recalculates the account total and net worth."
        : "Removes this row from a historical entry. The newer current entry is unchanged.";
    if (lastInSnapshot)
      effect +=
        " This is the last row: the empty dated entry will also be removed. The account will use its latest remaining entry, if any.";
    versionData = { snapshot, saved, current: current?.id, lastInSnapshot };
  }
  const version = createHash("sha256")
    .update(JSON.stringify({ row, versionData }))
    .digest("hex");
  return {
    kind: row.kind,
    label,
    facts,
    effect,
    version,
    targetId,
    accountId,
    snapshotId,
    lastInSnapshot,
  };
}
