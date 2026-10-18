import { and, eq, isNull } from "drizzle-orm";
import Decimal from "decimal.js";
import { ArrowUpRight, Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Amounts } from "~/components/finance/amounts";
import { DonutChart } from "~/components/charts/donut-chart";
import { CurrencySelect } from "~/components/settings/currency-select";
import { EmptyState, Section } from "~/components/ui/panel";
import { accountTypeLabels, assetClassLabels } from "~/lib/accounts";
import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";
import { isAdmin, requireEnrolledSession } from "~/server/auth";
import { db } from "~/server/db";
import { llmProvider } from "~/server/db/schema";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Overview" };

/**
 * Fixed colour per asset class (validated for colour-blind separation on the dark surface), so
 * a class keeps its colour whatever else is in the portfolio. Options and other share neutral.
 */
const allocationColors: Record<string, string> = {
  stock: "#1fa863",
  etf: "#3987e5",
  fund: "#c98500",
  bond: "#d55181",
  crypto: "#9085e9",
  cash: "#d95926",
  option: "#7d8f85",
  other: "#7d8f85",
};

/** Hero figure: symbol and minor units set back so the whole number leads. */
function HeroFigure({ value, muted }: { value: string; muted: boolean }) {
  const match = /^([−+]?)(\D*?)([\d,]+)(\.\d+)?$/.exec(value);
  if (!match) return <>{value}</>;
  const [, sign, symbol, whole, fraction] = match;
  return (
    <>
      <span className="text-ink-3 mr-2 align-[0.42em] text-[0.42em]">
        {sign}
        {symbol}
      </span>
      <span className={muted ? "text-ink-3" : undefined}>{whole}</span>
      {fraction ? <span className="text-ink-3">{fraction}</span> : null}
    </>
  );
}

function ChecklistItem({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5 text-sm">
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
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
      <span
        className={
          done ? "text-ink-3 decoration-ink-3/40 line-through" : "text-ink"
        }
      >
        {children}
      </span>
    </li>
  );
}

