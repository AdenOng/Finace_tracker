"use client";

import Decimal from "decimal.js";
import { useState } from "react";

import { useLocale, useT } from "~/i18n/client";
import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

type Forecast = RouterOutputs["planning"]["overview"]["forecasts"][number];

const compact = new Intl.NumberFormat("en-SG", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Three or four round values spanning [min, max]. */
function niceTicks(min: number, max: number) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ??
    10 * power;
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const count = Math.min(6, Math.round((high - low) / step) + 1);
  return [...new Set(Array.from({ length: count }, (_, i) => low + i * step))];
}

export function ForecastChart({
  points,
  currency,
  events = [],
}: {
  points: Forecast["points"];
  currency?: string;
  events?: Forecast["events"];
}) {
  const t = useT();
  const locale = useLocale();
  const [active, setActive] = useState<number | null>(null);

  const valid = points.flatMap((p) =>
    p.balance === null ? [] : [{ date: p.date, balance: p.balance }],
  );
  if (!valid.length) return null;

  const numeric = valid.map((p) => Number(p.balance));
  const minVal = Math.min(...numeric);
  const maxVal = Math.max(...numeric);
  const ticks = niceTicks(minVal, maxVal);
  const yMin = ticks[0]!;
  const yMax = ticks.at(-1)!;

  const x = (index: number) =>
    valid.length <= 1 ? 100 : (index / (valid.length - 1)) * 100;
  const y = (value: number) =>
    yMax === yMin ? 50 : (1 - (value - yMin) / (yMax - yMin)) * 100;

  const path = numeric
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(3)},${y(v).toFixed(3)}`)
    .join(" ");

  const hasZeroLine = yMin <= 0 && yMax >= 0;
  const dipsBelowZero = minVal < 0;
  const focusIndex = active;
  const focus = focusIndex === null ? null : valid[focusIndex]!;
  const focusEvents = focus
    ? events.filter((e) => e.date === focus.date)
    : [];

  const formatVal = (val: string) =>
    currency ? formatMoney(val, currency) : new Decimal(val).toFixed(2);

  function nearest(clientX: number, rect: DOMRect) {
    if (rect.width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (valid.length - 1));
  }

  return (
    <figure className="my-5">
      <div className="flex gap-3">
        {/* Y-axis ticks, masked under amount privacy */}
        <div className="figures text-ink-3 relative h-40 w-12 shrink-0 text-right text-[11px] tabular-nums">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${y(tick)}%` }}
            >
              <span className="sensitive">{compact.format(tick)}</span>
            </span>
          ))}
        </div>
        <div
          className="relative h-40 min-w-0 flex-1 touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-art-cobalt)]"
          tabIndex={0}
          role="group"
          aria-label={t.planning.cashFlowView.chartDescription(
            formatDate(valid[0]!.date, locale),
            formatDate(valid.at(-1)!.date, locale),
            formatVal(valid[0]!.balance),
            formatVal(valid.at(-1)!.balance),
          )}
          onPointerMove={(e) =>
            setActive(
              nearest(e.clientX, e.currentTarget.getBoundingClientRect()),
            )
          }
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            const last = valid.length - 1;
            if (e.key === "Home" || e.key === "End") {
              e.preventDefault();
              setActive(e.key === "Home" ? 0 : last);
              return;
            }
            if (e.key === "Escape") return setActive(null);
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const step = e.key === "ArrowLeft" ? -1 : 1;
            setActive((i) =>
              Math.min(
                last,
                Math.max(0, (i ?? last) + (i === null ? 0 : step)),
              ),
            );
          }}
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden="true"
              className="bg-line absolute inset-x-0 h-px"
              style={{ top: `${y(tick)}%` }}
            />
          ))}

          {hasZeroLine ? (
            <div
              aria-hidden="true"
              data-zero-line="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 border-t border-dashed",
                dipsBelowZero ? "border-loss/70" : "border-ink-3/60",
              )}
              style={{ top: `${y(0)}%` }}
            >
              <span
                className={cn(
                  "bg-surface absolute -top-2.5 right-0 px-1 font-mono text-[10px] font-semibold",
                  dipsBelowZero ? "text-loss" : "text-ink-3",
                )}
              >
                {t.planning.cashFlowView.zeroLine}
              </span>
            </div>
          ) : null}

          <svg
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path
              d={path}
              fill="none"
              stroke="var(--color-art-cobalt)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {focusIndex !== null && focus ? (
            <>
              <div
                aria-hidden="true"
                className="bg-ink-3 absolute inset-y-0 w-px"
                style={{ left: `${x(focusIndex)}%` }}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_var(--color-surface)]",
                  new Decimal(focus.balance).isNegative()
                    ? "bg-loss"
                    : "bg-[var(--color-art-cobalt)]",
                )}
                style={{
                  left: `${x(focusIndex)}%`,
                  top: `${y(Number(focus.balance))}%`,
                }}
              />
              <div
                role="status"
                className={cn(
                  "card pointer-events-none absolute top-0 z-10 w-max max-w-60 px-3 py-2 text-[12px] shadow-lg",
                  x(focusIndex) > 60
                    ? "-translate-x-[calc(100%+12px)]"
                    : "translate-x-3",
                )}
                style={{ left: `${x(focusIndex)}%` }}
              >
                <p className="text-ink-2">{formatDate(focus.date, locale)}</p>
                <p
                  className={cn(
                    "figures mt-0.5 text-[14px] font-semibold",
                    new Decimal(focus.balance).isNegative() && "text-loss",
                  )}
                >
                  <span className="sensitive">{formatVal(focus.balance)}</span>
                </p>
                {focusEvents.length > 0 ? (
                  <ul className="border-line mt-1.5 space-y-0.5 border-t pt-1 text-[11px]">
                    {focusEvents.map((ev, idx) => (
                      <li
                        key={`${ev.name}-${idx}`}
                        className="text-ink-2 flex justify-between gap-2"
                      >
                        <span className="truncate">{ev.name}</span>
                        <span className="figures sensitive shrink-0 font-mono">
                          {currency
                            ? formatMoney(ev.amount, currency, { signed: true })
                            : ev.amount}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : (
            <span
              aria-hidden="true"
              className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-art-cobalt)] shadow-[0_0_0_2px_var(--color-surface)]"
              style={{
                left: `${x(valid.length - 1)}%`,
                top: `${y(numeric.at(-1)!)}%`,
              }}
            />
          )}
        </div>
      </div>
      <figcaption className="text-ink-3 mt-2 flex justify-between pl-[3.75rem] text-[11px]">
        <span>{formatDate(valid[0]!.date, locale)}</span>
        <span>{formatDate(valid.at(-1)!.date, locale)}</span>
      </figcaption>
    </figure>
  );
}
