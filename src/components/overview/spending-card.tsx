import type Decimal from "decimal.js";
import Link from "next/link";

import { AmountsScope } from "~/components/finance/privacy";
import { AccountRow } from "~/components/overview/account-row";
import { SheetHeader } from "~/components/overview/sheet-header";
import type { Locale } from "~/i18n/config";
import type { CommonMessages } from "~/i18n/messages";
import { cn } from "~/lib/cn";
import { shiftMonth } from "~/lib/dates";
import { formatMoney, formatMonth } from "~/lib/format";
import type { RankedCategory } from "~/server/modules/portfolio/overview";
import type { RouterOutputs } from "~/trpc/react";

type WorthAccount = RouterOutputs["portfolio"]["netWorth"]["accounts"][number];

const link =
  "font-semibold underline decoration-current/30 underline-offset-4 hover:decoration-current";

export function OverviewSpendingCard({
  t,
  locale,
  month,
  currency,
  moneyIn,
  moneyOut,
  lastOut,
  shown,
  rest,
  largest,
  otherCurrencies,
  bankTotal,
  banking,
}: {
  t: CommonMessages;
  locale: Locale;
  month: string;
  currency: string;
  moneyIn: Decimal;
  moneyOut: Decimal;
  lastOut: Decimal;
  shown: RankedCategory[];
  rest: Decimal;
  largest: Decimal;
  otherCurrencies: string[];
  bankTotal: Decimal;
  banking: WorthAccount[];
}) {
  const drillDownHref = (id: string) => {
    const params = new URLSearchParams({ month });
    if (id === "none") params.set("uncategorised", "1");
    else if (id !== "rest") params.set("category", id);
    return `/spending?${params.toString()}`;
  };

  return (
    <AmountsScope
      scope="overview-spending"
      id="banking"
      className="card min-w-0 scroll-mt-6 p-5 sm:p-8"
    >
      <SheetHeader
        eyebrow={t.overview.page.spendingMonth(formatMonth(month, locale))}
        title={formatMoney(moneyOut.toFixed(2), currency)}
        href={`/spending?month=${month}`}
        linkLabel={t.overview.page.transactions}
      />
      <dl className="mt-5 grid grid-cols-3 gap-4">
        {[
          {
            label: t.overview.page.moneyIn,
            value: moneyIn,
            tone: "text-gain",
          },
          {
            label: t.overview.page.moneyOut,
            value: moneyOut,
            tone: "text-loss",
          },
          {
            label: t.overview.page.leftOver,
            value: moneyIn.minus(moneyOut),
            tone: undefined,
          },
        ].map((f) => (
          <div key={f.label}>
            <dt className="eyebrow">{f.label}</dt>
            <dd
              className={cn(
                "figures mt-1 font-mono text-[15px] font-semibold",
                f.tone,
              )}
            >
              <span className="sensitive">
                {formatMoney(f.value.toFixed(2), currency)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {lastOut.isZero() ? null : (
        <p className="text-ink-3 mt-2 text-[12px]">
          <span className="sensitive">
            {formatMoney(moneyOut.minus(lastOut).abs().toFixed(2), currency)}
          </span>{" "}
          {t.overview.page.comparison(
            moneyOut.lessThan(lastOut),
            formatMonth(shiftMonth(month, -1), locale),
          )}
        </p>
      )}

      {shown.length > 0 ? (
        <div className="mt-6">
          <p className="eyebrow">{t.overview.page.whereItWent}</p>
          <ul className="mt-2 space-y-1">
            {[
              ...shown,
              ...(rest.isZero()
                ? []
                : [
                    {
                      id: "rest",
                      name: t.overview.page.everythingElse,
                      spent: rest,
                    },
                  ]),
            ].map((c) => (
              <li key={c.id}>
                <Link
                  href={drillDownHref(c.id)}
                  className="hover:bg-wash group -mx-2 grid grid-cols-[8rem_1fr_auto] items-center gap-3 rounded-[6px] px-2 py-1 text-[13px] transition-colors"
                >
                  <span className="truncate group-hover:underline group-hover:underline-offset-4">
                    {c.name}
                  </span>
                  <span className="bg-wash h-2.5 overflow-hidden rounded-r-[4px]">
                    <span
                      className="bg-ink/80 group-hover:bg-art-cobalt block h-full rounded-r-[4px] transition-colors"
                      style={{
                        width: `${c.spent.div(largest).times(100).toFixed(1)}%`,
                      }}
                      title={c.name}
                    />
                  </span>
                  <span className="figures w-24 text-right font-mono text-[12px]">
                    <span className="sensitive">
                      {formatMoney(c.spent.toFixed(2), currency)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-ink-2 mt-6 text-sm">
          {t.overview.page.noSpending(formatMonth(month, locale))}
        </p>
      )}
      {otherCurrencies.length > 0 ? (
        <p className="text-ink-3 mt-2 text-[12px]">
          {t.overview.page.excludedSpending(otherCurrencies.join(", "))}
        </p>
      ) : null}

      <div className="border-ink/80 mt-8 flex items-baseline justify-between border-b-2 pb-2">
        <p className="eyebrow">{t.common.accountGroups.banking}</p>
        <p className="figures font-mono text-[13px] font-semibold">
          <span className="sensitive">
            {formatMoney(bankTotal.toFixed(2), currency)}
          </span>
        </p>
      </div>
      {banking.length === 0 ? (
        <p className="text-ink-2 mt-4 text-sm">
          {t.overview.page.savingsCurrentAndCreditCardAccountsCarryA}{" "}
          <Link href="/accounts?add=banking" className={link}>
            {t.overview.page.addOne}
          </Link>
          {t.overview.sentenceEnd}
        </p>
      ) : (
        <ul className="mt-2">
          {banking.map((a) => (
            <AccountRow key={a.id} account={a} currency={currency} />
          ))}
        </ul>
      )}
    </AmountsScope>
  );
}
