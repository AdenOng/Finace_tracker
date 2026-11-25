import Decimal from "decimal.js";
import { and, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { after } from "next/server";
import { CpfSrsSheet } from "~/components/overview/cpf-srs-sheet";
import { type NetWorthPoint } from "~/components/overview/net-worth-chart";
import { SetupChecklist } from "~/components/overview/setup-checklist";
import { OverviewSpendingCard } from "~/components/overview/spending-card";
import { getLocale, getT } from "~/i18n/server";
import { currentMonth, shiftMonth, todayIso } from "~/lib/dates";
import { type GroupToday, netWorthSeries } from "~/lib/net-worth-series";
import {
  rollupOverviewSpending,
  rollupOverviewHoldings,
} from "~/server/modules/portfolio/overview";
import { isAdmin, requireEnrolledSession } from "~/server/auth";
import { db } from "~/server/db";
import { llmProvider } from "~/server/db/schema";
import { backfillPriceHistory } from "~/server/modules/portfolio/market-health";
import { api, HydrateClient } from "~/trpc/server";
import { NetWorthCard } from "~/components/overview/net-worth-card";
import { InvestmentsCard } from "~/components/overview/investments-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.overview.meta.title };
}

export default async function OverviewPage() {
  const t = await getT();
  const locale = await getLocale();
  const session = await requireEnrolledSession();
  const month = currentMonth();
  const [worth, history, categories, thisMonth, lastMonth] = await Promise.all([
    api.portfolio.netWorth(),
    api.portfolio.netWorthHistory(),
    api.catalog.categories(),
    api.spending.converted({ month }),
    api.spending.converted({ month: shiftMonth(month, -1) }),
  ]);
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();
  // Past closes for new entries draw the chart from the next visit, without slowing this one.
  after(() =>
    backfillPriceHistory(db, { ownerId: session.user.id }).catch((error) =>
      console.error("[net worth] could not backfill prices", error),
    ),
  );

  const admin = isAdmin(session.user);
  const hasDefaultProvider = admin
    ? (await db.$count(
        llmProvider,
        and(isNull(llmProvider.ownerId), eq(llmProvider.isDefault, true)),
      )) > 0
    : true;
  const firstName = session.user.name.split(" ")[0];
  const currency = worth.currency;
  const recorded = worth.asOf !== null;
  // The chart ends on the figure shown above it, whatever today's recorded value was.
  const today = todayIso();
  const trend: NetWorthPoint[] = [
    ...history.points.filter((p) => p.date < today),
    ...(recorded && worth.total
      ? [
          {
            date: today,
            total: worth.total,
            partial: worth.unconverted.length > 0 || worth.unpriced > 0,
            estimated: false,
            backfilled: false,
          },
        ]
      : []),
  ];

  const holdings = rollupOverviewHoldings(worth);
  const { investing, banking, forLater, investTotal, bankTotal } = holdings;

  const groupToday = (
    accounts: typeof investing,
    total: string | null,
  ): GroupToday => ({
    entered: accounts.some((a) => a.asOf),
    total,
    partial: accounts.some((a) => a.unconverted.length > 0 || a.unpriced > 0),
  });
  const chartSeries = netWorthSeries({
    trend,
    groups: history.groups,
    today,
    now: {
      investments: groupToday(
        investing,
        worth.allocation.some((a) => a.total !== null)
          ? investTotal.toFixed()
          : null,
      ),
      banking: groupToday(banking, worth.banking.total),
      cpf_srs: groupToday(forLater, worth.cpfSrs.total),
    },
  });

  const { shown, rest, largest } = rollupOverviewSpending({
    categories,
    spentByCategory: thisMonth.categories,
    translateCategory: (name) =>
      (t.common.categories as Record<string, string>)[name] ?? name,
    notCategorisedLabel: t.overview.page.notCategorised,
    otherLabel: t.overview.page.other,
  });

  const moneyIn = new Decimal(thisMonth.received);
  const moneyOut = new Decimal(thisMonth.spent);
  const lastOut = lastMonth.unconverted.length
    ? new Decimal(0)
    : new Decimal(lastMonth.spent);

  return (
    <HydrateClient>
      <NetWorthCard
        worth={worth}
        holdings={holdings}
        chartSeries={chartSeries}
        historyCurrency={history.currency}
        firstName={firstName}
        t={t}
        locale={locale}
      />

      <SetupChecklist
        t={t}
        twoFactorEnabled={!!session.user.twoFactorEnabled}
        admin={admin}
        hasDefaultProvider={hasDefaultProvider}
        hasInvestments={investing.length > 0}
        hasBanking={banking.length > 0}
      />

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <InvestmentsCard holdings={holdings} currency={currency} t={t} />

        <OverviewSpendingCard
          t={t}
          locale={locale}
          month={month}
          currency={currency}
          moneyIn={moneyIn}
          moneyOut={moneyOut}
          lastOut={lastOut}
          shown={shown}
          rest={rest}
          largest={largest}
          otherCurrencies={thisMonth.unconverted}
          bankTotal={bankTotal}
          banking={banking}
        />
      </div>

      {worth.cpfSrsEnabled || forLater.length > 0 ? (
        <div className="mt-4">
          <CpfSrsSheet worth={worth} />
        </div>
      ) : null}
    </HydrateClient>
  );
}
