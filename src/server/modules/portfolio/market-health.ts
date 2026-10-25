import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  max,
  min,
  or,
  sql,
} from "drizzle-orm";

import { todayIso } from "~/lib/dates";
import type { Database } from "~/server/db";
import {
  accountSnapshot,
  financialAccount,
  fxRate,
  networthSnapshot,
  position,
  priceHistory,
  security,
  securityQuote,
  userSettings,
  workspace,
} from "~/server/db/schema";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { exchangeRates } from "./exchange-rates";
import { backfillFrom, usableClose } from "./history";
import { hasSnapshotEntries } from "./holdings";
import { quotes, yahooSymbol } from "./quotes";

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

const listingColumns = {
  id: security.id,
  symbol: security.symbol,
  exchange: security.exchange,
  assetClass: security.assetClass,
  currency: security.currency,
  providerSymbols: security.providerSymbols,
};

/** Securities in the latest entry of each open account: the ones valuations actually use. */
function heldSecurities(db: Database) {
  const latest = db
    .selectDistinctOn([accountSnapshot.accountId], { id: accountSnapshot.id })
    .from(accountSnapshot)
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, accountSnapshot.accountId),
    )
    .where(and(isNull(financialAccount.archivedAt), hasSnapshotEntries(db)))
    .orderBy(
      accountSnapshot.accountId,
      desc(accountSnapshot.asOf),
      desc(accountSnapshot.createdAt),
      desc(accountSnapshot.id),
    )
    .as("latest");
  return db
    .selectDistinct(listingColumns)
    .from(position)
    .innerJoin(latest, eq(latest.id, position.snapshotId))
    .innerJoin(security, eq(security.id, position.securityId));
}

/**
 * Fetches the latest price of held securities (or just `securityIds`) and stores it with the day's
 * close. A share quote is only kept when it is in the currency the holding was recorded in, so a
 * ticker that resolves to a different listing cannot silently revalue a position.
 */
