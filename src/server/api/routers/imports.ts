import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import {
  checkImportBalance,
  type BalanceSummary,
  type RecordedTransaction,
} from "~/lib/import-balance-check";
import { isoDateInput, moneyInput, pgTimestampText } from "~/server/api/inputs";
import {
  createTRPCRouter,
  expensiveProcedure,
  expensiveReadProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  accountSnapshot,
  auditLog,
  document,
  extractionJob,
  financialAccount,
  institution,
  stagedRow,
  transaction,
} from "~/server/db/schema";
import { writableBy } from "~/server/lib/access";
import type { StatementExtraction } from "~/server/modules/extraction";
import { commitImportJob } from "~/server/modules/imports/commit";
import {
  importLinePreview,
  LINE_REMOVED,
} from "~/server/modules/imports/line-items";
import {
  discardImportJob,
  removeCommittedLine,
  updateStagedRows,
} from "~/server/modules/imports/review-mutations";
import {
  stagedSchemas,
  type StagedCashBalance,
  type StagedInvestmentTransaction,
  type StagedPosition,
  type StagedTransaction,
} from "~/server/modules/imports/rows";
import {
  ImportLimitError,
  isStaleJob,
  requeueImportJob,
  runImportJob,
} from "~/server/modules/imports/runner";
import { getImportAvailability } from "~/server/modules/llm/routing";
import { hasSnapshotEntries } from "~/server/modules/portfolio/holdings";

