import Decimal from "decimal.js";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  financialAccount,
  institution,
  investmentTransaction,
  userSettings,
  user,
  accountSnapshot,
} from "~/server/db/schema";
import {
  readableAccount,
  resolveWorkspaceScope,
  writableBy,
  type AccessScope,
} from "~/server/lib/access";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { preset } from "~/server/lib/preset";
import {
  type assetClasses,
  type CpfBucket,
  accountGroupOf,
  cpfBuckets,
  holdsSecurities,
} from "~/lib/accounts";
import { todayIso } from "~/lib/dates";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import {
  lockAccounts,
  type FinanceDatabase,
} from "~/server/modules/spending/guards";
import {
  hasSnapshotEntries,
  latestHoldings,
  ratesInto,
  snapshotDetails,
} from "~/server/modules/portfolio/holdings";
import {
  snapshotInput,
  writeSnapshot,
} from "~/server/modules/portfolio/snapshots";
import {
  type Amount,
  convertAmounts,
} from "~/server/modules/portfolio/valuation";
import { consolidateHoldings } from "~/server/modules/portfolio/consolidated";
import { refreshQuotes } from "~/server/modules/portfolio/market-health";

const entryIdentity = z.object({
  accountId: z.uuid(),
  snapshotId: z.uuid(),
  version: z.string().min(1).max(100),
});
async function lockEntry(
  db: FinanceDatabase,
  scope: AccessScope,
  input: z.infer<typeof entryIdentity>,
) {
  const [entry] = await db
    .select({
      id: accountSnapshot.id,
      source: accountSnapshot.source,
      documentId: accountSnapshot.documentId,
      version: sql<string>`${accountSnapshot.updatedAt}::text`,
    })
    .from(accountSnapshot)
    .where(
      and(
        eq(accountSnapshot.id, input.snapshotId),
        eq(accountSnapshot.accountId, input.accountId),
        writableBy(scope, accountSnapshot.ownerId),
      ),
    )
    .for("update");
  if (!entry)
    throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
  if (entry.version !== input.version)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This entry changed while you were reviewing it. Refresh and try again.",
    });
  return entry;
}