export async function refreshQuotes(
  db: Database,
  options: { securityIds?: string[]; force?: boolean } = {},
) {
  const result = {
    enabled: cachedInstanceSettings().priceQuotes,
    checked: 0,
    updated: 0,
    unsupported: [] as string[],
    failed: [] as string[],
    mismatched: [] as string[],
  };
  if (!result.enabled) return result;
  const listings = options.securityIds
    ? options.securityIds.length
      ? await db
          .select(listingColumns)
          .from(security)
          .where(inArray(security.id, options.securityIds))
      : []
    : await heldSecurities(db);
  const queue = [...listings];
  const worker = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) {
      const label = l.exchange ? `${l.symbol} ${l.exchange}` : l.symbol;
      const symbol = yahooSymbol(l);
      if (!symbol) {
        result.unsupported.push(label);
        continue;
      }
      result.checked++;
      const quote = await quotes.quote(symbol, { force: options.force });
      if (!quote) {
        result.failed.push(label);
        continue;
      }
      if (quote.currency !== l.currency && l.assetClass !== "crypto") {
        result.mismatched.push(label);
        continue;
      }
      await db
        .insert(securityQuote)
        .values({
          securityId: l.id,
          price: quote.price,
          previousClose: quote.previousClose,
          currency: quote.currency,
          source: quote.source,
          quotedAt: quote.quotedAt,
        })
        .onConflictDoUpdate({
          target: securityQuote.securityId,
          set: {
            price: sql`excluded.price`,
            previousClose: sql`excluded.previous_close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
            quotedAt: sql`excluded.quoted_at`,
          },
          // A late or cached response never replaces a newer quote.
          setWhere: sql`${securityQuote.quotedAt} <= excluded.quoted_at`,
        });
      // Refreshed during the session, so the last refresh of the day leaves the close.
      await db
        .insert(priceHistory)
        .values({
          securityId: l.id,
          date: quote.date,
          close: quote.price,
          currency: quote.currency,
          source: quote.source,
        })
        .onConflictDoUpdate({
          target: [priceHistory.securityId, priceHistory.date],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
          },
        });
      result.updated++;
    }
  };
  // A few requests at a time keeps a large catalogue quick without hammering the provider.
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const list of [result.unsupported, result.failed, result.mismatched])
    list.sort();
  return result;
}

const shiftDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Longer than any market holiday, such as a week-long Lunar New Year close. */
const MAX_GAP_DAYS = 14;

/** Whether `dates` (oldest first) cover [from, until] with no gap longer than a market holiday. */
export function coversRange(dates: string[], from: string, until: string) {
  const inRange = dates.filter((d) => d >= from && d <= until);
  if (inRange.length === 0) return false;
  let previous = from;
  for (const date of [...inRange, until]) {
    if (date > shiftDays(previous, MAX_GAP_DAYS)) return false;
    previous = date;
  }
  return true;
}

/**
 * Stores past daily closes for every security in someone's entries, from a year before their
 * first entry until their first recorded day, so the net worth chart can follow the market
 * before the app recorded it. Days already stored are kept; securities whose stored closes
 * already cover that range are skipped.
 */
export async function backfillPriceHistory(
  db: Database,
  options: { ownerId?: string } = {},
) {
  const result = { checked: 0, stored: 0, failed: [] as string[] };
  if (!cachedInstanceSettings().priceQuotes) return result;
  const owned = options.ownerId
    ? eq(accountSnapshot.ownerId, options.ownerId)
    : undefined;
  const today = todayIso();
  const firsts = db
    .select({
      ownerId: accountSnapshot.ownerId,
      first: min(accountSnapshot.asOf).as("first"),
      // Recorded days need no estimate, so closes are needed until the first of them.
      until:
        sql<string>`coalesce((select min(${networthSnapshot.date}) from ${networthSnapshot} where ${networthSnapshot.ownerId} = ${accountSnapshot.ownerId}), ${today}::date)`.as(
          "until",
        ),
    })
    .from(accountSnapshot)
    .where(and(owned, hasSnapshotEntries(db)))
    .groupBy(accountSnapshot.ownerId)
    .as("firsts");
  const listings = await db
    .select({
      ...listingColumns,
      first: min(firsts.first),
      until: sql<string>`max(${firsts.until})::text`,
    })
    .from(position)
    .innerJoin(accountSnapshot, eq(accountSnapshot.id, position.snapshotId))
    .innerJoin(
      financialAccount,
      eq(financialAccount.id, accountSnapshot.accountId),
    )
    .innerJoin(firsts, eq(firsts.ownerId, accountSnapshot.ownerId))
    .innerJoin(security, eq(security.id, position.securityId))
    .where(and(owned, isNull(financialAccount.archivedAt)))
    .groupBy(security.id);

  const candidates = listings.flatMap((l) => {
    const symbol = yahooSymbol(l);
    return l.first && symbol
      ? [{ ...l, symbol, from: backfillFrom(l.first) }]
      : [];
  });
  const stored = new Map<string, string[]>();
  if (candidates.length) {
    // Only closes the chart can use count; unusable ones are what a fetch replaces.
    const rows = await db
      .select({ securityId: priceHistory.securityId, date: priceHistory.date })
      .from(priceHistory)
      .innerJoin(security, eq(security.id, priceHistory.securityId))
      .where(
        and(
          inArray(
            priceHistory.securityId,
            candidates.map((c) => c.id),
          ),
          gte(priceHistory.date, candidates.map((c) => c.from).sort()[0]!),
          usableClose(),
        ),
      )
      .orderBy(asc(priceHistory.date));
    for (const { securityId, date } of rows)
      stored.set(securityId, [...(stored.get(securityId) ?? []), date]);
  }
  const queue = candidates.filter(
    (c) => !coversRange(stored.get(c.id) ?? [], c.from, c.until),
  );
  const worker = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) {
      result.checked++;
      const history = await quotes.closes(l.symbol, l.from);
      // As with live quotes, a share priced in another currency is a different listing.
      if (
        !history ||
        (history.currency !== l.currency && l.assetClass !== "crypto")
      ) {
        result.failed.push(l.exchange ? `${l.symbol} ${l.exchange}` : l.symbol);
        continue;
      }
      if (history.closes.length === 0) continue;
      const inserted = await db
        .insert(priceHistory)
        .values(
          history.closes.map((c) => ({
            securityId: l.id,
            date: c.date,
            close: c.close,
            currency: history.currency,
            source: history.source,
          })),
        )
        // Stored days are kept, except ones saved before their currency was: those get this
        // close with its currency, so a coin's legacy USD close becomes usable.
        .onConflictDoUpdate({
          target: [priceHistory.securityId, priceHistory.date],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
          },
          setWhere: isNull(priceHistory.currency),
        })
        .returning({ date: priceHistory.date });
      result.stored += inserted.length;
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  result.failed.sort();
  return result;
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
  // Rows left behind by corrected typos are no one's holding; leave them out.
  const held = exists(
    db
      .select({ id: position.id })
      .from(position)
      .where(eq(position.securityId, security.id)),
  );
  const [quotes] = await db
    .select({
      securities: count(security.id),
      quoted: count(securityQuote.securityId),
      newest: max(securityQuote.quotedAt),
      oldest: min(securityQuote.quotedAt),
    })
    .from(security)
    .leftJoin(securityQuote, eq(securityQuote.securityId, security.id))
    .where(held);
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
    .where(and(isNull(securityQuote.securityId), held))
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
    priceQuotes: cachedInstanceSettings().priceQuotes,
    fx,
    fxSource: latestFx?.source ?? null,
    accountCurrencies: accountCurrencies.map((r) => r.code).sort(),
    quotes: quotes ?? { securities: 0, quoted: 0, newest: null, oldest: null },
    unquoted,
    priceHistoryLatest: history?.latest ?? null,
  };
}
