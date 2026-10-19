import Decimal from "decimal.js";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  financialAccount,
  institution,
  userSettings,
  user,
} from "~/server/db/schema";
import { readableAccount, resolveWorkspaceScope } from "~/server/lib/access";
import { type assetClasses, holdsSecurities } from "~/lib/accounts";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import { lockAccounts } from "~/server/modules/spending/guards";
import { latestHoldings, ratesInto } from "~/server/modules/portfolio/holdings";
import {
  snapshotInput,
  writeSnapshot,
} from "~/server/modules/portfolio/snapshots";
import {
  type Amount,
  convertAmounts,
} from "~/server/modules/portfolio/valuation";

/** Holdings and net worth: what the accounts are worth, as opposed to spending flows. */
export const portfolioRouter = createTRPCRouter({
  /**
   * Latest value of every open account, converted to the display currency where an FX rate is
   * known. Amounts without a rate are returned separately rather than left out silently.
   */
  netWorth: protectedProcedure
    .input(z.object({ workspaceId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input?.workspaceId,
      );
      const [settingsRows, accounts] = await Promise.all([
        ctx.db
          .select({ displayCurrency: userSettings.displayCurrency })
          .from(userSettings)
          .where(eq(userSettings.userId, ctx.scope.userId))
          .limit(1),
        ctx.db
          .select({
            ownerId: financialAccount.ownerId,
            ownerName: user.name,
            id: financialAccount.id,
            name: financialAccount.name,
            type: financialAccount.type,
            last4: financialAccount.last4,
            institutionName: institution.name,
            institutionKey: institution.key,
          })
          .from(financialAccount)
          .innerJoin(user, eq(user.id, financialAccount.ownerId))
          .leftJoin(
            institution,
            eq(institution.id, financialAccount.institutionId),
          )
          .where(
            and(
              readableAccount(
                scope,
                financialAccount.ownerId,
                financialAccount.id,
              ),
              isNull(financialAccount.archivedAt),
            ),
          )
          .orderBy(financialAccount.name),
      ]);
      const target =
        scope.workspace?.displayCurrency ??
        settingsRows[0]?.displayCurrency ??
        "SGD";
      const holdings = await latestHoldings(
        ctx.db,
        scope,
        accounts.map((a) => a.id),
      );

      // Investments are split by asset class; bank and card balances are reported on their own.
      const allocation = new Map<string, Amount[]>();
      const banking: Amount[] = [];
      const add = (key: string, amount: Amount) =>
        allocation.set(key, [...(allocation.get(key) ?? []), amount]);
      const investing = new Set(
        accounts.filter((a) => holdsSecurities(a.type)).map((a) => a.id),
      );
      for (const [accountId, h] of holdings) {
        if (!investing.has(accountId)) {
          banking.push(...h.cash);
          continue;
        }
        for (const p of h.positions) if (p.value) add(p.assetClass, p.value);
        for (const c of h.cash) add("cash", c);
      }
      const everything = [...[...allocation.values()].flat(), ...banking];
      const rates = await ratesInto(
        ctx.db,
        target,
        everything.map((a) => a.currency),
      );

      const latest = [...holdings.values()]
        .map((h) => h.asOf)
        .sort()
        .at(-1);
      return {
        currency: target,
        ...convertAmounts(everything, target, rates),
        asOf: latest ?? null,
        unpriced: [...holdings.values()].reduce((n, h) => n + h.unpriced, 0),
        accounts: accounts.map((a) => {
          const h = holdings.get(a.id);
          return {
            ...a,
            asOf: h?.asOf ?? null,
            totals: h?.totals ?? [],
            unpriced: h?.unpriced ?? 0,
            ...convertAmounts(h?.totals ?? [], target, rates),
          };
        }),
        banking: convertAmounts(banking, target, rates),
        allocation: [...allocation]
          .map(([assetClass, amounts]) => ({
            assetClass: assetClass as (typeof assetClasses)[number] | "cash",
            ...convertAmounts(amounts, target, rates),
          }))
          .sort((a, b) => new Decimal(b.total ?? 0).comparedTo(a.total ?? 0)),
      };
    }),

  /**
   * Records what an account held on a date: positions (investment accounts) and cash balances.
   * Re-entering the same date replaces the earlier manual entry.
   */
  recordSnapshot: protectedProcedure
    .input(snapshotInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          input.accountId,
        );
        return writeSnapshot(tx, ctx.scope, account, input, {
          source: "manual",
        });
      }),
    ),
});