/** Holdings and net worth: what the accounts are worth, as opposed to spending flows. */
export const portfolioRouter = createTRPCRouter({
  /** Personal view of current holdings across active investment accounts. */
  consolidated: protectedProcedure
    .input(z.object({ accountId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const [rows, settings] = await Promise.all([
        ctx.db
          .select({
            id: financialAccount.id,
            name: financialAccount.name,
            type: financialAccount.type,
            archivedAt: financialAccount.archivedAt,
            institutionName: institution.name,
            institutionKey: institution.key,
          })
          .from(financialAccount)
          .leftJoin(
            institution,
            eq(institution.id, financialAccount.institutionId),
          )
          .where(writableBy(ctx.scope, financialAccount.ownerId))
          .orderBy(financialAccount.name),
        ctx.db
          .select({ currency: userSettings.displayCurrency })
          .from(userSettings)
          .where(eq(userSettings.userId, ctx.scope.userId))
          .limit(1),
      ]);
      const investmentAccounts = rows.filter((a) => holdsSecurities(a.type));
      const accounts = investmentAccounts.filter((a) => !a.archivedAt);
      if (input?.accountId && !accounts.some((a) => a.id === input.accountId))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Investment account not found",
        });
      const currency = settings[0]?.currency ?? "SGD";
      const holdings = await latestHoldings(
        ctx.db,
        ctx.scope,
        accounts.map((a) => a.id),
      );
      const { rates, asOf: fxAsOf } = await ratesInto(
        ctx.db,
        currency,
        // Costs stay in the listing's currency even when a quote values it in another.
        [...holdings.values()].flatMap((h) => [
          ...h.totals.map((t) => t.currency),
          ...h.positions.map((p) => p.currency),
        ]),
      );
      return {
        ...consolidateHoldings(
          accounts,
          holdings,
          currency,
          rates,
          input?.accountId,
        ),
        fxAsOf,
        archivedCount: investmentAccounts.filter((a) => a.archivedAt).length,
      };
    }),
  history: protectedProcedure
    .input(z.object({ accountId: z.uuid(), cursor: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      await requireWritableAccount(ctx.db, ctx.scope, input.accountId, {
        allowArchived: true,
      });
      const owned = and(
        eq(accountSnapshot.accountId, input.accountId),
        writableBy(ctx.scope, accountSnapshot.ownerId),
      );
      const [rows, current] = await Promise.all([
        ctx.db
          .select({
            id: accountSnapshot.id,
            asOf: accountSnapshot.asOf,
            source: accountSnapshot.source,
            documentId: accountSnapshot.documentId,
            version: sql<string>`${accountSnapshot.updatedAt}::text`,
            positionCount: sql<number>`(select count(*)::int from position p where p.snapshot_id=account_snapshot.id)`,
            adjusted: sql<boolean>`${accountSnapshot.updatedAt} > ${accountSnapshot.createdAt}`,
            importId: sql<
              string | null
            >`(select j.id from extraction_job j where j.document_id=account_snapshot.document_id and j.owner_id=${ctx.scope.userId} order by j.created_at desc limit 1)`,
            cashCount: sql<number>`(select count(*)::int from cash_balance c where c.snapshot_id=account_snapshot.id)`,
          })
          .from(accountSnapshot)
          .where(
            and(
              owned,
              input.cursor
                ? sql`(${accountSnapshot.asOf},${accountSnapshot.createdAt},${accountSnapshot.id}) < (select as_of,created_at,id from account_snapshot where id=${input.cursor} and account_id=${input.accountId} and owner_id=${ctx.scope.userId})`
                : undefined,
            ),
          )
          .orderBy(
            desc(accountSnapshot.asOf),
            desc(accountSnapshot.createdAt),
            desc(accountSnapshot.id),
          )
          .limit(21),
        ctx.db
          .select({ id: accountSnapshot.id })
          .from(accountSnapshot)
          .where(and(owned, hasSnapshotEntries(ctx.db)))
          .orderBy(
            desc(accountSnapshot.asOf),
            desc(accountSnapshot.createdAt),
            desc(accountSnapshot.id),
          )
          .limit(1),
      ]);
      const more = rows.length > 20;
      const entries = rows.slice(0, 20);
      return {
        entries,
        currentId: current[0]?.id ?? null,
        nextCursor: more ? entries.at(-1)!.id : null,
      };
    }),
  snapshot: protectedProcedure
    .input(z.object({ accountId: z.uuid(), snapshotId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      await requireWritableAccount(ctx.db, ctx.scope, input.accountId, {
        allowArchived: true,
      });
      return snapshotDetails(
        ctx.db,
        ctx.scope,
        input.accountId,
        input.snapshotId,
      );
    }),
  addSnapshot: protectedProcedure
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
          createOnly: true,
          manual: true,
        });
      }),
    ),
  updateSnapshot: protectedProcedure
    .input(
      z.object({
        snapshotId: z.uuid(),
        version: z.string().min(1).max(100),
        entry: snapshotInput,
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.entry.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          input.entry.accountId,
        );
        const current = await lockEntry(tx, ctx.scope, {
          accountId: input.entry.accountId,
          ...input,
        });
        return writeSnapshot(tx, ctx.scope, account, input.entry, {
          source: current.source,
          documentId: current.documentId,
          editId: current.id,
          manual: true,
        });
      }),
    ),
  removeSnapshot: protectedProcedure
    .input(entryIdentity)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        await requireWritableAccount(tx, ctx.scope, input.accountId);
        const entry = await lockEntry(tx, ctx.scope, input);
        await tx
          .delete(accountSnapshot)
          .where(
            and(
              eq(accountSnapshot.id, entry.id),
              eq(accountSnapshot.accountId, input.accountId),
              writableBy(ctx.scope, accountSnapshot.ownerId),
            ),
          );
        return { id: entry.id };
      }),
    ),
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
          .select({
            displayCurrency: userSettings.displayCurrency,
            countCpfSrs: userSettings.countCpfSrs,
          })
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

      // Investments are split by asset class; bank and card balances, and CPF and SRS, are
      // reported on their own. CPF is also split by sub-account.
      const allocation = new Map<string, Amount[]>();
      const banking: Amount[] = [];
      const cpfSrs: Amount[] = [];
      const cpf = new Map<CpfBucket | null, Amount[]>();
      const add = (key: string, amount: Amount) =>
        allocation.set(key, [...(allocation.get(key) ?? []), amount]);
      const typeOf = new Map(accounts.map((a) => [a.id, a.type]));
      for (const [accountId, h] of holdings) {
        const type = typeOf.get(accountId)!;
        const group = accountGroupOf(type);
        if (group === "banking") {
          banking.push(...h.cash);
          continue;
        }
        if (group === "cpf_srs") {
          cpfSrs.push(...h.totals);
          if (type === "cpf")
            for (const c of h.cash)
              cpf.set(c.bucket, [...(cpf.get(c.bucket) ?? []), c]);
          continue;
        }
        for (const p of h.positions) if (p.value) add(p.assetClass, p.value);
        for (const c of h.cash) add("cash", c);
      }
      // Without CPF and SRS in the preset the setting is hidden, so existing accounts still count.
      const { cpfSrs: cpfSrsEnabled } = await preset.features();
      const countCpfSrs =
        !cpfSrsEnabled || (settingsRows[0]?.countCpfSrs ?? true);
      const counted = [
        ...[...allocation.values()].flat(),
        ...banking,
        ...(countCpfSrs ? cpfSrs : []),
      ];
      const { rates, asOf: fxAsOf } = await ratesInto(
        ctx.db,
        target,
        [...counted, ...cpfSrs].map((a) => a.currency),
      );

      // SRS top-ups this calendar year, from imported deposits into your own SRS accounts.
      // Transfers between SRS accounts move existing money and do not use up the cap.
      const year = todayIso().slice(0, 4);
      const srsIds = accounts
        .filter((a) => a.type === "srs" && a.ownerId === ctx.scope.userId)
        .map((a) => a.id);
      const [srsTopUps] = srsIds.length
        ? await ctx.db
            .select({
              total: sql<string>`coalesce(sum(abs(${investmentTransaction.amount})), 0)::text`,
            })
            .from(investmentTransaction)
            .where(
              and(
                writableBy(ctx.scope, investmentTransaction.ownerId),
                inArray(investmentTransaction.accountId, srsIds),
                eq(investmentTransaction.type, "deposit"),
                eq(investmentTransaction.currency, "SGD"),
                gte(investmentTransaction.tradeDate, `${year}-01-01`),
              ),
            )
        : [];

      const latest = [...holdings.values()]
        .map((h) => h.asOf)
        .sort()
        .at(-1);
      const countedEntries = [...holdings].filter(
        ([id]) => countCpfSrs || accountGroupOf(typeOf.get(id)!) !== "cpf_srs",
      );
      const countedHoldings = countedEntries.map(([, h]) => h);
      const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
      const held = countedHoldings.flatMap((h) => h.positions);
      const quoted = held.filter((p) => p.quotedAt);
      const quoteTimes = quoted.map((p) => p.quotedAt!.getTime());
      return {
        currency: target,
        fxAsOf,
        ...convertAmounts(counted, target, rates),
        asOf: latest ?? null,
        unpriced: countedHoldings.reduce((n, h) => n + h.unpriced, 0),
        /** How many holdings are valued at market prices rather than their statement price. */
        prices: held.length
          ? {
              feed: cachedInstanceSettings().priceQuotes,
              holdings: held.length,
              quoted: quoted.length,
              /** Holdings whose market price is too far from the statement to be the same thing. */
              implausible: countedEntries
                .flatMap(([id, h]) =>
                  h.positions
                    .filter((p) => p.implausibleQuote)
                    .map((p) => `${p.symbol} in ${nameOf.get(id)}`),
                )
                .sort(),
              oldest: quoteTimes.length
                ? new Date(Math.min(...quoteTimes))
                : null,
              /** Null unless every quoted holding has a previous close to compare with. */
              change: quoted.every((p) => p.dayChange)
                ? convertAmounts(
                    quoted.map((p) => p.dayChange!),
                    target,
                    rates,
                  )
                : null,
            }
          : null,
        countCpfSrs,
        cpfSrsEnabled,
        cpfSrs: convertAmounts(cpfSrs, target, rates),
        cpf: [...cpf]
          .sort(
            ([a], [b]) =>
              (a ? cpfBuckets.indexOf(a) : 9) - (b ? cpfBuckets.indexOf(b) : 9),
          )
          .map(([bucket, amounts]) => ({
            bucket,
            ...convertAmounts(amounts, target, rates),
          })),
        srs: srsTopUps ? { year, toppedUp: srsTopUps.total } : null,
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

  /** Fetches market prices for everything the visible accounts currently hold. */
  refreshPrices: protectedProcedure
    .input(z.object({ workspaceId: z.uuid().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input?.workspaceId,
      );
      const accounts = await ctx.db
        .select({ id: financialAccount.id })
        .from(financialAccount)
        .where(
          and(
            readableAccount(
              scope,
              financialAccount.ownerId,
              financialAccount.id,
            ),
            isNull(financialAccount.archivedAt),
          ),
        );
      const holdings = await latestHoldings(
        ctx.db,
        scope,
        accounts.map((a) => a.id),
      );
      const securityIds = [
        ...new Set(
          [...holdings.values()].flatMap((h) =>
            h.positions.map((p) => p.securityId),
          ),
        ),
      ];
      return refreshQuotes(ctx.db, { securityIds });
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
          manual: true,
        });
      }),
    ),
});
