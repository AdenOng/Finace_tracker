import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  isNull,
  max,
  min,
  or,
  sql,
} from "drizzle-orm";

import type { Database } from "~/server/db";
import {
  financialAccount,
  fxRate,
  priceHistory,
  security,
  securityQuote,
  userSettings,
  workspace,
} from "~/server/db/schema";
import { exchangeRates } from "./exchange-rates";

/** Currencies people view totals in; rates are only ever fetched for these. */
async function displayCurrencies(db: Pick<Database, "selectDistinct">) {
  const [users, workspaces] = await Promise.all([
    db
      .selectDistinct({ code: userSettings.displayCurrency })
      .from(userSettings),
    db.selectDistinct({ code: workspace.displayCurrency }).from(workspace),
  ]);
  return [...new Set([...users, ...workspaces].map((r) => r.code))].sort();
}

/** Fetches today's reference rates for every display currency in use and stores them. */
export async function refreshExchangeRates(
  db: Pick<Database, "selectDistinct" | "insert">,
  options: { force?: boolean } = {},
) {
  const targets = await displayCurrencies(db);
  let stored = 0;
  const failed: string[] = [];
  for (const target of targets) {
    const rows = await exchangeRates.latest(target, options);
    if (rows.length === 0) {
      failed.push(target);
      continue;
    }
    const inserted = await db
      .insert(fxRate)
      .values(rows)
      .onConflictDoNothing()
      .returning({ date: fxRate.date });
    stored += inserted.length;
  }
  return { currencies: targets, stored, failed };
}

/**
 * How fresh the data behind valuations is: exchange rates per display currency, and which
 * securities have no quote (they fall back to the price on their last statement).
 */
export async function marketHealth(db: Database) {
  const targets = await displayCurrencies(db);
  const fx = await Promise.all(
    targets.map(async (code) => {
      const [row] = await db
        .select({ latest: max(fxRate.date), pairs: count() })
        .from(fxRate)
        .where(or(eq(fxRate.base, code), eq(fxRate.quote, code)));
      return {
        currency: code,
        latest: row?.latest ?? null,
        pairs: row?.pairs ?? 0,
      };
    }),
  );
  const accountCurrencies = await db
    .selectDistinct({ code: financialAccount.currency })
    .from(financialAccount)
    .where(isNull(financialAccount.archivedAt));
  const [quotes] = await db
    .select({
      securities: count(security.id),
      quoted: count(securityQuote.securityId),
      newest: max(securityQuote.quotedAt),
      oldest: min(securityQuote.quotedAt),
    })
    .from(security)
    .leftJoin(securityQuote, eq(securityQuote.securityId, security.id));
  const unquoted = await db
    .select({
      id: security.id,
      symbol: security.symbol,
      exchange: security.exchange,
      name: security.name,
      lastClose: sql<
        string | null
      >`(select max(${priceHistory.date}) from ${priceHistory} where ${priceHistory.securityId} = ${security.id})`,
    })
    .from(security)
    .leftJoin(securityQuote, eq(securityQuote.securityId, security.id))
    .where(and(isNull(securityQuote.securityId)))
    .orderBy(asc(security.symbol))
    .limit(50);
  const [history] = await db
    .select({ latest: max(priceHistory.date) })
    .from(priceHistory);
  const [latestFx] = await db
    .select({ date: fxRate.date, source: fxRate.source })
    .from(fxRate)
    .orderBy(desc(fxRate.date))
    .limit(1);
  return {
    fx,
    fxSource: latestFx?.source ?? null,
    accountCurrencies: accountCurrencies.map((r) => r.code).sort(),
    quotes: quotes ?? { securities: 0, quoted: 0, newest: null, oldest: null },
    unquoted,
    priceHistoryLatest: history?.latest ?? null,
  };
}
