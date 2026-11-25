import "server-only";

import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { categoryKind } from "~/lib/transaction-classification";
import type { Database } from "~/server/db";
import {
  accountSnapshot,
  auditLog,
  cashBalance,
  document,
  extractionJob,
  investmentTransaction,
  position,
  stagedRow,
  transaction,
} from "~/server/db/schema";
import { type AccessScope, writableBy } from "~/server/lib/access";
import {
  importLinePreview,
  LINE_REMOVED,
} from "~/server/modules/imports/line-items";
import { stagedSchemas } from "~/server/modules/imports/rows";
import { removeUpload } from "~/server/modules/imports/storage";
import {
  classifyTransaction,
  loadClassificationCategories,
} from "~/server/modules/spending/classification";
import { checkCategory, lockAccounts } from "~/server/modules/spending/guards";

/** Delete exactly one reviewed record, preserving the upload and extraction as evidence. */
export async function removeCommittedLine(
  db: Database,
  scope: AccessScope,
  input: { jobId: string; rowId: string; version: string },
) {
  return db.transaction(async (tx) => {
    // Same lock order as commit: job, account, then its financial records.
    const [job] = await tx
      .select({ id: extractionJob.id, accountId: document.accountId })
      .from(extractionJob)
      .innerJoin(document, eq(document.id, extractionJob.documentId))
      .where(
        and(
          eq(extractionJob.id, input.jobId),
          writableBy(scope, extractionJob.ownerId),
        ),
      )
      .for("update", { of: extractionJob });
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (!job.accountId)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "The original account was deleted. Adding the broker again creates a separate account; this import is not automatically transferred.",
      });
    await lockAccounts(tx, scope, [job.accountId]);
    const line = await importLinePreview(tx, scope, input);
    if (line.version !== input.version)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This row changed after you opened the review. Close and review it again.",
      });
    if (line.kind === "transaction")
      await tx
        .delete(transaction)
        .where(
          and(
            eq(transaction.id, line.targetId),
            writableBy(scope, transaction.ownerId),
          ),
        );
    else if (line.kind === "investment_transaction")
      await tx
        .delete(investmentTransaction)
        .where(
          and(
            eq(investmentTransaction.id, line.targetId),
            writableBy(scope, investmentTransaction.ownerId),
          ),
        );
    else {
      if (line.kind === "position")
        await tx.delete(position).where(eq(position.id, line.targetId));
      else
        await tx.delete(cashBalance).where(eq(cashBalance.id, line.targetId));
      if (line.lastInSnapshot)
        await tx
          .delete(accountSnapshot)
          .where(
            and(
              eq(accountSnapshot.id, line.snapshotId!),
              writableBy(scope, accountSnapshot.ownerId),
            ),
          );
      else
        await tx
          .update(accountSnapshot)
          .set({
            updatedAt: sql`greatest(clock_timestamp(), ${accountSnapshot.updatedAt} + interval '1 microsecond')`,
          })
          .where(
            and(
              eq(accountSnapshot.id, line.snapshotId!),
              writableBy(scope, accountSnapshot.ownerId),
            ),
          );
    }
    await tx
      .update(stagedRow)
      .set({ decision: "skip" })
      .where(
        and(
          eq(stagedRow.id, input.rowId),
          eq(stagedRow.jobId, input.jobId),
          writableBy(scope, stagedRow.ownerId),
        ),
      );
    await tx.insert(auditLog).values({
      actorId: scope.userId,
      action: LINE_REMOVED,
      targetType: "staged_row",
      targetId: input.rowId,
      details: {
        jobId: input.jobId,
        accountId: line.accountId,
        kind: line.kind,
        recordId: line.targetId,
      },
    });
    return { removed: true };
  });
}

