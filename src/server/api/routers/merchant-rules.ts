import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { merchantRule, transaction } from "~/server/db/schema";
import { writableBy } from "~/server/lib/access";
import {
  checkCategory,
  transactionIdsInput,
  writableTransactions,
} from "~/server/modules/spending/guards";
import {
  loadMerchantRules,
  matchMerchantRule,
  normalizeMerchantText,
} from "~/server/modules/spending/rules";

const ruleInput = z.object({
  pattern: z.string().trim().min(1).max(200).transform(normalizeMerchantText),
  categoryId: z.uuid(),
});

function applicationPreview(
  rows: (typeof transaction.$inferSelect)[],
  rules: Awaited<ReturnType<typeof loadMerchantRules>>,
) {
  const changes = rows.flatMap((row) => {
    // A manual category or deliberate clearing by the user takes precedence.
    if (row.isTransfer || row.categorySource === "user") return [];
    const rule = matchMerchantRule(rules, row);
    if (
      !rule ||
      (row.categoryId === rule.categoryId && row.categorySource === "rule")
    )
      return [];
    return [
      {
        id: row.id,
        description: row.description,
        merchant: row.merchant,
        categoryId: rule.categoryId,
        categoryName: rule.categoryName,
        pattern: rule.pattern,
      },
    ];
  });
  const revision = createHash("sha256")
    .update(JSON.stringify({ rows, rules }))
    .digest("hex");
  return { changes, skipped: rows.length - changes.length, revision };
}

export const merchantRulesRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    loadMerchantRules(ctx.db, ctx.scope),
  ),
  create: protectedProcedure
    .input(ruleInput)
    .mutation(async ({ ctx, input }) => {
      await checkCategory(ctx.db, input.categoryId);
      const [row] = await ctx.db
        .insert(merchantRule)
        .values({ ...input, ownerId: ctx.scope.userId })
        .returning({ id: merchantRule.id });
      return row!;
    }),
  update: protectedProcedure
    .input(ruleInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await checkCategory(ctx.db, input.categoryId);
      const { id, ...values } = input;
      const [row] = await ctx.db
        .update(merchantRule)
        .set(values)
        .where(
          and(
            eq(merchantRule.id, id),
            writableBy(ctx.scope, merchantRule.ownerId),
          ),
        )
        .returning({ id: merchantRule.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(merchantRule)
        .where(
          and(
            eq(merchantRule.id, input.id),
            writableBy(ctx.scope, merchantRule.ownerId),
          ),
        )
        .returning({ id: merchantRule.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    }),
  preview: protectedProcedure
    .input(z.object({ ids: transactionIdsInput }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(transaction)
        .where(
          and(
            // Sort identically to the commit's locked read.
            writableBy(ctx.scope, transaction.ownerId),
            inArray(transaction.id, input.ids),
          ),
        )
        .orderBy(transaction.id);
      if (rows.length !== input.ids.length)
        throw new TRPCError({ code: "NOT_FOUND" });
      return applicationPreview(
        rows,
        await loadMerchantRules(ctx.db, ctx.scope),
      );
    }),
  applyRules: protectedProcedure
    .input(
      z.object({ ids: transactionIdsInput, revision: z.string().length(64) }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const rows = await writableTransactions(tx, ctx.scope, input.ids);
        const preview = applicationPreview(
          rows,
          await loadMerchantRules(tx, ctx.scope),
        );
        if (preview.revision !== input.revision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Transactions or rules changed. Preview the rules again.",
          });
        const byCategory = new Map<string, string[]>();
        for (const change of preview.changes) {
          const ids = byCategory.get(change.categoryId) ?? [];
          ids.push(change.id);
          byCategory.set(change.categoryId, ids);
        }
        for (const [categoryId, ids] of byCategory) {
          await tx
            .update(transaction)
            .set({ categoryId, categorySource: "rule" })
            .where(
              and(
                inArray(transaction.id, ids),
                writableBy(ctx.scope, transaction.ownerId),
              ),
            );
        }
        return { count: preview.changes.length };
      }),
    ),
});
