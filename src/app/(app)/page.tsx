import { and, eq, isNull } from "drizzle-orm";
import Decimal from "decimal.js";
import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";

import { AmountsScope, AmountsToggle } from "~/components/finance/privacy";
import { cardTools } from "~/components/ui/card-tools";
import { Allocation } from "~/components/overview/allocation";
import { AccountRow } from "~/components/overview/account-row";
import { HeroFigure } from "~/components/overview/hero-figure";
import {
  NetWorthChart,
  type NetWorthPoint,
} from "~/components/overview/net-worth-chart";
import { CpfSrsSheet } from "~/components/overview/cpf-srs-sheet";
import { PortfolioSettings } from "~/components/overview/portfolio-settings";
import { PriceRefresh } from "~/components/overview/price-refresh";
import { SheetHeader } from "~/components/overview/sheet-header";
import { accountGroupOf } from "~/lib/accounts";
import { cn } from "~/lib/cn";
import { currentMonth, shiftMonth, todayIso } from "~/lib/dates";
import { type GroupToday, netWorthSeries } from "~/lib/net-worth-series";
import {
  formatDate,
  formatMoney,
  formatMonth,
  formatRelative,
} from "~/lib/format";
import { isAdmin, requireEnrolledSession } from "~/server/auth";
import { db } from "~/server/db";
import { llmProvider } from "~/server/db/schema";
import { backfillPriceHistory } from "~/server/modules/portfolio/market-health";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Overview" };

function ChecklistItem({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  // Only what is left to do is listed; the count shows the progress.
  if (done) return null;
  return (
    <li className="flex items-center gap-2.5 text-[13px]">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full",
          done
            ? "bg-brand text-on-brand"
            : "border-line-2 text-ink-3 border border-dashed",
        )}
      >
        {done ? (
          <Check className="size-3" strokeWidth={3.5} />
        ) : (
          <Minus className="size-3" />
        )}
      </span>
      <span className={done ? "text-ink-3 line-through" : undefined}>
        {children}
      </span>
    </li>
  );
}

const link =
  "font-semibold underline decoration-current/30 underline-offset-4 hover:decoration-current";

const sum = (values: (string | null)[]) =>
  values.reduce((total, v) => (v ? total.plus(v) : total), new Decimal(0));