/** Accept or skip rows, and correct amounts or transaction classification before saving. */
export async function updateStagedRows(
  db: Database,
  scope: AccessScope,
  input: {
    jobId: string;
    ids: string[];
    decision?: "accept" | "skip";
    patch?: {
      categoryId?: string | null;
      merchant?: string | null;
      isTransfer?: boolean;
      amount?: string;
      confirmAmount?: true;
    };
  },
) {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ status: extractionJob.status })
      .from(extractionJob)
      .where(
        and(
          eq(extractionJob.id, input.jobId),
          writableBy(scope, extractionJob.ownerId),
        ),
      )
      .for("update");
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (job.status !== "needs_review") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This import is no longer open for review",
      });
    }
    const rows = await tx
      .select({
        id: stagedRow.id,
        kind: stagedRow.kind,
        data: stagedRow.data,
        matchStatus: stagedRow.matchStatus,
      })
      .from(stagedRow)
      .where(
        and(
          eq(stagedRow.jobId, input.jobId),
          inArray(stagedRow.id, input.ids),
          isNull(stagedRow.committedRecordId),
          writableBy(scope, stagedRow.ownerId),
        ),
      );
    if (rows.length !== input.ids.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Rows changed" });
    }
    if (input.patch?.categoryId) await checkCategory(tx, input.patch.categoryId);
    const categories = await loadClassificationCategories(tx);
    for (const row of rows) {
      let patch;
      const amount =
        input.patch?.amount === undefined
          ? undefined
          : new Decimal(input.patch.amount).toFixed();
      const amountChanged =
        amount !== undefined &&
        typeof row.data.amount === "string" &&
        !new Decimal(amount).equals(row.data.amount);
      if (input.patch && row.kind === "transaction") {
        const current = stagedSchemas.transaction.parse(row.data);
        const classification = classifyTransaction(
          current,
          input.patch,
          categories,
        );
        if (
          amountChanged &&
          amount !== undefined &&
          new Decimal(current.amount).isNegative() !==
            new Decimal(amount).isNegative()
        ) {
          const kind = categoryKind(categories, classification.categoryId);
          // A direction correction clears an incompatible income/expense label; transfers remain transfers.
          if (
            (kind === "expense" && !new Decimal(amount).isNegative()) ||
            (kind === "income" && new Decimal(amount).isNegative())
          ) {
            classification.categoryId = null;
          }
        }
        patch = stagedSchemas.transaction.parse({
          ...current,
          ...Object.fromEntries(
            Object.entries(input.patch).filter(([, v]) => v !== undefined),
          ),
          ...classification,
          ...(amount !== undefined ? { amount } : {}),
          ...(input.patch.amount !== undefined || input.patch.confirmAmount
            ? { signMismatch: false, suggestedAmount: null }
            : {}),
        });
      } else if (amount !== undefined) {
        if (
          row.kind !== "cash_balance" &&
          row.kind !== "investment_transaction"
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This row has no editable cash amount",
          });
        patch = stagedSchemas[row.kind].parse({
          ...row.data,
          amount,
        });
      }
      // An edited exact duplicate is now uncertain and must receive a fresh Keep/Skip choice.
      const changedDuplicate =
        amountChanged && row.matchStatus === "duplicate";
      await tx
        .update(stagedRow)
        .set({
          ...(input.decision ? { decision: input.decision } : {}),
          ...(patch ? { data: patch } : {}),
          ...(changedDuplicate
            ? {
                matchStatus: "possible_duplicate",
                decision: input.decision ?? "pending",
              }
            : {}),
        })
        .where(eq(stagedRow.id, row.id));
    }
    return { updated: rows.length };
  });
}

/** Remove the upload and anything staged from it. Records already committed stay. */
export async function discardImportJob(
  db: Database,
  scope: AccessScope,
  jobId: string,
) {
  const [doc] = await db
    .select({ id: document.id, storageKey: document.storageKey })
    .from(extractionJob)
    .innerJoin(document, eq(document.id, extractionJob.documentId))
    .where(
      and(
        eq(extractionJob.id, jobId),
        writableBy(scope, extractionJob.ownerId),
      ),
    )
    .limit(1);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
  await db.delete(document).where(eq(document.id, doc.id));
  await removeUpload(doc.storageKey);
  return { ok: true };
}