export default async function OverviewPage() {
  const session = await requireEnrolledSession();
  const [settings, worth] = await Promise.all([
    api.settings.get(),
    api.portfolio.netWorth(),
  ]);
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();

  const admin = isAdmin(session.user);
  const hasDefaultProvider = admin
    ? (await db.$count(
        llmProvider,
        and(isNull(llmProvider.ownerId), eq(llmProvider.isDefault, true)),
      )) > 0
    : true;
  const firstName = session.user.name.split(" ")[0];
  const recorded = worth.accounts.some((a) => a.asOf);

  const positive = worth.allocation.filter(
    (a) => a.total && new Decimal(a.total).isPositive(),
  );
  const allocationSum = positive.reduce(
    (sum, a) => sum.plus(a.total!),
    new Decimal(0),
  );
  const shares = positive
    .map((a) => ({
      ...a,
      color: allocationColors[a.assetClass] ?? allocationColors.other!,
      share: allocationSum.isZero()
        ? 0
        : new Decimal(a.total!).div(allocationSum).times(100).toNumber(),
    }))
    .sort((a, b) => b.share - a.share);

  const checklist = [
    !!session.user.twoFactorEnabled,
    ...(admin ? [hasDefaultProvider] : []),
    worth.accounts.length > 0,
    recorded,
  ];
  const doneCount = checklist.filter(Boolean).length;

  return (
    <HydrateClient>
      <section className="card relative overflow-hidden p-6 sm:p-10">
        <div
          aria-hidden
          className="grid-lines pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_80%_at_100%_0%,black,transparent)] opacity-50"
        />
        <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <span className="bg-brand animate-pulse-dot size-1.5 rounded-full" />
              Net worth · {firstName}
            </p>
            <p className="figures font-display mt-5 text-[56px] leading-none font-medium tracking-tight sm:text-[88px]">
              <HeroFigure
                value={formatMoney(worth.total ?? 0, settings.displayCurrency)}
                muted={!recorded}
              />
            </p>
            <div className="text-ink-2 mt-5 max-w-lg space-y-1 text-sm">
              {!recorded ? (
                <p>
                  Nothing to total yet. Add your accounts and record their
                  balances and holdings; amounts are converted to your display
                  currency.
                </p>
              ) : (
                <p>Latest balances, up to {formatDate(worth.asOf!)}.</p>
              )}
              {worth.unconverted.length > 0 ? (
                <p className="text-warn">
                  Not included, no exchange rate to {worth.currency} yet:{" "}
                  {worth.unconverted
                    .map((a) => formatMoney(a.amount, a.currency))
                    .join(", ")}
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
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="overview-currency" className="eyebrow">
              Show amounts in
            </label>
            <Suspense
              fallback={<div className="bg-wash rounded-ctl h-10 w-44" />}
            >
              <CurrencySelect id="overview-currency" />
            </Suspense>
          </div>
        </div>

        {shares.length > 0 ? (
          <div className="relative mt-10">
            <div className="bg-sunken flex h-3 gap-0.5 overflow-hidden rounded-full">
              {shares.map((a) => (
                <span
                  key={a.assetClass}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${a.share}%`, background: a.color }}
                  title={`${assetClassLabels[a.assetClass]} ${a.share.toFixed(1)}%`}
                />
              ))}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
              {shares.map((a) => (
                <li key={a.assetClass} className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: a.color }}
                  />
                  <span className="text-ink-2">
                    {assetClassLabels[a.assetClass]}
                  </span>
                  <span className="figures text-ink-3 font-mono text-[12px]">
                    {a.share.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Accounts", value: String(worth.accounts.length) },
          {
            label: "With balances",
            value: String(worth.accounts.filter((a) => a.asOf).length),
          },
          { label: "Asset classes", value: String(worth.allocation.length) },
          {
            label: "Last updated",
            value: worth.asOf ? formatDate(worth.asOf) : "—",
          },
        ].map((stat) => (
          <div key={stat.label} className="card px-5 py-4">
            <dt className="eyebrow">{stat.label}</dt>
            <dd className="font-display figures mt-2 text-[28px] leading-none">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Section
          title="Accounts"
          description="Brokerage, bank and card accounts you track."
          actions={
            worth.accounts.length > 0 ? (
              <Link
                href="/accounts"
                className="text-ink-2 hover:text-brand inline-flex items-center gap-1 text-[13px] font-medium transition-colors"
              >
                Manage
                <ArrowUpRight className="size-3.5" />
              </Link>
            ) : undefined
          }
        >
          {worth.accounts.length === 0 ? (
            <EmptyState
              title="No accounts yet"
              action={
                <Link
                  href="/accounts"
                  className="text-brand inline-flex items-center gap-1 font-medium"
                >
                  Add an account
                  <ArrowUpRight className="size-4" />
                </Link>
              }
            >
              Add your bank, card and brokerage accounts, then record their
              balances. Statement imports and broker sync come in a later build
              step.
            </EmptyState>
          ) : (
            <ul className="-mx-2">
              {worth.accounts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/accounts/${a.id}`}
                    className="group rounded-ctl hover:bg-wash/70 flex items-center gap-4 px-2 py-3 transition-colors"
                  >
                    <span className="bg-surface-2 border-line-2 font-display text-ink-2 group-hover:text-brand grid size-10 shrink-0 place-items-center rounded-full border text-lg transition-colors">
                      {a.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {a.name}
                      </span>
                      <span className="text-ink-3 block text-[13px]">
                        {accountTypeLabels[a.type]}
                        {a.asOf ? ` · ${formatDate(a.asOf)}` : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      {!a.asOf ? (
                        <span className="text-ink-3 text-[13px]">
                          Not recorded
                        </span>
                      ) : a.unpriced > 0 && a.totals.length === 0 ? (
                        <span className="text-warn text-[13px]">
                          Awaiting prices
                        </span>
                      ) : a.unconverted.length > 0 ? (
                        <Amounts totals={a.totals} className="text-warn" />
                      ) : (
                        <span className="figures font-display text-lg">
                          {formatMoney(a.total ?? 0, worth.currency)}
                        </span>
                      )}
                      {a.unpriced > 0 ? (
                        <span className="text-warn block text-[12px]">
                          {a.unpriced} holding{a.unpriced === 1 ? "" : "s"}{" "}
                          without a price
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          {worth.allocation.length > 0 ? (
            <Section
              title="By asset class"
              description={`In ${worth.currency}.`}
            >
              {shares.length > 0 ? (
                <DonutChart
                  segments={shares.map((a) => ({
                    key: a.assetClass,
                    label: assetClassLabels[a.assetClass],
                    share: a.share,
                    display: formatMoney(a.total!, worth.currency),
                    color: a.color,
                  }))}
                  totalLabel="Total"
                  totalDisplay={formatMoney(
                    allocationSum.toFixed(2),
                    worth.currency,
                  )}
                />
              ) : null}
              {worth.allocation.some((a) => a.unconverted.length > 0) ? (
                <div className="border-line mt-4 space-y-1 border-t pt-3 text-[13px]">
                  <p className="text-ink-3">Not converted yet:</p>
                  {worth.allocation
                    .filter((a) => a.unconverted.length > 0)
                    .map((a) => (
                      <p
                        key={a.assetClass}
                        className="flex justify-between gap-3"
                      >
                        <span className="text-ink-2">
                          {assetClassLabels[a.assetClass]}
                        </span>
                        <Amounts totals={a.unconverted} className="text-warn" />
                      </p>
                    ))}
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section
            title="Getting set up"
            actions={
              <span className="figures text-ink-3 font-mono text-[12px]">
                {doneCount}/{checklist.length}
              </span>
            }
          >
            <span className="bg-sunken -mt-2 mb-3 block h-1 overflow-hidden rounded-full">
              <span
                className="bg-brand block h-full rounded-full transition-[width]"
                style={{ width: `${(doneCount / checklist.length) * 100}%` }}
              />
            </span>
            <ul>
              <ChecklistItem done={!!session.user.twoFactorEnabled}>
                Turn on two-step sign-in in{" "}
                <Link
                  href="/settings"
                  className="text-brand font-medium hover:underline hover:underline-offset-4"
                >
                  Settings
                </Link>
              </ChecklistItem>
              {admin ? (
                <ChecklistItem done={hasDefaultProvider}>
                  Default AI provider set —{" "}
                  <Link
                    href="/admin/ai"
                    className="text-brand font-medium hover:underline hover:underline-offset-4"
                  >
                    run a test
                  </Link>{" "}
                  before importing
                </ChecklistItem>
              ) : null}
              <ChecklistItem done={worth.accounts.length > 0}>
                <Link
                  href="/accounts"
                  className="text-brand font-medium hover:underline hover:underline-offset-4"
                >
                  Add your first account
                </Link>
              </ChecklistItem>
              <ChecklistItem done={recorded}>
                Record a balance or holdings
              </ChecklistItem>
            </ul>
          </Section>
        </div>
      </div>
    </HydrateClient>
  );
}
