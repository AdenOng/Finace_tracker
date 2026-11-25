import Decimal from "decimal.js";

import { accountGroupOf } from "~/lib/accounts";
import { formatMoney } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

export const sumDecimals = (values: (string | null)[]) =>
  values.reduce((total, v) => (v ? total.plus(v) : total), new Decimal(0));

export type RankedCategory = {
  id: string;
  name: string;
  spent: Decimal;
};

/**
 * Rolls monthly category spending up to top-level parent categories, sorted largest first,
 * returning the top `limit` entries plus any overflow remainder.
 */
export function rollupOverviewSpending({
  categories,
  spentByCategory,
  translateCategory,
  notCategorisedLabel,
  otherLabel,
  limit = 6,
}: {
  categories: { id: string; parentId: string | null; name: string }[];
  spentByCategory: { categoryId: string | null; spent: string }[];
  translateCategory: (name: string) => string;
  notCategorisedLabel: string;
  otherLabel: string;
  limit?: number;
}) {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId ?? c.id]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = new Map<string, Decimal>();

  for (const row of spentByCategory) {
    if (new Decimal(row.spent).isZero()) continue;
    const root = row.categoryId
      ? (parentOf.get(row.categoryId) ?? row.categoryId)
      : "none";
    byCategory.set(
      root,
      (byCategory.get(root) ?? new Decimal(0)).plus(row.spent),
    );
  }

  const ranked: RankedCategory[] = [...byCategory]
    .map(([id, spent]) => ({
      id,
      name:
        id === "none"
          ? notCategorisedLabel
          : (() => {
              const raw = nameOf.get(id);
              return raw ? translateCategory(raw) : otherLabel;
            })(),
      spent,
    }))
    .sort((a, b) => b.spent.comparedTo(a.spent));

  const shown = ranked.slice(0, limit);
  const rest = sumDecimals(ranked.slice(limit).map((r) => r.spent.toFixed(4)));
  const largest = shown[0]?.spent ?? new Decimal(1);

  return { shown, rest, largest };
}

type NetWorth = RouterOutputs["portfolio"]["netWorth"];

export function rollupOverviewHoldings(worth: NetWorth) {
  const currency = worth.currency;
  // Investments: valued from holdings, split by asset class.
  const investing = worth.accounts.filter(
    (a) => accountGroupOf(a.type) === "investments",
  );
  const banking = worth.accounts.filter(
    (a) => accountGroupOf(a.type) === "banking",
  );
  const forLater = worth.accounts.filter(
    (a) => accountGroupOf(a.type) === "cpf_srs",
  );
  const forLaterTotal = new Decimal(worth.cpfSrs.total ?? 0);
  const investTotal = sumDecimals(worth.allocation.map((a) => a.total));
  const investmentIncomplete = investing.some(
    (a) => a.unconverted.length > 0 || a.unpriced > 0,
  );
  const positive = worth.allocation.filter(
    (a) => a.total && new Decimal(a.total).isPositive(),
  );
  const positiveSum = sumDecimals(positive.map((a) => a.total));
  const slices = positive.map((a) => ({
    assetClass: a.assetClass,
    share: positiveSum.isZero()
      ? 0
      : new Decimal(a.total!).div(positiveSum).times(100).toNumber(),
    display: formatMoney(a.total!, currency),
  }));

  // Bank and cards: cash held less what the cards owe.
  const bankTotal = new Decimal(worth.banking.total ?? 0);
  const owed = sumDecimals(
    banking.map((a) =>
      a.total && new Decimal(a.total).isNegative() ? a.total : null,
    ),
  ).abs();

  return {
    investing,
    banking,
    forLater,
    forLaterTotal,
    investTotal,
    investmentIncomplete,
    slices,
    bankTotal,
    owed,
  };
}
