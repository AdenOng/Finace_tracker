import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import {
  and,
  asc,
  type Column,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import {
  currencyInput,
  isoDateInput,
  moneyInput,
  monthInput,
  optionalText,
} from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { Database } from "~/server/db";
import {
  category,
  financialAccount,
  transaction,
  userSettings,
} from "~/server/db/schema";
import {
  type AccessScope,
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
import { ratesInto } from "~/server/modules/portfolio/holdings";
import { convertAmounts } from "~/server/modules/portfolio/valuation";

/** A search covers every month, so its results are capped; a month is listed in full. */
const SEARCH_LIMIT = 500;

/** First day of `month` and of the month after, as ISO dates. */
function monthRange(month: string) {
  return { start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` };
}

/** Money out and in per category and currency for a month, transfers excluded. */
function monthSummary(
  db: Pick<Database, "select">,
  scope: AccessScope,
  month: string,
) {
  const { start, end } = monthRange(month);
  return db
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
        /** Text in the description, merchant or notes; searches every month, newest first. */
        search: z.string().trim().max(100).default(""),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input.workspaceId,
      );
      const { start, end } = monthRange(input.month);
      // strpos rather than LIKE, so % and _ in the search are ordinary characters.
      const contains = (column: Column) =>
        sql`strpos(lower(coalesce(${column}, '')), lower(${input.search})) > 0`;
      const rows = ctx.db
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
            input.search
              ? or(
                  contains(transaction.description),
                  contains(transaction.merchant),
                  contains(transaction.notes),
                )
              : and(
                  gte(transaction.postedDate, start),
                  lt(transaction.postedDate, end),
                ),
            input.accountId
              ? eq(transaction.accountId, input.accountId)
              : undefined,
            input.categoryId
              ? eq(transaction.categoryId, input.categoryId)
              : undefined,
          ),
        )
        .orderBy(desc(transaction.postedDate), desc(transaction.createdAt));
      return input.search ? rows.limit(SEARCH_LIMIT) : rows;
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
      return monthSummary(ctx.db, scope, input.month);
    }),

  /**
   * A month's money in and out converted into the display currency at the latest rates, so
   * spending in several currencies adds up. Currencies without a rate are listed, not dropped.
   */
  converted: protectedProcedure
    .input(z.object({ month: monthInput, workspaceId: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input.workspaceId,
      );
      const [rows, settings] = await Promise.all([
        monthSummary(ctx.db, scope, input.month),
        ctx.db
          .select({ currency: userSettings.displayCurrency })
          .from(userSettings)
          .where(eq(userSettings.userId, ctx.scope.userId))
          .limit(1),
      ]);
      const target =
        scope.workspace?.displayCurrency ?? settings[0]?.currency ?? "SGD";
      const { rates, asOf } = await ratesInto(
        ctx.db,
        target,
        rows.map((r) => r.currency),
      );
      const convert = (list: typeof rows, field: "spent" | "received") =>
        convertAmounts(
          list.map((r) => ({ amount: r[field], currency: r.currency })),
          target,
          rates,
        );
      const byCategory = new Map<string | null, typeof rows>();
      for (const row of rows)
        byCategory.set(row.categoryId, [
          ...(byCategory.get(row.categoryId) ?? []),
          row,
        ]);
      const spent = convert(rows, "spent");
      const received = convert(rows, "received");
      return {
        currency: target,
        fxAsOf: asOf,
        spent: spent.total ?? "0",
        received: received.total ?? "0",
        unconverted: [
          ...new Set(
            [...spent.unconverted, ...received.unconverted].map(
              (a) => a.currency,
            ),
          ),
        ].sort(),
        categories: [...byCategory].map(([categoryId, list]) => ({
          categoryId,
          spent: convert(list, "spent").total ?? "0",
          received: convert(list, "received").total ?? "0",
        })),
      };
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
