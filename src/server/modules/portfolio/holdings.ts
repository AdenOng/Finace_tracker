import { and, desc, eq, inArray, or } from "drizzle-orm";

import type { Database } from "~/server/db";
import {
  accountSnapshot,
  cashBalance,
  fxRate,
  position,
  security,
  securityQuote,
} from "~/server/db/schema";
import { readableAccount, type AccessScope } from "~/server/lib/access";
import {
  type Amount,
  ratesFromRows,
  sumByCurrency,
  valuePosition,
} from "./valuation";

export type Holdings = {
  snapshotId: string;
  asOf: string;
  source: (typeof accountSnapshot.$inferSelect)["source"];
  positions: {
    id: string;
    securityId: string;
    symbol: string;
    exchange: string;
    name: string | null;
    assetClass: (typeof security.$inferSelect)["assetClass"];
    currency: string;
    quantity: string;
    averageCost: string | null;
    statementPrice: string | null;
    statementValue: string | null;
    quotedAt: Date | null;
    value: Amount | null;
  }[];
  cash: Amount[];
  /** Valued positions plus cash, per currency. */
  totals: Amount[];
  /** Positions with neither a quote nor a statement price. */
  unpriced: number;
};

/**
 * Loads the most recent snapshot (positions + cash) of each given account and values it.
 * Accounts without a snapshot are absent from the returned map.
 */
export async function latestHoldings(
  db: Database,
  scope: AccessScope,
  accountIds: string[],
): Promise<Map<string, Holdings>> {
  if (accountIds.length === 0) return new Map();

  const snapshots = await db
    .selectDistinctOn([accountSnapshot.accountId], {
      id: accountSnapshot.id,
      accountId: accountSnapshot.accountId,
      asOf: accountSnapshot.asOf,
      source: accountSnapshot.source,
    })
    .from(accountSnapshot)
    .where(
      and(
        readableAccount(
          scope,
          accountSnapshot.ownerId,
          accountSnapshot.accountId,
        ),
        inArray(accountSnapshot.accountId, accountIds),
      ),
    )
    .orderBy(
      accountSnapshot.accountId,
      desc(accountSnapshot.asOf),
      desc(accountSnapshot.createdAt),
    );

  const snapshotIds = snapshots.map((s) => s.id);
  const [positions, cash] = snapshotIds.length
    ? await Promise.all([
        db
          .select({
            id: position.id,
            snapshotId: position.snapshotId,
            securityId: security.id,
            symbol: security.symbol,
            exchange: security.exchange,
            name: security.name,
            assetClass: security.assetClass,
            currency: security.currency,
            quantity: position.quantity,
            averageCost: position.averageCost,
            statementPrice: position.statementPrice,
            statementValue: position.statementValue,
            quotePrice: securityQuote.price,
            quoteCurrency: securityQuote.currency,
            quotedAt: securityQuote.quotedAt,
          })
          .from(position)
          .innerJoin(security, eq(security.id, position.securityId))
          .leftJoin(securityQuote, eq(securityQuote.securityId, security.id))
          .where(inArray(position.snapshotId, snapshotIds))
          .orderBy(security.symbol),
        db
          .select({
            snapshotId: cashBalance.snapshotId,
            currency: cashBalance.currency,
            amount: cashBalance.amount,
          })
          .from(cashBalance)
          .where(inArray(cashBalance.snapshotId, snapshotIds))
          .orderBy(cashBalance.currency),
      ])
    : [[], []];

  return new Map(
    snapshots.map((snapshot) => {
      const rows: Holdings["positions"] = positions
        .filter((p) => p.snapshotId === snapshot.id)
        .map(({ quotePrice, quoteCurrency, snapshotId: _, ...p }) => ({
          ...p,
          value: valuePosition({
            ...p,
            quote:
              quotePrice && quoteCurrency
                ? { price: quotePrice, currency: quoteCurrency }
                : null,
          }),
        }));
      const balances: Amount[] = cash
        .filter((c) => c.snapshotId === snapshot.id)
        .map(({ currency, amount }) => ({ currency, amount }));
      const valued = rows.flatMap((p) => (p.value ? [p.value] : []));
      return [
        snapshot.accountId,
        {
          snapshotId: snapshot.id,
          asOf: snapshot.asOf,
          source: snapshot.source,
          positions: rows,
          cash: balances,
          totals: sumByCurrency([...valued, ...balances]),
          unpriced: rows.length - valued.length,
        },
      ] as const;
    }),
  );
}

/** Latest known rate from each currency into `target` (stored in either direction). */
export async function ratesInto(
  db: Database,
  target: string,
  currencies: Iterable<string>,
) {
  const others = [...new Set(currencies)].filter((c) => c !== target);
  if (others.length === 0) return new Map<string, string>();
  const rows = await db
    .selectDistinctOn([fxRate.base, fxRate.quote], {
      date: fxRate.date,
      base: fxRate.base,
      quote: fxRate.quote,
      rate: fxRate.rate,
    })
    .from(fxRate)
    .where(
      or(
        and(inArray(fxRate.base, others), eq(fxRate.quote, target)),
        and(eq(fxRate.base, target), inArray(fxRate.quote, others)),
      ),
    )
    .orderBy(fxRate.base, fxRate.quote, desc(fxRate.date));
  return ratesFromRows(rows, target);
}
