import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import {
  currencyInput,
  isoDateInput,
  moneyInput,
  monthInput,
  optionalText,
} from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { category, financialAccount, transaction } from "~/server/db/schema";
import {
  readableAccount,
  resolveWorkspaceScope,
  writableBy,
} from "~/server/lib/access";
import { shiftMonth } from "~/lib/dates";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import {
  checkCategory,
  lockAccounts,
  requireOpenPeriod,
  requireUnreconciled,
  transactionIdsInput,
  writableTransactions,
} from "~/server/modules/spending/guards";
import {
  loadMerchantRules,
  matchMerchantRule,
} from "~/server/modules/spending/rules";

/** First day of `month` and of the month after, as ISO dates. */
function monthRange(month: string) {
  return { start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` };
}

const transactionInput = z.object({
  accountId: z.uuid(),
  postedDate: isoDateInput,
  description: z.string().trim().min(1).max(500),
  merchant: optionalText(200),
  /** Signed: negative is money out, positive is money in. */
  amount: moneyInput.refine(
    (v) => !/^-?0*(\.0*)?$/.test(v),
    "Amount cannot be zero",
  ),
  /** Defaults to the account currency. */
  currency: currencyInput.nullable(),
  categoryId: z.uuid().nullable(),
  isTransfer: z.boolean(),
  cleared: z.boolean().default(false),
  notes: optionalText(2000),
});

/** Day-to-day money in and out of bank, card and cash accounts. */
export const spendingRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.uuid().optional(),
        month: monthInput,
        accountId: z.uuid().nullable(),
        categoryId: z.uuid().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input.workspaceId,
      );
      const { start, end } = monthRange(input.month);
      return ctx.db
        .select({
          id: transaction.id,
          accountId: transaction.accountId,
          accountName: financialAccount.name,
          postedDate: transaction.postedDate,
          description: transaction.description,
          merchant: transaction.merchant,
          amount: transaction.amount,
          currency: transaction.currency,
          categoryId: transaction.categoryId,
          categoryName: category.name,
          categoryColor: category.color,
          isTransfer: transaction.isTransfer,
          notes: transaction.notes,
          source: transaction.source,
          categorySource: transaction.categorySource,
          cleared: transaction.cleared,
          reconciliationId: transaction.reconciliationId,
        })
        .from(transaction)
        .innerJoin(
          financialAccount,
          eq(financialAccount.id, transaction.accountId),
        )
        .leftJoin(category, eq(category.id, transaction.categoryId))
        .where(
          and(
            readableAccount(scope, transaction.ownerId, transaction.accountId),
            gte(transaction.postedDate, start),
            lt(transaction.postedDate, end),
            input.accountId
              ? eq(transaction.accountId, input.accountId)
              : undefined,
            input.categoryId
              ? eq(transaction.categoryId, input.categoryId)
              : undefined,
          ),
        )
        .orderBy(desc(transaction.postedDate), desc(transaction.createdAt));
    }),

  /** Money out and in per category and currency for a month, transfers excluded. */
  summary: protectedProcedure
    .input(z.object({ month: monthInput, workspaceId: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input.workspaceId,
      );
      const { start, end } = monthRange(input.month);
      return ctx.db
        .select({
          categoryId: transaction.categoryId,
          categoryName: category.name,
          categoryColor: category.color,
          currency: transaction.currency,
          spent: sql<string>`coalesce(sum(-${transaction.amount}) filter (where ${transaction.amount} < 0), 0)::text`,
          received: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.amount} > 0), 0)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(transaction)
        .leftJoin(category, eq(category.id, transaction.categoryId))
        .where(
          and(
            readableAccount(scope, transaction.ownerId, transaction.accountId),
            eq(transaction.isTransfer, false),
            gte(transaction.postedDate, start),
            lt(transaction.postedDate, end),
          ),
        )
        .groupBy(
          transaction.categoryId,
          category.name,
          category.color,
          transaction.currency,
        )
        .orderBy(asc(transaction.currency), asc(category.name));
    }),

  create: protectedProcedure
    .input(transactionInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          input.accountId,
        );
        await checkCategory(tx, input.categoryId);
        const currency = input.currency ?? account.currency;
        await requireOpenPeriod(tx, ctx.scope, { ...input, currency });
        const rule =
          !input.categoryId && !input.isTransfer
            ? matchMerchantRule(await loadMerchantRules(tx, ctx.scope), input)
            : undefined;
        const [row] = await tx
          .insert(transaction)
          .values({
            ...input,
            ownerId: ctx.scope.userId,
            currency,
            categoryId: input.categoryId ?? rule?.categoryId ?? null,
            categorySource: input.categoryId ? "user" : rule ? "rule" : null,
            source: "manual",
            fingerprint: `manual:${randomUUID()}`,
          })
          .returning({ id: transaction.id });
        return row!;
      }),
    ),

  update: protectedProcedure
    .input(
      transactionInput.extend({
        id: z.uuid(),
        cleared: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const { id, ...values } = input;
        const [current] = await writableTransactions(
          tx,
          ctx.scope,
          [id],
          [values.accountId],
        );
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          values.accountId,
          {
            allowArchived: values.accountId === current!.accountId,
          },
        );
        if (values.categoryId !== current!.categoryId)
          await checkCategory(tx, values.categoryId);
        const currency = values.currency ?? account.currency;
        const cleared = values.cleared ?? current!.cleared;
        const financialChange =
          current!.accountId !== values.accountId ||
          current!.postedDate !== values.postedDate ||
          current!.currency !== currency ||
          !new Decimal(current!.amount).equals(values.amount) ||
          current!.cleared !== cleared ||
          current!.description !== values.description;
        if (financialChange) {
          requireUnreconciled([current!]);
          await requireOpenPeriod(tx, ctx.scope, { ...values, currency });
        }
        const categorySource =
          current!.categoryId === values.categoryId
            ? current!.categorySource
            : ("user" as const);
        await tx
          .update(transaction)
          .set({ ...values, currency, cleared, categorySource })
          .where(
            and(
              eq(transaction.id, id),
              writableBy(ctx.scope, transaction.ownerId),
            ),
          );
      }),
    ),

  bulkUpdate: protectedProcedure
    .input(
      z.object({
        ids: transactionIdsInput,
        changes: z
          .object({
            categoryId: z.uuid().nullable().optional(),
            merchant: optionalText(200).optional(),
            notes: optionalText(2000).optional(),
            isTransfer: z.boolean().optional(),
            cleared: z.boolean().optional(),
          })
          .refine(
            (v) => Object.values(v).some((value) => value !== undefined),
            "Choose at least one field to change",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const rows = await writableTransactions(tx, ctx.scope, input.ids);
        if (input.changes.cleared !== undefined) requireUnreconciled(rows);
        if (input.changes.categoryId !== undefined)
          await checkCategory(tx, input.changes.categoryId);
        await tx
          .update(transaction)
          .set({
            ...input.changes,
            ...(input.changes.categoryId !== undefined
              ? { categorySource: "user" as const }
              : {}),
          })
          .where(
            and(
              inArray(transaction.id, input.ids),
              writableBy(ctx.scope, transaction.ownerId),
            ),
          );
        return { count: rows.length };
      }),
    ),

  bulkRemove: protectedProcedure
    .input(z.object({ ids: transactionIdsInput }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const rows = await writableTransactions(tx, ctx.scope, input.ids);
        requireUnreconciled(rows);
        await tx
          .delete(transaction)
          .where(
            and(
              inArray(transaction.id, input.ids),
              writableBy(ctx.scope, transaction.ownerId),
            ),
          );
        return { count: rows.length };
      }),
    ),

  remove: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const rows = await writableTransactions(tx, ctx.scope, [input.id]);
        requireUnreconciled(rows);
        await tx
          .delete(transaction)
          .where(
            and(
              eq(transaction.id, input.id),
              writableBy(ctx.scope, transaction.ownerId),
            ),
          );
      }),
    ),
});
