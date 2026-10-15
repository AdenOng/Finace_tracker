import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { holdsSecurities } from "~/lib/accounts";
import { currencyInput, isoDateInput, moneyInput } from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { accountReconciliation, transaction } from "~/server/db/schema";
import { writableBy, type AccessScope } from "~/server/lib/access";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import {
  lockAccounts,
  type FinanceDatabase,
} from "~/server/modules/spending/guards";

// Preserve four decimal places even when large credits and debits cancel.
const StatementDecimal = Decimal.clone({ precision: 40 });

const periodInput = z.object({
  accountId: z.uuid(),
  currency: currencyInput,
  startDate: isoDateInput,
  endDate: isoDateInput,
  openingBalance: moneyInput,
  closingBalance: moneyInput,
});
const validPeriod = (v: z.infer<typeof periodInput>) =>
  v.startDate <= v.endDate;
const periodError = {
  message: "The statement end date must be on or after its start date",
  path: ["endDate"],
};

async function previewPeriod(
  db: FinanceDatabase,
  scope: AccessScope,
  input: z.infer<typeof periodInput>,
) {
  const account = await requireWritableAccount(db, scope, input.accountId, {
    allowArchived: true,
  });
  if (holdsSecurities(account.type))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Reconcile bank, card, cash and wallet transactions here; brokerage holdings use snapshots",
    });
  const rows = await db
    .select({
      id: transaction.id,
      postedDate: transaction.postedDate,
      description: transaction.description,
      merchant: transaction.merchant,
      amount: transaction.amount,
      currency: transaction.currency,
      cleared: transaction.cleared,
      reconciliationId: transaction.reconciliationId,
    })
    .from(transaction)
    .where(
      and(
        writableBy(scope, transaction.ownerId),
        eq(transaction.accountId, input.accountId),
        eq(transaction.currency, input.currency),
        gte(transaction.postedDate, input.startDate),
        lte(transaction.postedDate, input.endDate),
      ),
    )
    .orderBy(asc(transaction.postedDate), asc(transaction.id));
  const overlaps = await db
    .select({ id: accountReconciliation.id })
    .from(accountReconciliation)
    .where(
      and(
        writableBy(scope, accountReconciliation.ownerId),
        eq(accountReconciliation.accountId, input.accountId),
        eq(accountReconciliation.currency, input.currency),
        lte(accountReconciliation.startDate, input.endDate),
        gte(accountReconciliation.endDate, input.startDate),
      ),
    )
    .orderBy(asc(accountReconciliation.id));
  const movement = rows.reduce(
    (sum, row) => sum.plus(row.amount),
    new StatementDecimal(0),
  );
  const expectedClosing = new StatementDecimal(input.openingBalance).plus(
    movement,
  );
  const difference = new StatementDecimal(input.closingBalance).minus(
    expectedClosing,
  );
  const revision = createHash("sha256")
    .update(JSON.stringify({ input, rows, overlaps }))
    .digest("hex");
  return {
    rows,
    movement: movement.toFixed(),
    expectedClosing: expectedClosing.toFixed(),
    difference: difference.toFixed(),
    overlaps: overlaps.length > 0,
    revision,
  };
}

export const reconciliationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ accountId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      await requireWritableAccount(ctx.db, ctx.scope, input.accountId, {
        allowArchived: true,
      });
      return ctx.db
        .select()
        .from(accountReconciliation)
        .where(
          and(
            eq(accountReconciliation.accountId, input.accountId),
            writableBy(ctx.scope, accountReconciliation.ownerId),
          ),
        )
        .orderBy(
          desc(accountReconciliation.endDate),
          desc(accountReconciliation.createdAt),
        );
    }),
  preview: protectedProcedure
    .input(periodInput.refine(validPeriod, periodError))
    .query(({ ctx, input }) => previewPeriod(ctx.db, ctx.scope, input)),
  finish: protectedProcedure
    .input(
      periodInput
        .extend({
          revision: z.string().length(64),
          verifiedIds: z
            .array(z.uuid())
            .max(10000)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "Verify each entry only once",
            ),
        })
        .refine(validPeriod, periodError),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const { revision, verifiedIds, ...period } = input;
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        const preview = await previewPeriod(tx, ctx.scope, period);
        if (preview.overlaps)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This overlaps a reconciled period. Reopen that period first.",
          });
        if (preview.revision !== revision)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Transactions changed. Review the statement again.",
          });
        const verified = new Set(verifiedIds);
        if (
          verified.size !== preview.rows.length ||
          preview.rows.some((r) => !verified.has(r.id))
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Verify every transaction against the statement before finishing",
          });
        }
        if (!new Decimal(preview.difference).isZero())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Balances do not match. Correct the missing or incorrect entries first.",
          });
        const [saved] = await tx
          .insert(accountReconciliation)
          .values({ ...period, ownerId: ctx.scope.userId })
          .returning({ id: accountReconciliation.id });
        if (verifiedIds.length)
          await tx
            .update(transaction)
            .set({ reconciliationId: saved!.id, cleared: true })
            .where(
              and(
                inArray(transaction.id, verifiedIds),
                writableBy(ctx.scope, transaction.ownerId),
              ),
            );
        return saved!;
      }),
    ),
  reopen: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const where = and(
          eq(accountReconciliation.id, input.id),
          writableBy(ctx.scope, accountReconciliation.ownerId),
        );
        const [record] = await tx
          .select({ accountId: accountReconciliation.accountId })
          .from(accountReconciliation)
          .where(where)
          .limit(1);
        if (!record) throw new TRPCError({ code: "NOT_FOUND" });
        await lockAccounts(tx, ctx.scope, [record.accountId]);
        const [removed] = await tx
          .delete(accountReconciliation)
          .where(where)
          .returning({ id: accountReconciliation.id });
        if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
        // ON DELETE SET NULL unlocks entries; their cleared status stays true.
        return removed;
      }),
    ),
});
