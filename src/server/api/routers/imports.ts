import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import { accountGroupOf, holdsSecurities } from "~/lib/accounts";
import { isoDateInput } from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  accountSnapshot,
  auditLog,
  cashBalance,
  document,
  extractionJob,
  financialAccount,
  institution,
  investmentTransaction,
  position,
  security,
  stagedRow,
  transaction,
} from "~/server/db/schema";
import { writableBy } from "~/server/lib/access";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import type { StatementExtraction } from "~/server/modules/extraction";
import {
  stagedSchemas,
  type StagedKind,
  type StagedCashBalance,
  type StagedInvestmentTransaction,
  type StagedPosition,
  type StagedTransaction,
} from "~/server/modules/imports/rows";
import { runImportJob } from "~/server/modules/imports/runner";
import { removeUpload } from "~/server/modules/imports/storage";
import {
  importLinePreview,
  LINE_REMOVED,
} from "~/server/modules/imports/line-items";
import {
  snapshotInput,
  writeSnapshot,
} from "~/server/modules/portfolio/snapshots";
import { hasSnapshotEntries } from "~/server/modules/portfolio/holdings";
import {
  checkCategory,
  lockAccounts,
  requireOpenPeriod,
} from "~/server/modules/spending/guards";
import { normalizeMerchantText } from "~/server/modules/spending/rules";

/** A job still "running" after this long lost its worker (e.g. a restart) and may be retried. */
const STALE_AFTER_MS = 6 * 60_000;

const jobColumns = {
  id: extractionJob.id,
  status: extractionJob.status,
  error: extractionJob.error,
  model: extractionJob.model,
  createdAt: extractionJob.createdAt,
  startedAt: extractionJob.startedAt,
  finishedAt: extractionJob.finishedAt,
  documentId: document.id,
  fileName: document.fileName,
  mimeType: document.mimeType,
  periodStart: document.periodStart,
  periodEnd: document.periodEnd,
  accountId: financialAccount.id,
  accountName: financialAccount.name,
  accountType: financialAccount.type,
  accountCurrency: financialAccount.currency,
  accountArchivedAt: financialAccount.archivedAt,
  institutionName: institution.name,
  institutionKey: institution.key,
};

const isStale = (job: { status: string; startedAt: Date | null }) =>
  job.status === "running" &&
  !!job.startedAt &&
  Date.now() - job.startedAt.getTime() > STALE_AFTER_MS;

/** Deterministic, so committing the same statement line twice is caught by the unique index. */
function fingerprint(parts: (string | null)[], seen: Map<string, number>) {
  const key = parts.map((p) => p ?? "").join("\u0000");
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  return `statement:${createHash("sha256").update(`${key}\u0000${n}`).digest("hex")}`;
}

