"use client";

import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { InstitutionMark } from "~/components/accounts/institution-mark";
import { PortfolioSettings } from "~/components/overview/portfolio-settings";
import { Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Tag } from "~/components/ui/panel";
import { assetClassLabels } from "~/lib/accounts";
import { formatDate, formatMoney, formatQuantity } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Portfolio = RouterOutputs["portfolio"]["consolidated"];
type Stock = Portfolio["positions"][number];
const amount = (value: string | null, currency: string) =>
  value === null ? "Not valued" : formatMoney(value, currency);

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
      `${p.symbol} ${p.name ?? ""} ${p.exchange}`.toLowerCase().includes(term),
    ) ?? [];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-tight font-semibold sm:text-4xl">
            Consolidated portfolio
          </h1>
          <p className="text-ink-3 mt-1 text-sm">
            Your investments across brokers, together.
          </p>
        </div>
        <Link
          href="/accounts"
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold"
        >
          Manage accounts <ArrowUpRight className="size-4" />
        </Link>
      </header>
      {query.error ? <Notice tone="error">{query.error.message}</Notice> : null}
      {!data && !query.error ? (
        <div className="card p-6 text-sm" aria-live="polite">
          Loading portfolio…
        </div>
      ) : null}
      {data ? (
        <>
          <section className="card min-w-0 overflow-hidden">
            <div className="ink-strip h-1" />
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow">
                  {brokerId
                    ? data.brokers.find((b) => b.id === brokerId)?.name
                    : "All brokers"}
                </p>
                <PortfolioSettings
                  currency={data.currency}
                  id="consolidated-currency"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="figures min-w-0 text-[clamp(1.75rem,7vw,3rem)] leading-tight font-semibold break-all">
                  {data.total === null
                    ? data.oldestEntry
                      ? "Not valued"
                      : "Not recorded"
                    : formatMoney(data.total, data.currency)}
                </p>
                {data.incomplete ? <Tag tone="warn">Partial</Tag> : null}
              </div>
              <p className="text-ink-3 mt-2 text-[13px]">
                {data.positions.length} holding
                {data.positions.length === 1 ? "" : "s"} ·{" "}
                {data.selectedBrokerCount} account
                {data.selectedBrokerCount === 1 ? "" : "s"}
              </p>
              {data.oldestEntry ? (
                <p className="text-ink-3 mt-1 text-[12px]">
                  Latest entry from each account: {formatDate(data.oldestEntry)}
                  {data.newestEntry !== data.oldestEntry
                    ? ` – ${formatDate(data.newestEntry!)}`
                    : ""}
                  .
                </p>
              ) : null}
              <div className="border-line mt-5 grid grid-cols-2 gap-4 border-t pt-4">
                <div className="min-w-0">
                  <p className="text-ink-3 text-[12px]">Investments</p>
                  <p className="figures mt-1 text-lg font-semibold break-all">
                    {amount(data.securities.total, data.currency)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-ink-3 text-[12px]">Broker cash</p>
                  <p className="figures mt-1 text-lg font-semibold break-all">
                    {amount(data.cash.total, data.currency)}
                  </p>
                </div>
              </div>
            </div>
          </section>
          {data.incomplete ? (
            <Notice tone="warn">
              {data.unrecorded ? (
                <p>
                  {data.unrecorded} account
                  {data.unrecorded === 1 ? " has" : "s have"} no recorded
                  holdings or cash yet.
                </p>
              ) : null}
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
                  {data.unconverted
                    .map((a) => formatMoney(a.amount, a.currency))
                    .join(", ")}
                  .
                </p>
              ) : null}
            </Notice>
          ) : null}
          <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)]">
            <label className="relative min-w-0">
              <span className="sr-only">Search holdings</span>
              <Search className="text-ink-3 pointer-events-none absolute top-3 left-3 size-4" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbol or name"
                className="pl-9"
              />
            </label>
            <Select
              aria-label="Filter by broker"
              value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
            >
              <option value="">All brokers</option>
              {data.brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <section
            className="card min-w-0 overflow-hidden"
            aria-label="Consolidated holdings"
          >
            <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
              <h2 className="text-base font-semibold">Holdings</h2>
              <span className="text-ink-3 text-[12px]">
                Value · {data.currency}
              </span>
            </div>
            {!positions.length ? (
              <div className="p-5">
                <EmptyState
                  title={term ? "No matching holdings" : "No holdings recorded"}
                >
                  {term
                    ? "Try another symbol or company name."
                    : "Record holdings in an investment account or import a statement to see them here."}
                </EmptyState>
              </div>
            ) : (
              <div className="divide-line divide-y">
                {positions.map((p) => (
                  <StockRow
                    key={p.securityId}
                    stock={p}
                    currency={data.currency}
                  />
                ))}
              </div>
            )}
          </section>
          {data.cashBalances.length ? (
            <section className="card min-w-0 p-5">
              <h2 className="mb-3 text-base font-semibold">Broker cash</h2>
              <div className="divide-line divide-y">
                {data.cashBalances.map((c) => (
                  <details
                    key={c.currency}
                    className="group py-3 first:pt-0 last:pb-0"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-semibold">{c.currency}</span>
                      <span className="figures ml-auto min-w-0 text-right break-all">
                        {formatMoney(c.amount, c.currency)}
                        {c.currency !== data.currency && c.total !== null ? (
                          <span className="text-ink-3 ml-2 text-[12px]">
                            {formatMoney(c.total, data.currency)}
                          </span>
                        ) : null}
                      </span>
                      <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="border-line mt-3 space-y-3 border-t pt-3">
                      {c.brokers.map((b) => (
                        <li
                          key={b.accountId}
                          className="flex min-w-0 justify-between gap-3 text-[13px]"
                        >
                          <Link
                            href={`/accounts/${b.accountId}`}
                            className="min-w-0 truncate underline underline-offset-4"
                          >
                            {b.accountName}
                          </Link>
                          <span className="figures shrink-0">
                            {formatMoney(b.amount, c.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
          <section aria-label="Broker accounts">
            <h2 className="mb-3 text-base font-semibold">By broker</h2>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.brokers
                .filter((b) => !brokerId || b.id === brokerId)
                .map((b) => (
                  <Link
                    key={b.id}
                    href={`/accounts/${b.id}`}
                    className="card hover:border-ink-3 flex min-w-0 items-center gap-3 p-4"
                  >
                    <InstitutionMark
                      institutionKey={b.institutionKey}
                      name={b.institutionName ?? b.name}
                      className="size-9 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">
                        {b.name}
                      </p>
                      <p className="text-ink-3 mt-0.5 text-[11px]">
                        {b.asOf ? formatDate(b.asOf) : "No entry recorded"}
                      </p>
                      <p className="figures mt-1 text-lg font-semibold break-all">
                        {amount(b.total, data.currency)}
                      </p>
                      {b.unpriced || b.unconverted.length ? (
                        <Tag tone="warn">Partial</Tag>
                      ) : null}
                    </div>
                    <ArrowUpRight className="text-ink-3 size-4 shrink-0" />
                  </Link>
                ))}
            </div>
          </section>
          <p className="text-ink-3 text-[12px]">
            Identical instruments are combined by symbol and exchange. Values
            use available quotes, otherwise the recorded statement value or
            price. Expand a holding to see each broker’s entry and source.
            {data.fxAsOf
              ? ` Exchange rates as of ${formatDate(data.fxAsOf)}.`
              : ""}
            {data.archivedCount ? (
              <>
                {" "}
                {data.archivedCount} archived account
                {data.archivedCount === 1 ? " is" : "s are"} excluded; restore
                under{" "}
                <Link href="/accounts" className="underline underline-offset-4">
                  Accounts → Archived
                </Link>
                .
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

function StockRow({ stock: p, currency }: { stock: Stock; currency: string }) {
  const brokerCount = new Set(p.brokers.map((b) => b.accountId)).size;
  return (
    <details className="group min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {p.symbol}
            <span className="text-ink-3 ml-2 text-[11px] font-normal">
              {p.exchange || "Exchange unspecified"}
            </span>
          </p>
          <p className="text-ink-3 mt-0.5 truncate text-[12px]">
            {formatQuantity(p.quantity)} units · {brokerCount} broker
            {brokerCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="max-w-[52%] min-w-0 text-right">
          <p className="figures text-sm font-semibold break-all">
            {amount(p.total, currency)}
          </p>
          {p.unpriced || p.unconverted.length ? (
            <Tag tone="warn">Partial</Tag>
          ) : p.weight !== null ? (
            <p className="text-ink-3 mt-0.5 text-[11px]">
              {p.weight}% of portfolio
            </p>
          ) : null}
        </div>
        <ChevronDown className="text-ink-3 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="bg-wash/50 border-line border-t px-5 py-4">
        <p className="text-ink-2 mb-3 text-[13px]">
          {p.name ?? p.symbol} · {assetClassLabels[p.assetClass]}
        </p>
        <ul className="space-y-4">
          {p.brokers.map((b) => (
            <li key={b.accountId} className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/accounts/${b.accountId}`}
                  className="min-w-0 truncate text-[13px] font-semibold underline underline-offset-4"
                >
                  {b.accountName}
                </Link>
                <p className="figures shrink-0 text-[13px]">
                  {amount(b.total, currency)}
                </p>
              </div>
              <div className="text-ink-3 mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px]">
                <span>
                  {formatQuantity(b.quantity)} units · {formatDate(b.asOf)}
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
                  {formatMoney(b.nativeValue.amount, b.nativeValue.currency)}
                  {b.unconverted.length
                    ? " · Exchange rate unavailable"
                    : " before conversion"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
