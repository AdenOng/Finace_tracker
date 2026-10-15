import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { currencyInput, optionalText } from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { Database } from "~/server/db";
import {
  accountSnapshot,
  accountReconciliation,
  currency,
  financialAccount,
  institution,
  investmentTransaction,
  transaction,
  user,
} from "~/server/db/schema";
import {
  readableAccount,
  resolveWorkspaceScope,
  writableBy,
} from "~/server/lib/access";
import { accountTypes } from "~/lib/accounts";
import { lockAccounts } from "~/server/modules/spending/guards";
import { latestHoldings } from "~/server/modules/portfolio/holdings";

const accountInput = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(accountTypes),
  institutionId: z.uuid().nullable(),
  currency: currencyInput,
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Four digits")
    .nullable()
    .or(z.literal("").transform(() => null)),
  notes: optionalText(2000),
});

const accountColumns = {
  ownerId: financialAccount.ownerId,
  ownerName: user.name,
  id: financialAccount.id,
  name: financialAccount.name,
  type: financialAccount.type,
  currency: financialAccount.currency,
  last4: financialAccount.last4,
  notes: financialAccount.notes,
  institutionId: financialAccount.institutionId,
  institutionName: institution.name,
  archivedAt: financialAccount.archivedAt,
  createdAt: financialAccount.createdAt,
};

async function checkReferences(
  db: Pick<Database, "select" | "$count">,
  input: z.infer<typeof accountInput>,
  currentInstitutionId?: string | null,
) {
  const [known] = await db
    .select({ code: currency.code })
    .from(currency)
    .where(and(eq(currency.code, input.currency), eq(currency.isActive, true)))
    .limit(1);
  if (!known) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown currency" });
  }
  // Keeping an institution that was archived after the account was created is fine.
  if (input.institutionId && input.institutionId !== currentInstitutionId) {
    const active = await db.$count(
      institution,
      and(
        eq(institution.id, input.institutionId),
        isNull(institution.archivedAt),
      ),
    );
    if (!active) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Pick an institution from the list",
      });
    }
  }
}

/** Called after locking the owned account; EXISTS stops at the first history row. */
async function hasAccountHistory(db: Pick<Database, "select">, id: string) {
  const [row] = await db
    .select({
      hasHistory: sql<boolean>`
        exists(select 1 from ${accountSnapshot} where ${accountSnapshot.accountId} = ${id})
        or exists(select 1 from ${transaction} where ${transaction.accountId} = ${id})
        or exists(select 1 from ${investmentTransaction} where ${investmentTransaction.accountId} = ${id})
        or exists(select 1 from ${accountReconciliation} where ${accountReconciliation.accountId} = ${id})
      `,
    })
    .from(financialAccount)
    .where(eq(financialAccount.id, id));
  return row!.hasHistory;
}

/** Accounts shared by the spending and portfolio sides. */
export const accountsRouter = createTRPCRouter({
  /** Every account, archived included, with its latest balance per currency. */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input?.workspaceId,
      );
      const rows = await ctx.db
        .select(accountColumns)
        .from(financialAccount)
        .innerJoin(user, eq(user.id, financialAccount.ownerId))
        .leftJoin(
          institution,
          eq(institution.id, financialAccount.institutionId),
        )
        .where(
          readableAccount(scope, financialAccount.ownerId, financialAccount.id),
        )
        .orderBy(asc(financialAccount.type), asc(financialAccount.name));
      const holdings = await latestHoldings(
        ctx.db,
        scope,
        rows.map((r) => r.id),
      );
      return rows.map((r) => {
        const h = holdings.get(r.id);
        return {
          ...r,
          asOf: h?.asOf ?? null,
          totals: h?.totals ?? [],
          unpriced: h?.unpriced ?? 0,
        };
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.uuid(), workspaceId: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input.workspaceId,
      );
      const [row] = await ctx.db
        .select(accountColumns)
        .from(financialAccount)
        .innerJoin(user, eq(user.id, financialAccount.ownerId))
        .leftJoin(
          institution,
          eq(institution.id, financialAccount.institutionId),
        )
        .where(
          and(
            eq(financialAccount.id, input.id),
            readableAccount(
              scope,
              financialAccount.ownerId,
              financialAccount.id,
            ),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const holdings = await latestHoldings(ctx.db, scope, [row.id]);
      return { ...row, holdings: holdings.get(row.id) ?? null };
    }),

  create: protectedProcedure
    .input(accountInput)
    .mutation(async ({ ctx, input }) => {
      await checkReferences(ctx.db, input);
      const [row] = await ctx.db
        .insert(financialAccount)
        .values({ ...input, ownerId: ctx.scope.userId })
        .returning({ id: financialAccount.id });
      return row!;
    }),

  update: protectedProcedure
    .input(accountInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const { id, ...values } = input;
        await lockAccounts(tx, ctx.scope, [id]);
        const where = and(
          eq(financialAccount.id, id),
          writableBy(ctx.scope, financialAccount.ownerId),
        );
        const [current] = await tx
          .select({
            institutionId: financialAccount.institutionId,
            type: financialAccount.type,
          })
          .from(financialAccount)
          .where(where)
          .limit(1);
        if (!current) throw new TRPCError({ code: "NOT_FOUND" });
        if (current.type !== values.type && (await hasAccountHistory(tx, id))) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Account type cannot change after balances, transactions or reconciliations have been recorded",
          });
        }
        await checkReferences(tx, values, current.institutionId);
        await tx.update(financialAccount).set(values).where(where);
      }),
    ),

  /** Deletes an account with no history; one with balances or transactions is archived instead. */
  remove: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.id]);
        const where = and(
          eq(financialAccount.id, input.id),
          writableBy(ctx.scope, financialAccount.ownerId),
        );
        if (await hasAccountHistory(tx, input.id)) {
          await tx
            .update(financialAccount)
            .set({ archivedAt: new Date() })
            .where(where);
          return { outcome: "archived" as const };
        }
        await tx.delete(financialAccount).where(where);
        return { outcome: "deleted" as const };
      }),
    ),

  restore: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(financialAccount)
        .set({ archivedAt: null })
        .where(
          and(
            eq(financialAccount.id, input.id),
            writableBy(ctx.scope, financialAccount.ownerId),
          ),
        )
        .returning({ id: financialAccount.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    }),
});
