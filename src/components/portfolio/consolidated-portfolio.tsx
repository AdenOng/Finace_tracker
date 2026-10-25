"use client";

import Decimal from "decimal.js";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { InstitutionMark } from "~/components/accounts/institution-mark";
import { AmountsScope, AmountsToggle } from "~/components/finance/privacy";
import { cardTools } from "~/components/ui/card-tools";
import { Allocation } from "~/components/overview/allocation";
import { HeroFigure } from "~/components/overview/hero-figure";
import { PortfolioSettings } from "~/components/overview/portfolio-settings";
import { Input } from "~/components/ui/field";
import { EmptyState, Notice, PageHeader, Tag } from "~/components/ui/panel";
import { FilterTabs } from "~/components/ui/tabs";
import { assetClassLabels } from "~/lib/accounts";
import { cn } from "~/lib/cn";
import { exchangeName } from "~/lib/exchanges";
import { formatDate, formatMoney, formatQuantity } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Portfolio = RouterOutputs["portfolio"]["consolidated"];
type Stock = Portfolio["positions"][number];
const amount = (value: string | null, currency: string) =>
  value === null ? (
    "Not valued"
  ) : (
    <span className="sensitive">{formatMoney(value, currency)}</span>
  );

const link =
  "font-semibold underline decoration-current/30 underline-offset-4 hover:decoration-current";

const signedPercent = (percent: string) => {
  const value = new Decimal(percent);
  return `${value.isZero() ? "" : value.isPositive() ? "+" : "−"}${value.abs().toFixed(1)}%`;
};

/** Signed money and percentage, coloured by direction. */
function Gain({
  gain,
  currency,
  className,
}: {
  gain: { amount: string; percent: string | null } | null;
  currency: string;
  className?: string;
}) {
  if (!gain)
    return (
      <span
        className={cn("text-ink-3", className)}
        title="No average cost recorded"
      >
        —
      </span>
    );
  const value = new Decimal(gain.amount);
  return (
    <span
      className={cn(
        "figures font-mono",
        value.isPositive() && !value.isZero() && "text-gain",
        value.isNegative() && "text-loss",
        className,
      )}
    >
      <span className="sensitive">
        {formatMoney(gain.amount, currency, { signed: true })}
      </span>
      {gain.percent !== null ? (
        <span className="block text-[11px] opacity-80">
          {signedPercent(gain.percent)}
        </span>
      ) : null}
    </span>
  );
}

