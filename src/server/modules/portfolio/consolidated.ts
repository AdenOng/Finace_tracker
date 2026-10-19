import Decimal from "decimal.js";

import type { AccountType } from "~/lib/accounts";
import type { Holdings } from "./holdings";
import {
  type Amount,
  convertAmounts,
  multiply,
  sumByCurrency,
} from "./valuation";

export type PortfolioBroker = {
  id: string;
  name: string;
  type: AccountType;
  institutionName: string | null;
  institutionKey: string | null;
};

/** Value less cost, in the display currency; null when either side is missing or unconverted. */
function gainOf(
  value: { total: string | null; unconverted: Amount[] },
  cost: { total: string | null; unconverted: Amount[] } | null,
) {
  if (
    !cost?.total ||
    value.total === null ||
    value.unconverted.length > 0 ||
    cost.unconverted.length > 0
  )
    return null;
  const gain = new Decimal(value.total).minus(cost.total);
  const base = new Decimal(cost.total);
  return {
    cost: cost.total,
    amount: gain.toFixed(),
    percent: base.isZero() ? null : gain.div(base).times(100).toFixed(1),
  };
}

/** Group the same instrument across brokers, using only each account's current dated entry. */
export function consolidateHoldings(
  accounts: PortfolioBroker[],
  holdings: ReadonlyMap<string, Holdings>,
  currency: string,
  rates: ReadonlyMap<string, string>,
  accountId?: string,
) {
  const brokers = accounts.map((account) => {
    const h = holdings.get(account.id);
    return {
      ...account,
      asOf: h?.asOf ?? null,
      source: h?.source ?? null,
      unpriced: h?.unpriced ?? 0,
      ...convertAmounts(h?.totals ?? [], currency, rates),
    };
  });
  const selected = brokers.filter((b) => !accountId || b.id === accountId);
  type Holding = Holdings["positions"][number];
  type Lot = {
    accountId: string;
    accountName: string;
    accountType: AccountType;
    asOf: string;
    source: Holdings["source"];
    quantity: string;
    quotedAt: Date | null;
    nativeValue: Amount | null;
    /** Quantity × average cost, in the instrument's currency. */
    nativeCost: Amount | null;
    total: string | null;
    unconverted: Amount[];
  };
  const grouped = new Map<string, { instrument: Holding; lots: Lot[] }>();
  const cashRows = new Map<
    string,
    { accountId: string; accountName: string; asOf: string; amount: string }[]
  >();
  for (const broker of selected) {
    const h = holdings.get(broker.id);
    if (!h) continue;
    for (const p of h.positions) {
      const group = grouped.get(p.securityId) ?? { instrument: p, lots: [] };
      group.lots.push({
        accountId: broker.id,
        accountName: broker.name,
        accountType: broker.type,
        asOf: h.asOf,
        source: h.source,
        quantity: p.quantity,
        quotedAt: p.quotedAt,
        nativeValue: p.value,
        nativeCost: p.averageCost
          ? {
              currency: p.currency,
              amount: multiply(p.quantity, p.averageCost),
            }
          : null,
        ...convertAmounts(p.value ? [p.value] : [], currency, rates),
      });
      grouped.set(p.securityId, group);
    }
    for (const cash of h.cash) {
      const rows = cashRows.get(cash.currency) ?? [];
      rows.push({
        accountId: broker.id,
        accountName: broker.name,
        asOf: h.asOf,
        amount: cash.amount,
      });
      cashRows.set(cash.currency, rows);
    }
  }
  const positionAmounts = [...grouped.values()].flatMap((g) =>
    g.lots.flatMap((lot) => (lot.nativeValue ? [lot.nativeValue] : [])),
  );
  const cashAmounts = [...cashRows].flatMap(([code, rows]) =>
    rows.map((r) => ({ currency: code, amount: r.amount })),
  );
  const securities = convertAmounts(positionAmounts, currency, rates);
  const cash = convertAmounts(cashAmounts, currency, rates);
  // A recorded entry with no securities or no cash has a known zero for that category.
  if (selected.some((b) => b.asOf)) {
    if (grouped.size === 0) securities.total = "0";
    if (cashRows.size === 0) cash.total = "0";
  }
  const total = convertAmounts(
    [...positionAmounts, ...cashAmounts],
    currency,
    rates,
  );
  const unpriced = selected.reduce((n, b) => n + b.unpriced, 0);
  const unrecorded = selected.filter((b) => !b.asOf).length;
  // An account with nothing recorded adds nothing; only missing prices and rates leave a gap.
  const incomplete = unpriced > 0 || total.unconverted.length > 0;
  const positions = [...grouped]
    .map(([securityId, { instrument: p, lots }]) => {
      const value = convertAmounts(
        lots.flatMap((lot) => (lot.nativeValue ? [lot.nativeValue] : [])),
        currency,
        rates,
      );
      const costs = lots.flatMap((lot) =>
        lot.nativeCost ? [lot.nativeCost] : [],
      );
      // A gain needs every lot's cost and value; a missing price would read as a loss.
      const gain = lots.every((lot) => lot.nativeValue && lot.nativeCost)
        ? gainOf(value, convertAmounts(costs, currency, rates))
        : null;
      return {
        securityId,
        symbol: p.symbol,
        exchange: p.exchange,
        name: p.name,
        assetClass: p.assetClass,
        currency: p.currency,
        quantity: lots
          .reduce((sum, lot) => sum.plus(lot.quantity), new Decimal(0))
          .toFixed(),
        ...value,
        nativeValues: sumByCurrency(
          lots.flatMap((lot) => (lot.nativeValue ? [lot.nativeValue] : [])),
        ),
        unpriced: lots.filter((lot) => !lot.nativeValue).length,
        gain,
        inSrs: lots.some((lot) => lot.accountType === "srs"),
        weight:
          !incomplete &&
          total.total &&
          new Decimal(total.total).gt(0) &&
          value.total !== null
            ? new Decimal(value.total).div(total.total).times(100).toFixed(1)
            : null,
        brokers: lots,
      };
    })
    .sort(
      (a, b) =>
        new Decimal(b.total ?? 0).comparedTo(a.total ?? 0) ||
        a.symbol.localeCompare(b.symbol) ||
        a.exchange.localeCompare(b.exchange),
    );
  const dates = selected.flatMap((b) => (b.asOf ? [b.asOf] : [])).sort();
  // Gain across the holdings that have a cost; the rest are counted separately.
  const withGain = positions.filter((p) => p.gain);
  const gainCost = withGain.reduce(
    (sum, p) => sum.plus(p.gain!.cost),
    new Decimal(0),
  );
  const gainAmount = withGain.reduce(
    (sum, p) => sum.plus(p.gain!.amount),
    new Decimal(0),
  );
  const srsHoldings = selected.filter((b) => b.type === "srs");
  return {
    currency,
    brokers,
    selectedBrokerCount: selected.length,
    ...total,
    securities,
    cash,
    positions,
    gain: withGain.length
      ? {
          amount: gainAmount.toFixed(),
          percent: gainCost.isZero()
            ? null
            : gainAmount.div(gainCost).times(100).toFixed(1),
          holdings: withGain.length,
        }
      : null,
    srs: srsHoldings.length
      ? convertAmounts(
          srsHoldings.flatMap((b) => holdings.get(b.id)?.totals ?? []),
          currency,
          rates,
        )
      : null,
    unpriced,
    unrecorded,
    incomplete,
    oldestEntry: dates.at(0) ?? null,
    newestEntry: dates.at(-1) ?? null,
    cashBalances: [...cashRows]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, rows]) => {
        const amounts = rows.map((r) => ({ currency: code, amount: r.amount }));
        return {
          currency: code,
          amount: sumByCurrency(amounts)[0]!.amount,
          ...convertAmounts(amounts, currency, rates),
          brokers: rows,
        };
      }),
  };
}