export default async function OverviewPage() {
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
  const recorded = worth.accounts.some((a) => a.asOf);
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
  const investTotal = sum(worth.allocation.map((a) => a.total));
  const investmentIncomplete = investing.some(
    (a) => a.unconverted.length > 0 || a.unpriced > 0,
  );
  const positive = worth.allocation.filter(
    (a) => a.total && new Decimal(a.total).isPositive(),
  );
  const positiveSum = sum(positive.map((a) => a.total));
  const slices = positive.map((a) => ({
    assetClass: a.assetClass,
    share: positiveSum.isZero()
      ? 0
      : new Decimal(a.total!).div(positiveSum).times(100).toNumber(),
    display: formatMoney(a.total!, currency),
  }));

  // Bank and cards: cash held less what the cards owe.
  const bankTotal = new Decimal(worth.banking.total ?? 0);
  const owed = sum(
    banking.map((a) =>
      a.total && new Decimal(a.total).isNegative() ? a.total : null,
    ),
  ).abs();

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

  // This month's spending in the display currency, rolled up to top-level categories.
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId ?? c.id]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const otherCurrencies = thisMonth.unconverted;
  const moneyIn = new Decimal(thisMonth.received);
  const moneyOut = new Decimal(thisMonth.spent);
  // A partial last month would make the comparison misleading.
  const lastOut = lastMonth.unconverted.length
    ? new Decimal(0)
    : new Decimal(lastMonth.spent);
  const byCategory = new Map<string, Decimal>();
  for (const r of thisMonth.categories) {
    if (new Decimal(r.spent).isZero()) continue;
    const root = r.categoryId
      ? (parentOf.get(r.categoryId) ?? r.categoryId)
      : "none";
    byCategory.set(
      root,
      (byCategory.get(root) ?? new Decimal(0)).plus(r.spent),
    );
  }
  const ranked = [...byCategory]
    .map(([id, spent]) => ({
      id,
      name: id === "none" ? "Not categorised" : (nameOf.get(id) ?? "Other"),
      spent,
    }))
    .sort((a, b) => b.spent.comparedTo(a.spent));
  const shown = ranked.slice(0, 6);
  const rest = sum(ranked.slice(6).map((r) => r.spent.toFixed(4)));
  const largest = shown[0]?.spent ?? new Decimal(1);

  const checklist = [
    { done: !!session.user.twoFactorEnabled, key: "2fa" },
    ...(admin ? [{ done: hasDefaultProvider, key: "ai" }] : []),
    { done: investing.length > 0, key: "invest" },
    { done: banking.length > 0, key: "bank" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
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
    <HydrateClient>
      {/* Net worth */}
      <AmountsScope
        scope="overview-net-worth"
        className="card relative overflow-hidden"
      >
        <div className="ink-strip h-1.5" />
        <div className="p-5 sm:p-10">
          <div className="flex items-center justify-between gap-4">
            <p className="eyebrow">Net worth · {firstName}</p>
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
              Partial total
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
              <p>
                Nothing to total yet. Add an account below and record what it
                holds.
              </p>
            ) : (
              <p>Latest balances, up to {formatDate(worth.asOf!)}.</p>
            )}
            {recorded && worth.prices ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {worth.prices.oldest
                    ? `${worth.prices.quoted === worth.prices.holdings ? "All" : `${worth.prices.quoted} of`} ${worth.prices.holdings} holding${worth.prices.holdings === 1 ? "" : "s"} at market prices, as of ${formatRelative(worth.prices.oldest)}.`
                    : "Holdings are valued at their statement prices."}
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
                    since the previous close
                  </span>
                ) : null}
                {worth.prices.feed ? <PriceRefresh /> : null}
              </p>
            ) : null}
            {recorded && worth.prices?.implausible.length ? (
              <p className="text-warn">
                The market price of {worth.prices.implausible.join(", ")} is far
                from its statement price, so the statement price is used. Check
                the symbol, exchange and type in that account&apos;s entry.
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
                    you can reach today.{" "}
                    <span className="sensitive">
                      {formatMoney(forLaterTotal.toFixed(2), currency)}
                    </span>{" "}
                    is in CPF and SRS.
                  </>
                ) : (
                  <>
                    Leaves out{" "}
                    <span className="sensitive">
                      {formatMoney(forLaterTotal.toFixed(2), currency)}
                    </span>{" "}
                    in CPF and SRS.
                  </>
                )}
              </p>
            ) : null}
            {worth.fxAsOf ? (
              <p className="text-ink-3 text-[12px]">
                Converted to {currency} · exchange rates as of{" "}
                {formatDate(worth.fxAsOf)}.
              </p>
            ) : null}
            {worth.unconverted.length > 0 ? (
              <p className="text-warn">
                Not included, no exchange rate to {currency} yet:{" "}
                <span className="sensitive">
                  {worth.unconverted
                    .map((a) => formatMoney(a.amount, a.currency))
                    .join(", ")}
                </span>
                .
              </p>
            ) : null}
            {worth.unpriced > 0 ? (
              <p className="text-warn">
                {worth.unpriced} holding{worth.unpriced === 1 ? "" : "s"}{" "}
                without a price {worth.unpriced === 1 ? "is" : "are"} not
                counted.
              </p>
            ) : null}
          </div>
          {/* Without a convertible total, e.g. only CPF that is not counted, groups still show. */}
          {chartSeries.length > 0 && history.currency === currency ? (
            <NetWorthChart series={chartSeries} currency={currency} />
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
              label: "Investments",
              value: investTotal,
              note: `${investing.length} account${investing.length === 1 ? "" : "s"} · ${share(investTotal)}`,
            },
            {
              href: "#banking",
              label: "Bank & cards",
              value: bankTotal,
              note: owed.isZero() ? (
                `${banking.length} account${banking.length === 1 ? "" : "s"} · ${share(bankTotal)}`
              ) : (
                <>
                  After{" "}
                  <span className="sensitive">
                    {formatMoney(owed.toFixed(2), currency)}
                  </span>{" "}
                  card debt
                </>
              ),
            },
            ...(forLater.length > 0
              ? [
                  {
                    href: "#cpf-srs",
                    label: "CPF & SRS",
                    value: forLaterTotal,
                    note: worth.countCpfSrs
                      ? `Locked for later · ${share(forLaterTotal)}`
                      : "Not counted in net worth",
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

      {doneCount < checklist.length ? (
        <section className="card mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4 sm:px-10">
          <p className="eyebrow">
            Getting set up · {doneCount}/{checklist.length}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <ChecklistItem done={!!session.user.twoFactorEnabled}>
              <Link href="/settings" className={link}>
                Two-step sign-in
              </Link>
            </ChecklistItem>
            {admin ? (
              <ChecklistItem done={hasDefaultProvider}>
                <Link href="/admin/ai" className={link}>
                  Default AI provider
                </Link>
              </ChecklistItem>
            ) : null}
            <ChecklistItem done={investing.length > 0}>
              <Link href="/accounts?add=investments" className={link}>
                An investment account
              </Link>
            </ChecklistItem>
            <ChecklistItem done={banking.length > 0}>
              <Link href="/accounts?add=banking" className={link}>
                A bank account or card
              </Link>
            </ChecklistItem>
          </ul>
        </section>
      ) : null}

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Investments */}
        <AmountsScope
          scope="overview-investments"
          id="investments"
          className="card min-w-0 scroll-mt-6 p-5 sm:p-8"
        >
          <SheetHeader
            eyebrow="Investments"
            title={formatMoney(investTotal.toFixed(2), currency)}
            href="/portfolio"
            linkLabel="Portfolio"
            settings={
              <PortfolioSettings
                currency={currency}
                id="investments-currency"
                iconOnly
              />
            }
          />
          {investmentIncomplete ? (
            <p className="text-warn mt-4 text-sm">
              Partial investment total. Allocation will appear when every
              holding has a price and exchange rate.
            </p>
          ) : null}
          {!investmentIncomplete && slices.length > 0 ? (
            <div className="mt-6">
              <Allocation slices={slices} />
            </div>
          ) : null}
          {investing.length === 0 ? (
            <p className="text-ink-2 mt-6 text-sm">
              Brokerage, retirement and crypto accounts are valued from what
              they hold.{" "}
              <Link href="/accounts?add=investments" className={link}>
                Add one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-6">
              {investing.map((a) => (
                <AccountRow key={a.id} account={a} currency={currency} />
              ))}
            </ul>
          )}
        </AmountsScope>

        {/* Bank and cards */}
        <AmountsScope
          scope="overview-spending"
          id="banking"
          className="card min-w-0 scroll-mt-6 p-5 sm:p-8"
        >
          <SheetHeader
            eyebrow={`Spending · ${formatMonth(month)}`}
            title={formatMoney(moneyOut.toFixed(2), currency)}
            href="/spending"
            linkLabel="Transactions"
          />
          <dl className="mt-5 grid grid-cols-3 gap-4">
            {[
              { label: "Money in", value: moneyIn, tone: "text-gain" },
              { label: "Money out", value: moneyOut, tone: "text-loss" },
              {
                label: "Left over",
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
                {formatMoney(
                  moneyOut.minus(lastOut).abs().toFixed(2),
                  currency,
                )}
              </span>{" "}
              {moneyOut.lessThan(lastOut) ? "less" : "more"} than{" "}
              {formatMonth(shiftMonth(month, -1))}. Transfers between your own
              accounts aren&apos;t counted.
            </p>
          )}

          {shown.length > 0 ? (
            <div className="mt-6">
              <p className="eyebrow">Where it went</p>
              <ul className="mt-2 space-y-1.5">
                {[
                  ...shown,
                  ...(rest.isZero()
                    ? []
                    : [{ id: "rest", name: "Everything else", spent: rest }]),
                ].map((c) => (
                  <li
                    key={c.id}
                    className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-[13px]"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="bg-wash h-2.5 overflow-hidden rounded-r-[4px]">
                      <span
                        className="bg-ink/80 block h-full rounded-r-[4px]"
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
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-ink-2 mt-6 text-sm">
              No spending recorded for {formatMonth(month)} yet.
            </p>
          )}
          {otherCurrencies.length > 0 ? (
            <p className="text-ink-3 mt-2 text-[12px]">
              Spending in {otherCurrencies.join(", ")} isn&apos;t included:
              there is no exchange rate for it yet.
            </p>
          ) : null}

          <div className="border-ink/80 mt-8 flex items-baseline justify-between border-b-2 pb-2">
            <p className="eyebrow">Bank & cards</p>
            <p className="figures font-mono text-[13px] font-semibold">
              <span className="sensitive">
                {formatMoney(bankTotal.toFixed(2), currency)}
              </span>
            </p>
          </div>
          {banking.length === 0 ? (
            <p className="text-ink-2 mt-4 text-sm">
              Savings, current and credit card accounts carry a balance and your
              transactions.{" "}
              <Link href="/accounts?add=banking" className={link}>
                Add one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-2">
              {banking.map((a) => (
                <AccountRow key={a.id} account={a} currency={currency} />
              ))}
            </ul>
          )}
        </AmountsScope>
      </div>

      {worth.cpfSrsEnabled || forLater.length > 0 ? (
        <div className="mt-4">
          <CpfSrsSheet worth={worth} />
        </div>
      ) : null}
    </HydrateClient>
  );
}
