import { TRPCError } from "@trpc/server";
import { and, desc, eq, exists, inArray, or, sql } from "drizzle-orm";

import type { CpfBucket } from "~/lib/accounts";
import type { Database } from "~/server/db";
import {
  accountSnapshot,
  cashBalance,
  fxRate,
  position,
  security,
  securityQuote,
} from "~/server/db/schema";
import {
  readableAccount,
  writableBy,
  type AccessScope,
} from "~/server/lib/access";
import { exchangeRates } from "./exchange-rates";
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
  /** `bucket` is the CPF sub-account; null outside CPF. */
  cash: (Amount & { bucket: CpfBucket | null })[];
  /** Valued positions plus cash, per currency. */
  totals: Amount[];
  /** Positions with neither a quote nor a statement price. */
  unpriced: number;
};

/** Legacy blank saves contain no information; an explicit zero cash row is a valid entry. */
export function hasSnapshotEntries(db: Pick<Database, "select">) {
  return or(
    exists(
      db
        .select({ id: position.id })
        .from(position)
        .where(eq(position.snapshotId, accountSnapshot.id)),
    ),
    exists(
      db
        .select({ id: cashBalance.id })
        .from(cashBalance)
        .where(eq(cashBalance.snapshotId, accountSnapshot.id)),
    ),
  );
}

/** Load one owned entry for editing without substituting today's quotes for recorded values. */
export async function snapshotDetails(
  db: Database,
  scope: AccessScope,
  accountId: string,
  snapshotId: string,
) {
  const [snapshot] = await db
    .select({
      id: accountSnapshot.id,
      accountId: accountSnapshot.accountId,
      asOf: accountSnapshot.asOf,
      source: accountSnapshot.source,
      documentId: accountSnapshot.documentId,
      version: sql<string>`${accountSnapshot.updatedAt}::text`,
    })
    .from(accountSnapshot)
    .where(
      and(
        eq(accountSnapshot.id, snapshotId),
        eq(accountSnapshot.accountId, accountId),
        writableBy(scope, accountSnapshot.ownerId),
      ),
    )
    .limit(1);
  if (!snapshot)
    throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
  const [positions, cash] = await Promise.all([
    db
      .select({
        symbol: security.symbol,
        exchange: security.exchange,
        name: security.name,
        assetClass: security.assetClass,
        currency: security.currency,
        quantity: position.quantity,
        averageCost: position.averageCost,
        statementPrice: position.statementPrice,
        statementValue: position.statementValue,
      })
      .from(position)
      .innerJoin(security, eq(security.id, position.securityId))
      .where(eq(position.snapshotId, snapshot.id))
      .orderBy(security.symbol, security.exchange),
    db
      .select({
        currency: cashBalance.currency,
        amount: cashBalance.amount,
        bucket: cashBalance.bucket,
      })
      .from(cashBalance)
      .where(eq(cashBalance.snapshotId, snapshot.id))
      .orderBy(cashBalance.bucket, cashBalance.currency),
  ]);
  return { ...snapshot, positions, cash };
}

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
        hasSnapshotEntries(db),
      ),
    )
    .orderBy(
      accountSnapshot.accountId,
      desc(accountSnapshot.asOf),
      desc(accountSnapshot.createdAt),
      desc(accountSnapshot.id),
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
            bucket: cashBalance.bucket,
          })
          .from(cashBalance)
          .where(inArray(cashBalance.snapshotId, snapshotIds))
          .orderBy(cashBalance.bucket, cashBalance.currency),
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
      const balances = cash
        .filter((c) => c.snapshotId === snapshot.id)
        .map(({ currency, amount, bucket }) => ({ currency, amount, bucket }));
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
  if (others.length === 0) {
    return { rates: new Map<string, string>(), asOf: null };
  }
  const fresh = (await exchangeRates.latest(target)).filter((r) =>
    others.includes(r.quote),
  );
  if (fresh.length > 0) {
    await db.insert(fxRate).values(fresh).onConflictDoNothing();
  }
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
  const latestDates = new Map<string, string>();
  for (const row of rows) {
    const currency = row.base === target ? row.quote : row.base;
    if (row.date > (latestDates.get(currency) ?? "")) {
      latestDates.set(currency, row.date);
    }
  }
  return {
    rates: ratesFromRows(rows, target),
    asOf: [...latestDates.values()].sort().at(0) ?? null,
  };
}
