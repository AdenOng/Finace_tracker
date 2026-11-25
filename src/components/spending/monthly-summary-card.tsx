"use client";

import Decimal from "decimal.js";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useMemo } from "react";

import { AmountsScope, AmountsToggle } from "~/components/finance/privacy";
import { Notice } from "~/components/ui/panel";
import { categoryLabel, useT } from "~/i18n/client";
import { formatMoney } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

type SummaryRow = RouterOutputs["spending"]["summary"][number];

export function CategoryLabel({
  name,
  color,
}: {
  name: string | null;
  color: string | null;
}) {
  const t = useT();
  if (!name)
    return (
      <span className="text-ink-3">
        {t.spending.spendingView.uncategorised}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0"
        style={{ backgroundColor: color ?? "var(--color-ink-3)" }}
      />
      {categoryLabel(t, name)}
    </span>
  );
}

export function MonthlySummaryCard({
  shortMonth,
  data,
  error,
}: {
  shortMonth: string;
  data: SummaryRow[] | undefined;
  error: { message: string } | null;
}) {
  const t = useT();
  const totals = useMemo(() => {
    const byCurrency = new Map<string, { spent: Decimal; received: Decimal }>();
    for (const row of data ?? []) {
      const previous = byCurrency.get(row.currency) ?? {
        spent: new Decimal(0),
        received: new Decimal(0),
      };
      byCurrency.set(row.currency, {
        spent: previous.spent.plus(row.spent),
        received: previous.received.plus(row.received),
      });
    }
    return [...byCurrency];
  }, [data]);

  const spending = (data ?? []).filter((r) => !new Decimal(r.spent).isZero());

  return (
    <AmountsScope
      scope="spending-summary"
      className="card min-w-0 overflow-hidden"
      aria-label={t.spending.spendingView.monthlySummary}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-2 sm:px-6 sm:pt-3">
        <h2 className="text-sm font-semibold">
          {t.spending.spendingView.monthlyOverview}
        </h2>
        <span className="text-ink-3 flex items-center gap-1 text-[11px]">
          {t.spending.spendingView.excludesTransfers}
          <AmountsToggle />
        </span>
      </div>
      {error ? (
        <div className="p-4">
          <Notice tone="error">{error.message}</Notice>
        </div>
      ) : !data ? (
        <div className="m-4 grid grid-cols-2 gap-3">
          <div className="bg-wash h-20 animate-pulse rounded-lg" />
          <div className="bg-wash h-20 animate-pulse rounded-lg" />
        </div>
      ) : totals.length === 0 ? (
        <div className="px-4 py-6 sm:px-6">
          <p className="text-ink-2 text-sm">
            {t.spending.spendingView.freshStart(shortMonth)}
          </p>
          <p className="text-ink-3 mt-1 text-[13px]">
            {t.spending.spendingView.yourIncomeAndSpendingWillAppearHere}
          </p>
        </div>
      ) : (
        <>
          <dl className="divide-line divide-y px-4 sm:px-6">
            {totals.map(([currency, row]) => (
              <div key={currency} className="grid grid-cols-2 gap-4 py-5">
                <div className="min-w-0">
                  <dt className="text-ink-3 flex items-center gap-1.5 text-[12px]">
                    <ArrowUpRight className="size-3.5" />
                    {t.spending.spendingView.moneyOut}
                  </dt>
                  <dd className="font-poster figures mt-2 text-[clamp(20px,5.5vw,32px)] leading-none font-bold break-words">
                    <span className="sensitive">
                      {formatMoney(row.spent.toFixed(), currency)}
                    </span>
                  </dd>
                </div>
                <div className="border-line min-w-0 border-l pl-4">
                  <dt className="text-ink-3 flex items-center gap-1.5 text-[12px]">
                    <ArrowDownLeft className="size-3.5" />
                    {t.spending.spendingView.moneyIn}
                  </dt>
                  <dd className="font-poster figures text-gain mt-2 text-[clamp(20px,5.5vw,32px)] leading-none font-bold break-words">
                    <span className="sensitive">
                      {formatMoney(row.received.toFixed(), currency)}
                    </span>
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          {spending.length > 0 ? (
            <div className="border-line border-t px-4 py-4 sm:px-6">
              <p className="text-ink-3 mb-2 text-[11px] font-medium tracking-wide uppercase">
                {t.spending.spendingView.whereItWent}
              </p>
              <ul className="space-y-3">
                {spending.map((r) => (
                  <li
                    key={`${r.categoryId ?? "none"}-${r.currency}`}
                    className="flex min-w-0 items-center justify-between gap-3 text-[13px]"
                  >
                    <span className="min-w-0 truncate">
                      <CategoryLabel
                        name={r.categoryName}
                        color={r.categoryColor}
                      />
                    </span>
                    <span className="figures sensitive shrink-0 font-mono text-[12px]">
                      {formatMoney(r.spent, r.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </AmountsScope>
  );
}
