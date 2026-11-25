import Decimal from "decimal.js";
import { Suspense } from "react";
import { AmountsScope, AmountsToggle } from "~/components/finance/privacy";
import { HeroFigure } from "~/components/overview/hero-figure";
import { NetWorthChart } from "~/components/overview/net-worth-chart";
import { PortfolioSettings } from "~/components/overview/portfolio-settings";
import { PriceRefresh } from "~/components/overview/price-refresh";
import { TransferFreshnessNotices } from "~/components/overview/transfer-freshness-notices";
import { cardTools } from "~/components/ui/card-tools";
import { cn } from "~/lib/cn";
import { formatDate, formatMoney, formatRelative } from "~/lib/format";
import type { netWorthSeries } from "~/lib/net-worth-series";
import type { CommonMessages } from "~/i18n/messages";
import type { Locale } from "~/i18n/config";
import type { RouterOutputs } from "~/trpc/react";
import type { rollupOverviewHoldings } from "~/server/modules/portfolio/overview";

export function NetWorthCard({
  worth,
  holdings,
  chartSeries,
  historyCurrency,
  firstName,
  t,
  locale,
}: {
  worth: RouterOutputs["portfolio"]["netWorth"];
  holdings: ReturnType<typeof rollupOverviewHoldings>;
  chartSeries: ReturnType<typeof netWorthSeries>;
  historyCurrency: string;
  firstName: string | undefined;
  t: CommonMessages;
  locale: Locale;
}) {
  const {
    investing,
    banking,
    forLater,
    forLaterTotal,
    investTotal,
    bankTotal,
    owed,
  } = holdings;
  const currency = worth.currency;
  const recorded = worth.asOf !== null;
  // Only shown when every move converts; a partial figure would misstate the day.
  const change = worth.prices?.change;
  const priceChange =
    change?.total && change.unconverted.length === 0
      ? new Decimal(change.total)
      : null;
  const share = (part: Decimal) =>
    worth.total && !new Decimal(worth.total).isZero()
      ? `${part.div(worth.total).times(100).toFixed(0)}%`
      : "—";

  return (
    <AmountsScope
      scope="overview-net-worth"
      className="card relative overflow-hidden"
    >
      <div className="ink-strip h-1.5" />
      <div className="p-5 sm:p-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="eyebrow">{t.overview.page.netWorthName(firstName)}</h1>
          <div className={cardTools}>
            <AmountsToggle />
            <Suspense
              fallback={<div className="bg-wash rounded-ctl h-8 w-20" />}
            >
              <PortfolioSettings currency={currency} id="overview-currency" />
            </Suspense>
          </div>
        </div>
        {worth.unconverted.length > 0 || worth.unpriced > 0 ? (
          <p className="text-warn mt-3 text-sm font-semibold">
            {t.overview.page.partialTotal}
          </p>
        ) : null}
        <p className="font-poster figures mt-3 text-[clamp(52px,15vw,104px)] leading-[0.9] font-extrabold">
          <HeroFigure
            value={formatMoney(worth.total ?? 0, currency)}
            muted={!recorded}
          />
        </p>
        <div className="text-ink-2 mt-4 space-y-1 text-sm">
          {!recorded ? (
            <p>{t.overview.page.nothingToTotalYetAddAnAccountBelow}</p>
          ) : (
            <p>
              {t.overview.page.recordedBalances(
                worth.oldestAsOf ? formatDate(worth.oldestAsOf, locale) : null,
                formatDate(worth.asOf!, locale),
              )}
            </p>
          )}
          <TransferFreshnessNotices warnings={worth.transferWarnings} />
          {recorded && worth.prices ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {worth.prices.oldest
                  ? t.overview.page.marketPrices(
                      worth.prices.quoted,
                      worth.prices.holdings,
                      formatRelative(worth.prices.oldest, new Date(), locale),
                    )
                  : t.overview.page.holdingsAreValuedAtTheirStatementPrices}
              </span>
              {priceChange && !priceChange.isZero() ? (
                <span
                  className={cn(
                    "figures font-semibold",
                    priceChange.isPositive() ? "text-gain" : "text-loss",
                  )}
                >
                  <span className="sensitive">
                    {formatMoney(priceChange.toFixed(2), currency, {
                      signed: true,
                    })}
                  </span>{" "}
                  {t.overview.page.sinceThePreviousClose}
                </span>
              ) : null}
              {worth.prices.feed ? <PriceRefresh /> : null}
            </p>
          ) : null}
          {recorded && worth.prices?.implausible.length ? (
            <p className="text-warn">
              {t.overview.page.implausible(worth.prices.implausible.join(", "))}
            </p>
          ) : null}
          {recorded && !forLaterTotal.isZero() ? (
            <p>
              {worth.countCpfSrs ? (
                <>
                  <span className="sensitive">
                    {formatMoney(
                      investTotal.plus(bankTotal).toFixed(2),
                      currency,
                    )}
                  </span>{" "}
                  {t.overview.page.availableToday}{" "}
                  <span className="sensitive">
                    {formatMoney(forLaterTotal.toFixed(2), currency)}
                  </span>{" "}
                  {t.overview.page.inRetirement}
                </>
              ) : (
                <>
                  {t.overview.page.leavesOut}{" "}
                  <span className="sensitive">
                    {formatMoney(forLaterTotal.toFixed(2), currency)}
                  </span>{" "}
                  {t.overview.page.retirementAfter}
                </>
              )}
            </p>
          ) : null}
          {worth.fxAsOf ? (
            <p className="text-ink-3 text-[12px]">
              {t.overview.page.converted(
                currency,
                formatDate(worth.fxAsOf, locale),
              )}
            </p>
          ) : null}
          {worth.unconverted.length > 0 ? (
            <p className="text-warn">
              {t.overview.page.notConverted(currency)}{" "}
              <span className="sensitive">
                {worth.unconverted
                  .map((a) => formatMoney(a.amount, a.currency))
                  .join(", ")}
              </span>
              {t.overview.sentenceEnd}
            </p>
          ) : null}
          {worth.unpriced > 0 ? (
            <p className="text-warn">
              {t.overview.page.unpriced(worth.unpriced)}
            </p>
          ) : null}
        </div>
        {chartSeries.length > 0 && historyCurrency === currency ? (
          <NetWorthChart
            series={chartSeries.map((series) => ({
              ...series,
              label:
                series.key === "all"
                  ? t.overview.page.netWorth
                  : t.common.accountGroups[
                      series.key as keyof typeof t.common.accountGroups
                    ],
            }))}
            currency={currency}
          />
        ) : null}
      </div>

      {/* What the number is made of */}
      <div
        className={cn(
          "border-line grid grid-cols-2 border-t",
          forLater.length > 0 && "sm:grid-cols-3",
        )}
      >
        {[
          {
            href: "#investments",
            label: t.common.accountGroups.investments,
            value: investTotal,
            note: t.overview.page.accountsShare(
              investing.length,
              share(investTotal),
            ),
          },
          {
            href: "#banking",
            label: t.common.accountGroups.banking,
            value: bankTotal,
            note: owed.isZero() ? (
              t.overview.page.accountsShare(banking.length, share(bankTotal))
            ) : (
              <>
                {t.overview.page.debtBefore}{" "}
                <span className="sensitive">
                  {formatMoney(owed.toFixed(2), currency)}
                </span>{" "}
                {t.overview.page.debtAfter}
              </>
            ),
          },
          ...(forLater.length > 0
            ? [
                {
                  href: "#cpf-srs",
                  label: t.common.accountGroups.cpf_srs,
                  value: forLaterTotal,
                  note: worth.countCpfSrs
                    ? t.overview.page.locked(share(forLaterTotal))
                    : t.overview.page.notCountedInNetWorth,
                },
              ]
            : []),
        ].map((part, i) => (
          <a
            key={part.label}
            href={part.href}
            className={cn(
              "hover:bg-wash group min-w-0 px-5 py-4 transition-colors sm:px-10 sm:py-5",
              i === 1 && "border-line border-l",
              i === 2 &&
                "border-line col-span-2 border-t sm:col-span-1 sm:border-t-0 sm:border-l",
            )}
          >
            <p className="eyebrow">{part.label}</p>
            <p className="font-poster figures mt-1 truncate text-[20px] leading-tight font-bold sm:text-[28px]">
              <span className="sensitive">
                {formatMoney(part.value.toFixed(2), currency)}
              </span>
            </p>
            <p className="text-ink-3 text-[12px]">{part.note}</p>
          </a>
        ))}
      </div>
    </AmountsScope>
  );
}