export function ConsolidatedPortfolio() {
  const [brokerId, setBrokerId] = useState("");
  const [search, setSearch] = useState("");
  const query = api.portfolio.consolidated.useQuery(
    brokerId ? { accountId: brokerId } : undefined,
  );
  const data = query.data;
  const term = search.trim().toLowerCase();
  const positions =
    data?.positions.filter((p) =>
      `${p.symbol} ${p.name ?? ""} ${p.exchange} ${exchangeName(p.exchange)}`
        .toLowerCase()
        .includes(term),
    ) ?? [];

  // Allocation by asset class, shown only when every holding is valued.
  const slices = (() => {
    if (!data || data.incomplete || data.total === null) return [];
    if (data.positions.some((p) => p.total === null)) return [];
    const byClass = new Map<string, Decimal>();
    for (const p of data.positions)
      byClass.set(
        p.assetClass,
        (byClass.get(p.assetClass) ?? new Decimal(0)).plus(p.total!),
      );
    if (data.cash.total) byClass.set("cash", new Decimal(data.cash.total));
    const positive = [...byClass].filter(([, v]) => v.isPositive());
    const sum = positive.reduce((s, [, v]) => s.plus(v), new Decimal(0));
    if (sum.isZero()) return [];
    return positive.map(([assetClass, v]) => ({
      assetClass: assetClass as keyof typeof assetClassLabels,
      share: v.div(sum).times(100).toNumber(),
      display: formatMoney(v.toFixed(2), data.currency),
    }));
  })();
  const unrecorded = data?.brokers.filter(
    (b) => !b.asOf && (!brokerId || b.id === brokerId),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Portfolio"
        description="Every holding across your brokers, added up."
        actions={
          <Link
            href="/accounts"
            className="text-ink-2 hover:text-ink inline-flex min-h-10 items-center gap-1 text-sm font-semibold"
          >
            Manage accounts <ArrowUpRight className="size-4" />
          </Link>
        }
      />
      {query.error ? <Notice tone="error">{query.error.message}</Notice> : null}
      {!data && !query.error ? (
        <div className="card p-6 text-sm" aria-live="polite">
          Loading portfolio…
        </div>
      ) : null}
      {data ? (
        <>
          <AmountsScope
            scope="portfolio-summary"
            className="card min-w-0 overflow-hidden"
          >
            <div className="ink-strip h-1.5" />
            <div className="p-5 sm:p-10">
              <div className="flex items-center justify-between gap-4">
                <p className="eyebrow">
                  {brokerId
                    ? data.brokers.find((b) => b.id === brokerId)?.name
                    : "All brokers"}
                </p>
                <div className={cardTools}>
                  <AmountsToggle />
                  <PortfolioSettings
                    currency={data.currency}
                    id="consolidated-currency"
                  />
                </div>
              </div>
              {data.incomplete ? (
                <p className="text-warn mt-3 text-sm font-semibold">Partial</p>
              ) : null}
              <p className="font-poster figures mt-3 text-[clamp(44px,12vw,84px)] leading-[0.9] font-extrabold">
                {data.total === null ? (
                  <span className="text-ink-3">
                    {data.oldestEntry ? "Not valued" : "Not recorded"}
                  </span>
                ) : (
                  <HeroFigure
                    value={formatMoney(data.total, data.currency)}
                    muted={false}
                  />
                )}
              </p>
              <div className="text-ink-2 mt-4 space-y-1 text-sm">
                <p>
                  {data.positions.length} holding
                  {data.positions.length === 1 ? "" : "s"} across{" "}
                  {data.selectedBrokerCount} account
                  {data.selectedBrokerCount === 1 ? "" : "s"}
                  {data.oldestEntry
                    ? `, up to ${formatDate(data.newestEntry!)}`
                    : ""}
                  .
                  {data.srs?.total && !new Decimal(data.srs.total).isZero() ? (
                    <>
                      {" "}
                      Includes{" "}
                      <span className="sensitive">
                        {formatMoney(data.srs.total, data.currency)}
                      </span>{" "}
                      in SRS.
                    </>
                  ) : null}
                </p>
                {unrecorded?.length ? (
                  <p className="text-ink-3 text-[12px]">
                    Nothing recorded yet for{" "}
                    {unrecorded.map((b, i) => (
                      <span key={b.id}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/accounts/${b.id}`} className={link}>
                          {b.name}
                        </Link>
                      </span>
                    ))}
                    .
                  </p>
                ) : null}
              </div>
              {slices.length > 0 ? (
                <div className="mt-8">
                  <Allocation slices={slices} />
                </div>
              ) : null}
            </div>
            <div className="border-line grid grid-cols-2 border-t sm:grid-cols-3">
              {[
                {
                  label: "Holdings",
                  value: <>{amount(data.securities.total, data.currency)}</>,
                },
                {
                  label: "Broker cash",
                  value: <>{amount(data.cash.total, data.currency)}</>,
                },
                {
                  label: "Unrealised gain",
                  value: data.gain ? (
                    <span
                      className={cn(
                        new Decimal(data.gain.amount).isNegative()
                          ? "text-loss"
                          : "text-gain",
                      )}
                    >
                      <span className="sensitive">
                        {formatMoney(data.gain.amount, data.currency, {
                          signed: true,
                        })}
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink-3">—</span>
                  ),
                  note: data.gain
                    ? `${data.gain.percent !== null ? `${signedPercent(data.gain.percent)} · ` : ""}${data.gain.holdings} of ${data.positions.length} holdings have a cost`
                    : "Add average costs to see this",
                },
              ].map((part, i) => (
                <div
                  key={part.label}
                  className={cn(
                    "min-w-0 px-5 py-4 sm:px-10 sm:py-5",
                    i === 1 && "border-line border-l",
                    i === 2 &&
                      "border-line col-span-2 border-t sm:col-span-1 sm:border-t-0 sm:border-l",
                  )}
                >
                  <p className="eyebrow">{part.label}</p>
                  <p className="font-poster figures mt-1 truncate text-[20px] leading-tight font-bold sm:text-[28px]">
                    {part.value}
                  </p>
                  {part.note ? (
                    <p className="text-ink-3 text-[12px]">{part.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </AmountsScope>

          {data.incomplete ? (
            <Notice tone="warn">
              {data.unpriced ? (
                <p>
                  {data.unpriced} position
                  {data.unpriced === 1 ? " has" : "s have"} no price and{" "}
                  {data.unpriced === 1 ? "is" : "are"} excluded from the value.
                </p>
              ) : null}
              {data.unconverted.length ? (
                <p>
                  Waiting for exchange rates:{" "}
                  <span className="sensitive">
                    {data.unconverted
                      .map((a) => formatMoney(a.amount, a.currency))
                      .join(", ")}
                  </span>
                  .
                </p>
              ) : null}
            </Notice>
          ) : null}

          <AmountsScope
            scope="portfolio-holdings"
            className="card min-w-0 p-5 sm:p-8"
            aria-label="Consolidated holdings"
          >
            <div className="border-ink/80 flex flex-wrap items-center justify-between gap-3 border-b-2 pb-3">
              <p className="eyebrow flex items-center gap-1">
                Holdings · {data.positions.length}
                <AmountsToggle />
              </p>
              <label className="relative w-full min-w-0 sm:w-64">
                <span className="sr-only">Search holdings</span>
                <Search className="text-ink-3 pointer-events-none absolute top-3 left-3 size-4" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol or name"
                  className="pl-9"
                />
              </label>
            </div>
            {data.brokers.length > 1 ? (
              <div className="mt-4">
                <FilterTabs
                  label="Filter by broker"
                  value={brokerId}
                  onChange={setBrokerId}
                  options={[
                    { value: "", label: "All" },
                    ...data.brokers.map((b) => ({
                      value: b.id,
                      label: b.name,
                    })),
                  ]}
                />
              </div>
            ) : null}

            {!positions.length ? (
              <div className="mt-5">
                <EmptyState
                  title={term ? "No matching holdings" : "No holdings recorded"}
                >
                  {term
                    ? "Try another symbol or company name."
                    : "Record holdings in an investment account or import a statement to see them here."}
                </EmptyState>
              </div>
            ) : (
              <div className="mt-4">
                <div
                  aria-hidden="true"
                  className="text-ink-3 hidden grid-cols-[minmax(0,1fr)_7rem_9rem_8rem_4rem_1.25rem] gap-4 px-2 pb-2 font-mono text-[11px] tracking-[0.12em] uppercase md:grid"
                >
                  <span>Holding</span>
                  <span className="text-right">Units</span>
                  <span className="text-right">Value</span>
                  <span className="text-right">Gain</span>
                  <span className="text-right">Weight</span>
                  <span />
                </div>
                <div className="divide-line border-line divide-y border-t">
                  {positions.map((p) => (
                    <StockRow
                      key={p.securityId}
                      stock={p}
                      currency={data.currency}
                    />
                  ))}
                </div>
              </div>
            )}
          </AmountsScope>

          {data.cashBalances.length ? (
            <AmountsScope
              scope="portfolio-cash"
              className="card min-w-0 p-5 sm:p-8"
            >
              <div className="border-ink/80 flex items-center justify-between border-b-2 pb-2">
                <p className="eyebrow">Broker cash</p>
                <p className="figures -mr-2.5 flex items-center gap-1 font-mono text-[13px] font-semibold">
                  {amount(data.cash.total, data.currency)}
                  <AmountsToggle />
                </p>
              </div>
              <div className="divide-line divide-y">
                {data.cashBalances.map((c) => (
                  <details key={c.currency} className="group py-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-semibold">{c.currency}</span>
                      <span className="figures ml-auto min-w-0 text-right font-mono text-[13px] break-all">
                        <span className="sensitive">
                          {formatMoney(c.amount, c.currency)}
                        </span>
                        {c.currency !== data.currency && c.total !== null ? (
                          <span className="text-ink-3 sensitive ml-2 text-[12px]">
                            {formatMoney(c.total, data.currency)}
                          </span>
                        ) : null}
                      </span>
                      <ChevronDown className="text-ink-3 size-4 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="mt-3 space-y-2">
                      {c.brokers.map((b) => (
                        <li
                          key={b.accountId}
                          className="flex min-w-0 justify-between gap-3 text-[13px]"
                        >
                          <Link
                            href={`/accounts/${b.accountId}`}
                            className="text-ink-2 min-w-0 truncate underline decoration-current/30 underline-offset-4"
                          >
                            {b.accountName}
                          </Link>
                          <span className="figures sensitive shrink-0 font-mono text-[12px]">
                            {formatMoney(b.amount, c.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </AmountsScope>
          ) : null}

          <AmountsScope
            scope="portfolio-brokers"
            aria-label="Broker accounts"
            className="pt-2"
          >
            <p className="eyebrow mb-1 flex items-center gap-1">
              By broker
              <AmountsToggle />
            </p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.brokers
                .filter((b) => !brokerId || b.id === brokerId)
                .map((b) => (
                  <Link
                    key={b.id}
                    href={`/accounts/${b.id}`}
                    className="card hover:border-ink-3 group flex min-w-0 items-center gap-3.5 p-4"
                  >
                    <InstitutionMark
                      institutionKey={b.institutionKey}
                      name={b.institutionName ?? b.name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold group-hover:underline group-hover:underline-offset-4">
                        {b.name}
                        {b.type === "srs" ? (
                          <Tag tone="outline" className="ml-2">
                            SRS
                          </Tag>
                        ) : null}
                      </p>
                      <p className="text-ink-3 text-[12px]">
                        {b.asOf ? formatDate(b.asOf) : "Nothing recorded"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "figures font-mono text-[14px] font-semibold",
                          b.total === null &&
                            "text-ink-3 font-sans font-normal",
                        )}
                      >
                        {b.total === null ? (
                          "—"
                        ) : (
                          <span className="sensitive">
                            {formatMoney(b.total, data.currency)}
                          </span>
                        )}
                      </p>
                      {b.unpriced || b.unconverted.length ? (
                        <span className="text-warn text-[11px]">Partial</span>
                      ) : null}
                    </div>
                  </Link>
                ))}
            </div>
          </AmountsScope>

          <p className="text-ink-3 text-[12px]">
            The same symbol on the same exchange is combined across brokers.
            {data.fxAsOf
              ? ` Exchange rates as of ${formatDate(data.fxAsOf)}.`
              : ""}
            {data.archivedCount ? (
              <>
                {" "}
                {data.archivedCount} archived account
                {data.archivedCount === 1 ? " is" : "s are"} left out (
                <Link href="/accounts" className="underline underline-offset-4">
                  Accounts → Archived
                </Link>
                ).
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Second line under the symbol: the name, then where it trades or what it is. */
function describe(p: Stock) {
  return [
    p.name,
    p.exchange ? exchangeName(p.exchange) : assetClassLabels[p.assetClass],
  ]
    .filter(Boolean)
    .join(" · ");
}

function StockRow({ stock: p, currency }: { stock: Stock; currency: string }) {
  const brokers = [...new Map(p.brokers.map((b) => [b.accountId, b])).values()];
  const several = brokers.length > 1;
  const partial = p.unpriced > 0 || p.unconverted.length > 0;
  const cells = (
    <>
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2 text-[14px] font-semibold">
          <span className="truncate">{p.symbol}</span>
          {p.inSrs ? <Tag tone="outline">SRS</Tag> : null}
        </p>
        <p className="text-ink-3 truncate text-[12px]">
          {describe(p)}
          {!several && brokers[0] ? (
            <>
              {" · "}
              <Link
                href={`/accounts/${brokers[0].accountId}`}
                className="hover:text-ink underline decoration-current/30 underline-offset-4"
              >
                {brokers[0].accountName}
              </Link>
            </>
          ) : (
            ` · ${brokers.length} brokers`
          )}
        </p>
        <p className="text-ink-3 text-[12px] md:hidden">
          <span className="sensitive">{formatQuantity(p.quantity)}</span> units
          · {p.weight !== null ? `${p.weight}%` : "—"}
        </p>
      </div>
      <p className="figures text-ink-2 hidden text-right font-mono text-[13px] md:block">
        <span className="sensitive">{formatQuantity(p.quantity)}</span>
      </p>
      <div className="text-right">
        <p className="figures font-mono text-[14px] font-semibold">
          {amount(p.total, currency)}
        </p>
        {partial ? (
          <span className="text-warn text-[11px]">Partial</span>
        ) : null}
        <Gain
          gain={p.gain}
          currency={currency}
          className="mt-0.5 block text-[12px] md:hidden"
        />
      </div>
      <Gain
        gain={p.gain}
        currency={currency}
        className="hidden text-right text-[13px] md:block"
      />
      <p className="figures text-ink-3 hidden text-right font-mono text-[12px] md:block">
        {p.weight !== null ? `${p.weight}%` : "—"}
      </p>
    </>
  );
  const grid =
    "grid grid-cols-[minmax(0,1fr)_auto_1.25rem] items-center gap-4 px-2 py-3 md:grid-cols-[minmax(0,1fr)_7rem_9rem_8rem_4rem_1.25rem]";

  if (!several)
    return (
      <div className={grid}>
        {cells}
        <span />
      </div>
    );
  return (
    <details className="group min-w-0">
      <summary
        className={cn(
          grid,
          "hover:bg-wash cursor-pointer list-none rounded-[8px] [&::-webkit-details-marker]:hidden",
        )}
      >
        {cells}
        <ChevronDown className="text-ink-3 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="bg-wash/60 mb-3 space-y-3 rounded-[8px] px-4 py-3">
        {p.brokers.map((b) => (
          <li key={b.accountId} className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/accounts/${b.accountId}`}
                className="min-w-0 truncate text-[13px] font-semibold underline decoration-current/30 underline-offset-4"
              >
                {b.accountName}
              </Link>
              <p className="figures shrink-0 font-mono text-[13px]">
                {amount(b.total, currency)}
              </p>
            </div>
            <div className="text-ink-3 mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px]">
              <span>
                <span className="sensitive">{formatQuantity(b.quantity)}</span>{" "}
                units · {formatDate(b.asOf)}
              </span>
              <span>
                {b.source === "statement"
                  ? "Imported"
                  : b.source === "manual"
                    ? "Manual"
                    : "Synced"}
                {b.quotedAt ? ` · Quote ${formatDate(b.quotedAt)}` : ""}
              </span>
            </div>
            {b.nativeValue &&
            (b.nativeValue.currency !== currency ||
              b.unconverted.length > 0) ? (
              <p className="text-ink-3 mt-1 text-[12px]">
                <span className="sensitive">
                  {formatMoney(b.nativeValue.amount, b.nativeValue.currency)}
                </span>
                {b.unconverted.length
                  ? " · Exchange rate unavailable"
                  : " before conversion"}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
