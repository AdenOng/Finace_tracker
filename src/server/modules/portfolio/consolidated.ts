import Decimal from "decimal.js";

import type { Holdings } from "./holdings";
import { type Amount, convertAmounts, sumByCurrency } from "./valuation";

export type PortfolioBroker = {
  id: string;
  name: string;
  institutionName: string | null;
  institutionKey: string | null;
};

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
    asOf: string;
    source: Holdings["source"];
    quantity: string;
    quotedAt: Date | null;
    nativeValue: Amount | null;
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
        asOf: h.asOf,
        source: h.source,
        quantity: p.quantity,
        quotedAt: p.quotedAt,
        nativeValue: p.value,
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
  const incomplete =
    unpriced > 0 || unrecorded > 0 || total.unconverted.length > 0;
  const positions = [...grouped]
    .map(([securityId, { instrument: p, lots }]) => {
      const value = convertAmounts(
        lots.flatMap((lot) => (lot.nativeValue ? [lot.nativeValue] : [])),
        currency,
        rates,
      );
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
  return {
    currency,
    brokers,
    selectedBrokerCount: selected.length,
    ...total,
    securities,
    cash,
    positions,
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
