import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import {
  currencyInput,
  isoDateInput,
  moneyInput,
  priceInput,
  quantityInput,
} from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  accountSnapshot,
  cashBalance,
  financialAccount,
  position,
  security,
  userSettings,
  user,
} from "~/server/db/schema";
import { readableAccount, resolveWorkspaceScope } from "~/server/lib/access";
import { assetClasses, holdsSecurities } from "~/lib/accounts";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import { lockAccounts } from "~/server/modules/spending/guards";
import { latestHoldings, ratesInto } from "~/server/modules/portfolio/holdings";
import {
  type Amount,
  convertAmounts,
  multiply,
} from "~/server/modules/portfolio/valuation";

const positionInput = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(32),
  /** Exchange MIC or short code; blank when unknown. */
  exchange: z.string().trim().toUpperCase().max(16),
  name: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
  assetClass: z.enum(assetClasses),
  currency: currencyInput,
  quantity: quantityInput,
  averageCost: priceInput.nullable(),
  price: priceInput.nullable(),
});

const snapshotInput = z.object({
  accountId: z.uuid(),
  asOf: isoDateInput,
  positions: z
    .array(positionInput)
    .max(500)
    .refine(
      (rows) =>
        new Set(rows.map((r) => `${r.symbol}\u0000${r.exchange}`)).size ===
        rows.length,
      "Each holding can only be listed once",
    ),
  cash: z
    .array(z.object({ currency: currencyInput, amount: moneyInput }))
    .max(20)
    .refine(
      (rows) => new Set(rows.map((r) => r.currency)).size === rows.length,
      "Each currency can only be listed once",
    ),
});

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
          })
          .from(financialAccount)
          .innerJoin(user, eq(user.id, financialAccount.ownerId))
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

      const allocation = new Map<string, Amount[]>();
      const add = (key: string, amount: Amount) =>
        allocation.set(key, [...(allocation.get(key) ?? []), amount]);
      for (const h of holdings.values()) {
        for (const p of h.positions) if (p.value) add(p.assetClass, p.value);
        for (const c of h.cash) add("cash", c);
      }
      const everything = [...allocation.values()].flat();
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
        if (input.positions.length > 0 && !holdsSecurities(account.type)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This type of account only holds cash balances",
          });
        }

        const securityIds = new Map<string, string>();
        if (input.positions.length > 0) {
          // The instrument catalogue is shared: add unknown ones, never rewrite existing ones.
          await tx
            .insert(security)
            .values(
              input.positions.map((p) => ({
                symbol: p.symbol,
                exchange: p.exchange,
                name: p.name,
                assetClass: p.assetClass,
                currency: p.currency,
              })),
            )
            .onConflictDoNothing({
              target: [security.symbol, security.exchange],
            });
          const known = await tx
            .select({
              id: security.id,
              symbol: security.symbol,
              exchange: security.exchange,
              currency: security.currency,
            })
            .from(security)
            .where(
              or(
                ...input.positions.map((p) =>
                  and(
                    eq(security.symbol, p.symbol),
                    eq(security.exchange, p.exchange),
                  ),
                ),
              ),
            );
          for (const p of input.positions) {
            const match = known.find(
              (k) => k.symbol === p.symbol && k.exchange === p.exchange,
            )!;
            if (match.currency !== p.currency) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `${p.symbol}${p.exchange ? ` on ${p.exchange}` : ""} is priced in ${match.currency}, not ${p.currency}`,
              });
            }
            securityIds.set(`${p.symbol}\u0000${p.exchange}`, match.id);
          }
        }

        const replaced = await tx
          .select({ id: accountSnapshot.id })
          .from(accountSnapshot)
          .where(
            and(
              eq(accountSnapshot.accountId, account.id),
              eq(accountSnapshot.asOf, input.asOf),
              eq(accountSnapshot.source, "manual"),
            ),
          );
        if (replaced.length > 0) {
          await tx.delete(accountSnapshot).where(
            inArray(
              accountSnapshot.id,
              replaced.map((r) => r.id),
            ),
          );
        }

        const [snapshot] = await tx
          .insert(accountSnapshot)
          .values({
            ownerId: ctx.scope.userId,
            accountId: account.id,
            asOf: input.asOf,
            source: "manual",
          })
          .returning({ id: accountSnapshot.id });
        const snapshotId = snapshot!.id;

        if (input.positions.length > 0) {
          await tx.insert(position).values(
            input.positions.map((p) => ({
              snapshotId,
              securityId: securityIds.get(`${p.symbol}\u0000${p.exchange}`)!,
              quantity: p.quantity,
              averageCost: p.averageCost,
              costCurrency: p.averageCost ? p.currency : null,
              statementPrice: p.price,
              statementValue: p.price ? multiply(p.quantity, p.price) : null,
            })),
          );
        }
        if (input.cash.length > 0) {
          await tx
            .insert(cashBalance)
            .values(input.cash.map((c) => ({ snapshotId, ...c })));
        }
        return { id: snapshotId, replaced: replaced.length > 0 };
      }),
    ),
});
