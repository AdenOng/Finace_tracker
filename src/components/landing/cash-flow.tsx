"use client";

import {
  Banknote,
  Bus,
  CircleEllipsis,
  Gift,
  House,
  Plane,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { cn } from "~/lib/cn";

import { money } from "./poster";
import { ACCOUNTS, MONTHS, SAMPLE_YEAR, SPENDING } from "./sample-year";

const CATEGORY_ICONS: Record<(typeof SPENDING)[number]["key"], LucideIcon> = {
  housing: House,
  food: Utensils,
  shopping: ShoppingBag,
  family: Users,
  insurance: ShieldCheck,
  bills: ReceiptText,
  transport: Bus,
  travel: Plane,
  other: CircleEllipsis,
};
const SAVED_FILL = "var(--color-art-green)";
const SPENT_FILL = "var(--color-art-red)";

const grain =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.09  0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0.22 0'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>\")";

const amount = (v: number) => v.toLocaleString("en-SG");
const pct = (v: number, of: number) => `${Math.round((v / of) * 100)}%`;
const MAX_INCOME = Math.max(...SAMPLE_YEAR.map((m) => m.incomeTotal));
const CASH_ACCOUNTS = ACCOUNTS.flatMap((a, i) =>
  a.holds === "cash" ? [i] : [],
);

/**
 * The month's cash flow, on the same paper as the book and turning with it: income splits into
 * what was spent and what was saved, and the saving is exactly what the cash accounts grew by.
 */
export function CashFlow({ month }: { month: number }) {
  const data = SAMPLE_YEAR[month]!;
  const previous = SAMPLE_YEAR[month - 1];
  const savedSoFar = SAMPLE_YEAR.slice(0, month + 1).reduce(
    (sum, m) => sum + m.saved,
    0,
  );
  const cashNames = CASH_ACCOUNTS.map((i) => ACCOUNTS[i]!.name).join(" and ");

  return (
    <section
      aria-label={`Sample cash flow for ${MONTHS[month]}`}
      className="text-paper-ink bg-paper mt-6 overflow-hidden rounded-[6px] shadow-[0_30px_70px_-30px_rgb(0_0_0/0.8),0_0_0_1px_rgb(0_0_0/0.45)]"
      style={{ backgroundImage: grain }}
    >
      <div className="px-5 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-8">
        <div className="flex items-baseline justify-between gap-4 border-b border-current/25 pb-3">
          <span className="font-poster text-[15px] font-bold">Cash flow</span>
          <span className="font-mono text-[10px] tracking-[0.14em]">
            {MONTHS[month]!.toUpperCase()} · STATEMENT{" "}
            {String(month + 1).padStart(2, "0")} OF 12
          </span>
        </div>

        {/* Money in − money out = saved */}
        <div
          key={month}
          className="animate-ink-in mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-x-3 sm:gap-x-6"
        >
          <Figure label="Money in" value={data.incomeTotal} tone="in" />
          <Operator>−</Operator>
          <Figure label="Money out" value={data.spendingTotal} tone="out" />
          <Operator>=</Operator>
          <Figure label="Saved" value={data.saved} tone="saved" />
        </div>
        <p className="mt-2 text-right font-mono text-[10px] tracking-[0.06em] opacity-60">
          {pct(data.saved, data.incomeTotal)} of income · added to {cashNames}
        </p>

        {/* Two clear totals; the category detail lives in the list below. */}
        <div className="mt-7">
          <div className="flex justify-between gap-4 font-mono text-[11px]">
            <span className="text-art-red">
              Spent · {pct(data.spendingTotal, data.incomeTotal)}
            </span>
            <span className="text-art-green">
              Saved · {pct(data.saved, data.incomeTotal)}
            </span>
          </div>
          <div
            role="img"
            aria-label={`Income split: spent ${money(data.spendingTotal)}, saved ${money(data.saved)}`}
            className="mt-2 flex h-4 gap-1 overflow-hidden rounded-[3px]"
          >
            <span
              className="transition-[width] duration-700"
              style={{
                width: `${(data.spendingTotal / data.incomeTotal) * 100}%`,
                background: SPENT_FILL,
              }}
            />
            <span
              className="transition-[width] duration-700"
              style={{
                width: `${(data.saved / data.incomeTotal) * 100}%`,
                background: SAVED_FILL,
              }}
            />
          </div>
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* Categories */}
          <div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-current/25 pb-1.5 font-mono text-[10px] tracking-[0.1em] opacity-60">
              <span>IN AND OUT</span>
              <span className="text-right">S$</span>
              <span className="w-14 text-right">
                VS{" "}
                {previous ? MONTHS[month - 1]!.slice(0, 3).toUpperCase() : "—"}
              </span>
            </div>
            <ul className="mt-1">
              {[...income(data), ...SPENDING.map((c, i) => ({ c, i }))].map(
                (row) =>
                  "kind" in row ? (
                    <li
                      key={row.label}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-1 text-[13px]"
                    >
                      <span className="flex items-center gap-2.5">
                        <IncomeIcon label={row.label} />
                        {row.label}
                      </span>
                      <span className="figures font-mono font-semibold">
                        {amount(row.amount)}
                      </span>
                      <span className="w-14" />
                    </li>
                  ) : (
                    <CategoryRow
                      key={row.c.key}
                      label={row.c.label}
                      Icon={CATEGORY_ICONS[row.c.key]}
                      value={data.spending[row.i]!}
                      before={previous?.spending[row.i]}
                    />
                  ),
              )}
            </ul>
          </div>

          {/* The year so far */}
          <div>
            <div className="flex justify-between border-b border-current/25 pb-1.5 font-mono text-[10px] tracking-[0.1em] opacity-60">
              <span>THE YEAR SO FAR</span>
              <span className="flex gap-3">
                <span className="flex items-center gap-1">
                  <span className="bg-art-green size-1.5 rounded-full" />
                  IN
                </span>
                <span className="flex items-center gap-1">
                  <span className="bg-art-red size-1.5 rounded-full" />
                  OUT
                </span>
              </span>
            </div>
            <div className="mt-3 flex h-32 items-end gap-[6%] px-1">
              {SAMPLE_YEAR.map((m, i) => (
                <div
                  key={m.name}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <div className="flex h-full w-full items-end justify-center gap-[2px]">
                    {i <= month ? (
                      <>
                        <span
                          className="w-1/2 transition-[height] duration-700"
                          style={{
                            height: `${(m.incomeTotal / MAX_INCOME) * 100}%`,
                            background: SAVED_FILL,
                            opacity: i === month ? 1 : 0.5,
                          }}
                        />
                        <span
                          className="w-1/2 transition-[height] duration-700"
                          style={{
                            height: `${(m.spendingTotal / MAX_INCOME) * 100}%`,
                            background: SPENT_FILL,
                            opacity: i === month ? 1 : 0.5,
                          }}
                        />
                      </>
                    ) : (
                      <span className="h-[2px] w-full bg-current/15" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[9px]",
                      i === month ? "font-bold" : "opacity-50",
                    )}
                  >
                    {m.name[0]}
                  </span>
                </div>
              ))}
            </div>
            <dl className="mt-4 space-y-1 border-t border-current/25 pt-3 text-[13px]">
              <div className="flex justify-between">
                <dt className="opacity-70">Saved since January</dt>
                <dd className="figures font-mono font-semibold">
                  {money(savedSoFar)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-70">Average saving rate</dt>
                <dd className="figures font-mono">
                  {pct(
                    savedSoFar,
                    SAMPLE_YEAR.slice(0, month + 1).reduce(
                      (sum, m) => sum + m.incomeTotal,
                      0,
                    ),
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

function income(data: (typeof SAMPLE_YEAR)[number]) {
  return data.income.map((i) => ({ kind: "income" as const, ...i }));
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "in" | "out" | "saved";
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] tracking-[0.12em] uppercase opacity-60">
        {label}
      </p>
      <p
        className={cn(
          "font-poster figures mt-1 truncate text-[clamp(22px,5vw,40px)] leading-none font-extrabold",
          tone === "in" && "text-art-green",
          tone === "out" && "text-art-red",
        )}
      >
        {money(value)}
      </p>
    </div>
  );
}

function Operator({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-poster pb-1 text-[clamp(18px,3vw,28px)] leading-none opacity-40">
      {children}
    </span>
  );
}

function CategoryRow({
  label,
  Icon,
  value,
  before,
}: {
  label: string;
  Icon: LucideIcon;
  value: number;
  before: number | undefined;
}) {
  const delta = before === undefined ? null : value - before;
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto_auto] items-center gap-x-4 rounded-[3px] py-1 text-[13px] transition-colors",
        value === 0 && "opacity-40",
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0"
          strokeWidth={1.7}
        />
        {label}
      </span>
      <span className="figures font-mono">{amount(value)}</span>
      <span
        className={cn(
          "figures w-14 text-right font-mono text-[11px]",
          delta === null || delta === 0
            ? "opacity-40"
            : delta > 0
              ? "text-art-red"
              : "text-art-green",
        )}
      >
        {delta === null || delta === 0
          ? "—"
          : `${delta > 0 ? "+" : "−"}${amount(Math.abs(delta))}`}
      </span>
    </li>
  );
}

function IncomeIcon({ label }: { label: string }) {
  const Icon =
    label === "Salary" ? Banknote : label === "Bonus" ? Gift : TrendingUp;
  return (
    <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.7} />
  );
}
