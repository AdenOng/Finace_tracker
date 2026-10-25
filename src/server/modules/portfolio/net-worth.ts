import Decimal from "decimal.js";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import {
  type assetClasses,
  type CpfBucket,
  accountGroupOf,
  cpfBuckets,
} from "~/lib/accounts";
import { todayIso } from "~/lib/dates";
import type { Database } from "~/server/db";
import {
  financialAccount,
  institution,
  investmentTransaction,
  user,
  userSettings,
} from "~/server/db/schema";
import {
  readableAccount,
  writableBy,
  type AccessScope,
} from "~/server/lib/access";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { preset } from "~/server/lib/preset";
import { confirmedBalanceTransfers } from "~/server/modules/transfers/balance-links";
import { transferFreshnessWarnings } from "~/server/modules/transfers/freshness";
import { latestHoldings, ratesInto } from "./holdings";
import { type Amount, convertAmounts } from "./valuation";

/**
 * Net worth in the display currency: every open account's latest entry, valued at market prices
 * where available. `viewer` is the signed-in person (their settings and SRS top-ups); `scope` is
 * what they are looking at, personal or a workspace.
 */
export async function computeNetWorth(
  db: Database,
  viewer: AccessScope,
  scope: AccessScope,
) {
  const [settingsRows, accounts] = await Promise.all([
    db
      .select({
        displayCurrency: userSettings.displayCurrency,
        countCpfSrs: userSettings.countCpfSrs,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, viewer.userId))
      .limit(1),
    db
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
      .leftJoin(institution, eq(institution.id, financialAccount.institutionId))
      .where(
        and(
          readableAccount(scope, financialAccount.ownerId, financialAccount.id),
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
    db,
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
  const countCpfSrs = !cpfSrsEnabled || (settingsRows[0]?.countCpfSrs ?? true);
  const counted = [
    ...[...allocation.values()].flat(),
    ...banking,
    ...(countCpfSrs ? cpfSrs : []),
  ];
  const { rates, asOf: fxAsOf } = await ratesInto(
    db,
    target,
    [...counted, ...cpfSrs].map((a) => a.currency),
  );

  // SRS top-ups this calendar year, from imported deposits into your own SRS accounts.
  // Transfers between SRS accounts move existing money and do not use up the cap.
  const year = todayIso().slice(0, 4);
  const srsIds = accounts
    .filter((a) => a.type === "srs" && a.ownerId === viewer.userId)
    .map((a) => a.id);
  const [srsTopUps] = srsIds.length
    ? await db
        .select({
          total: sql<string>`coalesce(sum(abs(${investmentTransaction.amount})), 0)::text`,
        })
        .from(investmentTransaction)
        .where(
          and(
            writableBy(viewer, investmentTransaction.ownerId),
            inArray(investmentTransaction.accountId, srsIds),
            eq(investmentTransaction.type, "deposit"),
            eq(investmentTransaction.currency, "SGD"),
            gte(investmentTransaction.tradeDate, `${year}-01-01`),
          ),
        )
    : [];

  const countedEntries = [...holdings].filter(
    ([id]) => countCpfSrs || accountGroupOf(typeOf.get(id)!) !== "cpf_srs",
  );
  const countedHoldings = countedEntries.map(([, h]) => h);
  const dates = countedHoldings.map((h) => h.asOf).sort();
  const transferWarnings = transferFreshnessWarnings(
    await confirmedBalanceTransfers(
      db,
      scope,
      countedEntries.map(([id]) => id),
    ),
    new Map(countedEntries),
  );
  const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
  const held = countedHoldings.flatMap((h) => h.positions);
  const quoted = held.filter((p) => p.quotedAt);
  const quoteTimes = quoted.map((p) => p.quotedAt!.getTime());
  return {
    currency: target,
    fxAsOf,
    ...convertAmounts(counted, target, rates),
    asOf: dates.at(-1) ?? null,
    oldestAsOf: dates[0] ?? null,
    transferWarnings,
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
          oldest: quoteTimes.length ? new Date(Math.min(...quoteTimes)) : null,
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
}

export type NetWorth = Awaited<ReturnType<typeof computeNetWorth>>;