const jobColumns = {
  id: extractionJob.id,
  status: extractionJob.status,
  error: extractionJob.error,
  model: extractionJob.model,
  createdAt: extractionJob.createdAt,
  updatedAt: extractionJob.updatedAt,
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

/** Statement uploads: what the AI read, waiting for the owner to review and commit. */
export const importsRouter = createTRPCRouter({
  availability: expensiveReadProcedure.query(({ ctx }) =>
    getImportAvailability(ctx.db),
  ),

  list: protectedProcedure
    .input(
      z
        .object({
          cursor: z
            .object({ createdAt: pgTimestampText, id: z.uuid() })
            .nullish(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const page = ctx.db.$with("import_page").as(
        ctx.db
          .select({
            id: extractionJob.id,
            createdAt: extractionJob.createdAt,
          })
          .from(extractionJob)
          .where(
            and(
              writableBy(ctx.scope, extractionJob.ownerId),
              input?.cursor
                ? sql`(${extractionJob.createdAt}, ${extractionJob.id}) < (${input.cursor.createdAt}::timestamptz, ${input.cursor.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(desc(extractionJob.createdAt), desc(extractionJob.id))
          .limit(100),
      );
      const rowCounts = ctx.db
        .select({
          jobId: stagedRow.jobId,
          rows: sql<number>`count(*)::int`.as("rows"),
          accepted:
            sql<number>`count(*) filter (where ${stagedRow.decision} = 'accept')::int`.as(
              "accepted",
            ),
        })
        .from(stagedRow)
        .innerJoin(page, eq(page.id, stagedRow.jobId))
        .where(writableBy(ctx.scope, stagedRow.ownerId))
        .groupBy(stagedRow.jobId)
        .as("staged_row_counts");

      const jobs = await ctx.db
        .with(page)
        .select({
          ...jobColumns,
          cursorCreatedAt: sql<string>`${extractionJob.createdAt}::text`,
          rows: sql<number>`coalesce(${rowCounts.rows}, 0)::int`,
          accepted: sql<number>`coalesce(${rowCounts.accepted}, 0)::int`,
        })
        .from(page)
        .innerJoin(extractionJob, eq(extractionJob.id, page.id))
        .innerJoin(document, eq(document.id, extractionJob.documentId))
        .leftJoin(financialAccount, eq(financialAccount.id, document.accountId))
        .leftJoin(
          institution,
          eq(institution.id, financialAccount.institutionId),
        )
        .leftJoin(rowCounts, eq(rowCounts.jobId, extractionJob.id))
        .orderBy(desc(page.createdAt), desc(page.id));
      return jobs.map((j) => ({ ...j, stale: isStaleJob(j) }));
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

      const recorded =
        job.accountId &&
        rows.some((r) => r.kind === "transaction" && r.matchStatus !== "new")
          ? await ctx.db
              .select({
                rowId: stagedRow.id,
                transaction: {
                  amount: transaction.amount,
                  currency: transaction.currency,
                  postedDate: transaction.postedDate,
                },
              })
              .from(stagedRow)
              .innerJoin(
                transaction,
                eq(transaction.id, stagedRow.matchedRecordId),
              )
              .where(
                and(
                  eq(stagedRow.jobId, job.id),
                  eq(transaction.accountId, job.accountId),
                  writableBy(ctx.scope, transaction.ownerId),
                ),
              )
          : [];
      const recordedByRow = new Map(
        recorded.map((r) => [r.rowId, r.transaction]),
      );

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
              .select({
                asOf: accountSnapshot.asOf,
                source: accountSnapshot.source,
              })
              .from(accountSnapshot)
              .where(snapshotScope)
              .orderBy(
                desc(accountSnapshot.asOf),
                desc(accountSnapshot.createdAt),
              ),
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
        | (StatementExtraction & {
            stagingNotes?: string[];
            balanceAcknowledgment?: { acknowledgedAt: string };
          })
        | null;
      const balanceMetadata: Pick<
        BalanceSummary,
        "openingBalanceDirection" | "closingBalanceDirection"
      > & { balanceAcknowledgment?: { acknowledgedAt: string } } = out
        ? {
            openingBalanceDirection: out.openingBalanceDirection,
            closingBalanceDirection: out.closingBalanceDirection,
            ...(out.balanceAcknowledgment
              ? { balanceAcknowledgment: out.balanceAcknowledgment }
              : {}),
          }
        : {};
      const review = {
        ...rest,
        latestHoldingsAsOf: latest[0]?.asOf ?? null,
        statementDates: [
          ...new Set(
            latest.filter((s) => s.source === "statement").map((s) => s.asOf),
          ),
        ],
        importedHoldingsAsOf: saved[0]?.asOf ?? null,
        importedHoldingsAdjusted: saved[0]?.adjusted ?? false,
        stale: isStaleJob(job),
        summary: out
          ? {
              ...balanceMetadata,
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
          recorded: recordedByRow.has(r.id),
          recordedTransaction: recordedByRow.get(r.id) ?? null,
          // Parsed again so the client gets the typed shape for its kind.
          data: stagedSchemas[r.kind].parse(r.data),
        })) as (
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              recorded?: boolean;
              kind: "transaction";
              data: StagedTransaction;
              recordedTransaction?: RecordedTransaction | null;
            })
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              recorded?: boolean;
              kind: "position";
              data: StagedPosition;
            })
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              recorded?: boolean;
              kind: "cash_balance";
              data: StagedCashBalance;
            })
          | (Omit<(typeof rows)[number], "kind" | "data"> & {
              removed: boolean;
              recorded?: boolean;
              kind: "investment_transaction";
              data: StagedInvestmentTransaction;
            })
        )[],
      };
      return {
        ...review,
        balanceCheck: checkImportBalance({
          summary: review.summary,
          accountType: review.accountType,
          accountCurrency: review.accountCurrency,
          rows: review.rows,
        }),
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
    .mutation(({ ctx, input }) =>
      removeCommittedLine(ctx.db, ctx.scope, input),
    ),

  /** Accept or skip rows, and correct amounts or transaction classification before saving. */
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
            amount: moneyInput.optional(),
            confirmAmount: z.literal(true).optional(),
          })
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) => updateStagedRows(ctx.db, ctx.scope, input)),

  /** Write every accepted row into the account. All of it is saved, or none of it. */
  commit: expensiveProcedure
    .input(
      z.object({
        jobId: z.uuid(),
        asOf: isoDateInput,
        acknowledgeBalanceMismatch: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => commitImportJob(ctx.db, ctx.scope, input)),

  /** Read the file again, e.g. after a provider error or a restart mid-way. */
  retry: expensiveProcedure
    .input(z.object({ jobId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select({
          id: extractionJob.id,
          status: extractionJob.status,
          startedAt: extractionJob.startedAt,
          updatedAt: extractionJob.updatedAt,
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
      const conflict = new TRPCError({
        code: "CONFLICT",
        message: "Only a failed import can be read again",
      });
      if (job.status !== "failed" && !isStaleJob(job)) throw conflict;
      // A stale read that finished in the meantime keeps its result.
      const requeued = await requeueImportJob(ctx.db, job.id, job.status).catch(
        (error: unknown) => {
          if (!(error instanceof ImportLimitError)) throw error;
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: error.message,
          });
        },
      );
      if (!requeued) throw conflict;
      after(() => runImportJob(job.id));
      return { ok: true };
    }),

  /** Remove the upload and anything staged from it. Records already committed stay. */
  discard: protectedProcedure
    .input(z.object({ jobId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      discardImportJob(ctx.db, ctx.scope, input.jobId),
    ),
});