/** Statement uploads: what the AI read, waiting for the owner to review and commit. */
export const importsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const jobs = await ctx.db
      .select({
        ...jobColumns,
        rows: sql<number>`(select count(*)::int from ${stagedRow} where ${stagedRow.jobId} = ${extractionJob.id})`,
        accepted: sql<number>`(select count(*)::int from ${stagedRow} where ${stagedRow.jobId} = ${extractionJob.id} and ${stagedRow.decision} = 'accept')`,
      })
      .from(extractionJob)
      .innerJoin(document, eq(document.id, extractionJob.documentId))
      .leftJoin(financialAccount, eq(financialAccount.id, document.accountId))
      .leftJoin(institution, eq(institution.id, financialAccount.institutionId))
      .where(writableBy(ctx.scope, extractionJob.ownerId))
      .orderBy(desc(extractionJob.createdAt))
      .limit(100);
    return jobs.map((j) => ({ ...j, stale: isStale(j) }));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select({ ...jobColumns, result: extractionJob.result })
        .from(extractionJob)
        .innerJoin(document, eq(document.id, extractionJob.documentId))
        .leftJoin(financialAccount, eq(financialAccount.id, document.accountId))
        .leftJoin(
          institution,
          eq(institution.id, financialAccount.institutionId),
        )
        .where(
          and(
            eq(extractionJob.id, input.id),
            writableBy(ctx.scope, extractionJob.ownerId),
          ),
        )
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const rows = await ctx.db
        .select({
          id: stagedRow.id,
          kind: stagedRow.kind,
          data: stagedRow.data,
          matchStatus: stagedRow.matchStatus,
          decision: stagedRow.decision,
          committedRecordId: stagedRow.committedRecordId,
        })
        .from(stagedRow)
        .where(eq(stagedRow.jobId, job.id))
        .orderBy(asc(stagedRow.createdAt), asc(stagedRow.id));

      const { result, ...rest } = job;
      const removals = rows.length
        ? await ctx.db
            .select({ rowId: auditLog.targetId })
            .from(auditLog)
            .where(
              and(
                eq(auditLog.action, LINE_REMOVED),
                eq(auditLog.actorId, ctx.scope.userId),
                inArray(
                  auditLog.targetId,
                  rows.map((r) => r.id),
                ),
              ),
            )
        : [];
      const removedIds = new Set(removals.map((r) => r.rowId));
      const snapshotScope = job.accountId
        ? and(
            eq(accountSnapshot.accountId, job.accountId),
            writableBy(ctx.scope, accountSnapshot.ownerId),
            hasSnapshotEntries(ctx.db),
          )
        : undefined;
      const [latest, saved] = job.accountId
        ? await Promise.all([
            ctx.db
              .select({ asOf: accountSnapshot.asOf })
              .from(accountSnapshot)
              .where(snapshotScope)
              .orderBy(
                desc(accountSnapshot.asOf),
                desc(accountSnapshot.createdAt),
              )
              .limit(1),
            ctx.db
              .select({
                asOf: accountSnapshot.asOf,
                adjusted: sql<boolean>`${accountSnapshot.updatedAt} > ${accountSnapshot.createdAt}`,
              })
              .from(accountSnapshot)
              .where(
                and(
                  snapshotScope,
                  eq(accountSnapshot.documentId, job.documentId),
                ),
              )
              .orderBy(
                desc(accountSnapshot.asOf),
                desc(accountSnapshot.createdAt),
              )
              .limit(1),
          ])
        : [[], []];
      const out = result as
        (StatementExtraction & { stagingNotes?: string[] }) | null;
      return {
        ...rest,
        latestHoldingsAsOf: latest[0]?.asOf ?? null,
        importedHoldingsAsOf: saved[0]?.asOf ?? null,
        importedHoldingsAdjusted: saved[0]?.adjusted ?? false,
        stale: isStale(job),
        summary: out
          ? {
              documentType: out.documentType,
              institutionName: out.institutionName,
              accountLast4: out.accountLast4,
              currency: out.currency,
              periodStart: out.periodStart,
              periodEnd: out.periodEnd,
              openingBalance: out.openingBalance,
              closingBalance: out.closingBalance,
              warnings: [...out.warnings, ...(out.stagingNotes ?? [])],
            }
          : null,
        rows: rows.map((r) => ({
          ...r,
          removed: removedIds.has(r.id),
          // Parsed again so the client gets the typed shape for its kind.
          data: stagedSchemas[r.kind].parse(r.data),
        })) as (
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              kind: "transaction";
              data: StagedTransaction;
            })
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              kind: "position";
              data: StagedPosition;
            })
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              kind: "cash_balance";
              data: StagedCashBalance;
            })
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              kind: "investment_transaction";
              data: StagedInvestmentTransaction;
            })
        )[],
      };
    }),

  lineRemovalPreview: protectedProcedure
    .input(z.object({ jobId: z.uuid(), rowId: z.uuid() }))
    .query(({ ctx, input }) => importLinePreview(ctx.db, ctx.scope, input)),

  /** Delete exactly one reviewed record, preserving the upload and extraction as evidence. */
  removeLine: protectedProcedure
    .input(
      z.object({
        jobId: z.uuid(),
        rowId: z.uuid(),
        version: z.string().length(64),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        // Same lock order as commit: job, account, then its financial records.
        const [job] = await tx
          .select({ id: extractionJob.id, accountId: document.accountId })
          .from(extractionJob)
          .innerJoin(document, eq(document.id, extractionJob.documentId))
          .where(
            and(
              eq(extractionJob.id, input.jobId),
              writableBy(ctx.scope, extractionJob.ownerId),
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
        await lockAccounts(tx, ctx.scope, [job.accountId]);
        const line = await importLinePreview(tx, ctx.scope, input);
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
                writableBy(ctx.scope, transaction.ownerId),
              ),
            );
        else if (line.kind === "investment_transaction")
          await tx
            .delete(investmentTransaction)
            .where(
              and(
                eq(investmentTransaction.id, line.targetId),
                writableBy(ctx.scope, investmentTransaction.ownerId),
              ),
            );
        else {
          if (line.kind === "position")
            await tx.delete(position).where(eq(position.id, line.targetId));
          else
            await tx
              .delete(cashBalance)
              .where(eq(cashBalance.id, line.targetId));
          if (line.lastInSnapshot)
            await tx
              .delete(accountSnapshot)
              .where(
                and(
                  eq(accountSnapshot.id, line.snapshotId!),
                  writableBy(ctx.scope, accountSnapshot.ownerId),
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
                  writableBy(ctx.scope, accountSnapshot.ownerId),
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
              writableBy(ctx.scope, stagedRow.ownerId),
            ),
          );
        await tx.insert(auditLog).values({
          actorId: ctx.scope.userId,
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
      }),
    ),

  /** Accept or skip rows, and correct a transaction's category or description. */
  updateRows: protectedProcedure
    .input(
      z.object({
        jobId: z.uuid(),
        ids: z.array(z.uuid()).min(1).max(1000),
        decision: z.enum(["accept", "skip"]).optional(),
        patch: z
          .object({
            categoryId: z.uuid().nullable().optional(),
            merchant: z.string().trim().max(200).nullable().optional(),
            isTransfer: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [job] = await tx
          .select({ status: extractionJob.status })
          .from(extractionJob)
          .where(
            and(
              eq(extractionJob.id, input.jobId),
              writableBy(ctx.scope, extractionJob.ownerId),
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
          })
          .from(stagedRow)
          .where(
            and(
              eq(stagedRow.jobId, input.jobId),
              inArray(stagedRow.id, input.ids),
              isNull(stagedRow.committedRecordId),
            ),
          );
        if (rows.length !== input.ids.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Rows changed" });
        }
        if (input.patch?.categoryId)
          await checkCategory(tx, input.patch.categoryId);
        for (const row of rows) {
          const patch =
            input.patch && row.kind === "transaction"
              ? stagedSchemas.transaction.parse({
                  ...row.data,
                  ...Object.fromEntries(
                    Object.entries(input.patch).filter(
                      ([, v]) => v !== undefined,
                    ),
                  ),
                })
              : undefined;
          await tx
            .update(stagedRow)
            .set({
              ...(input.decision ? { decision: input.decision } : {}),
              ...(patch ? { data: patch } : {}),
            })
            .where(eq(stagedRow.id, row.id));
        }
        return { updated: rows.length };
      }),
    ),

  /** Write every accepted row into the account. All of it is saved, or none of it. */
  commit: protectedProcedure
    .input(z.object({ jobId: z.uuid(), asOf: isoDateInput }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [job] = await tx
          .select({
            id: extractionJob.id,
            status: extractionJob.status,
            documentId: document.id,
            accountId: document.accountId,
          })
          .from(extractionJob)
          .innerJoin(document, eq(document.id, extractionJob.documentId))
          .where(
            and(
              eq(extractionJob.id, input.jobId),
              writableBy(ctx.scope, extractionJob.ownerId),
            ),
          )
          .for("update", { of: extractionJob });
        if (!job) throw new TRPCError({ code: "NOT_FOUND" });
        if (job.status !== "needs_review" || !job.accountId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This import is no longer open for review",
          });
        }
        await lockAccounts(tx, ctx.scope, [job.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          job.accountId,
        );

        const rows = await tx
          .select()
          .from(stagedRow)
          .where(
            and(
              eq(stagedRow.jobId, job.id),
              eq(stagedRow.decision, "accept"),
              isNull(stagedRow.committedRecordId),
            ),
          )
          .orderBy(asc(stagedRow.createdAt), asc(stagedRow.id));
        const of = <S extends z.ZodType>(kind: StagedKind, schema: S) =>
          rows
            .filter((r) => r.kind === kind)
            .map((r) => ({
              id: r.id,
              data: schema.parse(r.data),
            }));

        const committed = new Map<string, string>();
        const counts = {
          transactions: 0,
          duplicates: 0,
          holdings: 0,
          activity: 0,
          balances: 0,
        };
        const seen = new Map<string, number>();

        if (accountGroupOf(account.type) === "banking") {
          for (const { id, data } of of(
            "transaction",
            stagedSchemas.transaction,
          )) {
            await requireOpenPeriod(tx, ctx.scope, {
              accountId: account.id,
              currency: data.currency,
              postedDate: data.postedDate,
            });
            await checkCategory(tx, data.categoryId);
            const [row] = await tx
              .insert(transaction)
              .values({
                ownerId: ctx.scope.userId,
                accountId: account.id,
                postedDate: data.postedDate,
                transactionDate: data.transactionDate,
                description: data.description,
                merchant: data.merchant,
                amount: data.amount,
                currency: data.currency,
                originalAmount: data.originalAmount,
                originalCurrency: data.originalCurrency,
                categoryId: data.categoryId,
                categorySource: data.categoryId ? "ai" : null,
                isTransfer: data.isTransfer,
                source: "statement",
                documentId: job.documentId,
                fingerprint: fingerprint(
                  [
                    data.postedDate,
                    data.amount,
                    data.currency,
                    normalizeMerchantText(data.description),
                  ],
                  seen,
                ),
              })
              .onConflictDoNothing({
                target: [transaction.accountId, transaction.fingerprint],
              })
              .returning({ id: transaction.id });
            if (row) {
              committed.set(id, row.id);
              counts.transactions++;
            } else counts.duplicates++;
          }
        }

        const positions = holdsSecurities(account.type)
          ? of("position", stagedSchemas.position)
          : [];
        const cash = of("cash_balance", stagedSchemas.cash_balance);
        if (positions.length > 0 || cash.length > 0) {
          const parsed = snapshotInput.safeParse({
            accountId: account.id,
            asOf: input.asOf,
            positions: positions.map(({ data }) => ({
              symbol: data.symbol,
              exchange: data.exchange,
              name: data.name ?? "",
              assetClass: data.assetClass,
              currency: data.currency,
              quantity: data.quantity,
              averageCost: data.averageCost,
              price: data.price,
              value: data.value,
            })),
            cash: cash.map(({ data }) => data),
          });
          if (!parsed.success) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                parsed.error.issues[0]?.message ??
                "Some holdings could not be saved",
            });
          }
          const snapshot = await writeSnapshot(
            tx,
            ctx.scope,
            account,
            parsed.data,
            { source: "statement", documentId: job.documentId },
          );
          for (const r of [...positions, ...cash])
            committed.set(r.id, snapshot.id);
          counts.holdings = positions.length;
          counts.balances = cash.length;
        }

        const activity = holdsSecurities(account.type)
          ? of("investment_transaction", stagedSchemas.investment_transaction)
          : [];
        if (activity.length > 0) {
          const symbols = [
            ...new Set(
              activity.flatMap(({ data }) =>
                data.symbol ? [data.symbol.toUpperCase()] : [],
              ),
            ),
          ];
          const known =
            symbols.length > 0
              ? await tx
                  .select({ id: security.id, symbol: security.symbol })
                  .from(security)
                  .where(inArray(security.symbol, symbols))
              : [];
          for (const { id, data } of activity) {
            const [row] = await tx
              .insert(investmentTransaction)
              .values({
                ownerId: ctx.scope.userId,
                accountId: account.id,
                securityId:
                  known.find((k) => k.symbol === data.symbol?.toUpperCase())
                    ?.id ?? null,
                type: data.type,
                tradeDate: data.tradeDate,
                settleDate: data.settleDate,
                quantity: data.quantity,
                price: data.price,
                amount: data.amount,
                fees: data.fees,
                currency: data.currency,
                description: data.description,
                source: "statement",
                documentId: job.documentId,
                fingerprint: fingerprint(
                  [
                    data.tradeDate,
                    data.type,
                    data.symbol,
                    data.amount,
                    data.currency,
                  ],
                  seen,
                ),
              })
              .onConflictDoNothing({
                target: [
                  investmentTransaction.accountId,
                  investmentTransaction.fingerprint,
                ],
              })
              .returning({ id: investmentTransaction.id });
            if (row) {
              committed.set(id, row.id);
              counts.activity++;
            } else counts.duplicates++;
          }
        }

        for (const [rowId, recordId] of committed) {
          await tx
            .update(stagedRow)
            .set({ committedRecordId: recordId })
            .where(eq(stagedRow.id, rowId));
        }
        await tx
          .update(extractionJob)
          .set({ status: "completed" })
          .where(eq(extractionJob.id, job.id));
        return counts;
      }),
    ),

  /** Read the file again, e.g. after a provider error or a restart mid-way. */
  retry: protectedProcedure
    .input(z.object({ jobId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select({
          id: extractionJob.id,
          status: extractionJob.status,
          startedAt: extractionJob.startedAt,
        })
        .from(extractionJob)
        .where(
          and(
            eq(extractionJob.id, input.jobId),
            writableBy(ctx.scope, extractionJob.ownerId),
          ),
        )
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "failed" && !isStale(job)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only a failed import can be read again",
        });
      }
      await ctx.db
        .update(extractionJob)
        .set({ status: "queued", error: null })
        .where(eq(extractionJob.id, job.id));
      after(() => runImportJob(job.id));
      return { ok: true };
    }),

  /** Remove the upload and anything staged from it. Records already committed stay. */
  discard: protectedProcedure
    .input(z.object({ jobId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [doc] = await ctx.db
        .select({ id: document.id, storageKey: document.storageKey })
        .from(extractionJob)
        .innerJoin(document, eq(document.id, extractionJob.documentId))
        .where(
          and(
            eq(extractionJob.id, input.jobId),
            writableBy(ctx.scope, extractionJob.ownerId),
          ),
        )
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.delete(document).where(eq(document.id, doc.id));
      await removeUpload(doc.storageKey);
      return { ok: true };
    }),
});
