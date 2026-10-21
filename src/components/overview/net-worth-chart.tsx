"use client";

import Decimal from "decimal.js";
import { useMemo, useState } from "react";

import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";

export type NetWorthPoint = {
  date: string;
  total: string;
  partial: boolean;
  /** Worked out from account entries, before the app recorded daily figures. */
  estimated: boolean;
};

const RANGES = [
  { key: "3m", label: "3M", months: 3 },
  { key: "1y", label: "1Y", months: 12 },
  { key: "all", label: "All", months: null },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const DAY_MS = 86_400_000;
const time = (date: string) => new Date(`${date}T00:00:00Z`).getTime();
const compact = new Intl.NumberFormat("en-SG", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function monthsBefore(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

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
  // Three intervals plus padding at both ends need at most six ticks. At large values,
  // adding `step` to the previous tick can round back to the same number forever.
  const count = Math.min(6, Math.round((high - low) / step) + 1);
  return [...new Set(Array.from({ length: count }, (_, i) => low + i * step))];
}

export function NetWorthChart({
  points,
  currency,
}: {
  points: NetWorthPoint[];
  currency: string;
}) {
  const last = points.at(-1)!;
  const span = time(last.date) - time(points[0]!.date);
  const ranges = RANGES.filter(
    (r) => r.months === null || span > r.months * 31 * DAY_MS,
  );
  const [range, setRange] = useState<RangeKey>("all");
  const [active, setActive] = useState<number | null>(null);

  const shown = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months;
    if (!months) return points;
    const from = monthsBefore(last.date, months);
    // Start from the last figure before the range so the line enters from its true level.
    const start = Math.max(0, points.findIndex((p) => p.date >= from) - 1);
    return points.slice(start);
  }, [points, range, last.date]);

  const values = shown.map((p) => Number(p.total));
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0]!;
  const yMax = ticks.at(-1)!;
  const t0 = time(shown[0]!.date);
  const t1 = time(shown.at(-1)!.date);
  const x = (p: NetWorthPoint) =>
    t1 === t0 ? 100 : ((time(p.date) - t0) / (t1 - t0)) * 100;
  const y = (value: number) =>
    yMax === yMin ? 50 : (1 - (value - yMin) / (yMax - yMin)) * 100;

  // One path per run of estimated or recorded points; each run starts where the previous ended.
  const runs: { estimated: boolean; d: string }[] = [];
  shown.forEach((p, i) => {
    const point = `${x(p).toFixed(3)},${y(values[i]!).toFixed(3)}`;
    const current = runs.at(-1);
    if (current?.estimated === p.estimated) current.d += ` L${point}`;
    else {
      const previous = shown[i - 1];
      runs.push({
        estimated: p.estimated,
        d: previous
          ? `M${x(previous).toFixed(3)},${y(values[i - 1]!).toFixed(3)} L${point}`
          : `M${point}`,
      });
    }
  });

  const first = shown[0]!;
  const change = new Decimal(last.total).minus(first.total);
  const focus = active === null ? null : shown[active];
  const anyEstimated = shown.some((p) => p.estimated);
  const firstRecorded = points.find((p) => !p.estimated);

  function nearest(clientX: number, rect: DOMRect) {
    const at = t0 + ((clientX - rect.left) / rect.width) * (t1 - t0);
    let best = 0;
    shown.forEach((p, i) => {
      if (Math.abs(time(p.date) - at) < Math.abs(time(shown[best]!.date) - at))
        best = i;
    });
    return best;
  }

  return (
    <figure className="mt-8">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <p className="text-sm">
          <span className="eyebrow mr-2">Over time</span>
          {!change.isZero() ? (
            <span
              className={cn(
                "figures font-semibold",
                change.isPositive() ? "text-gain" : "text-loss",
              )}
            >
              <span className="sensitive">
                {formatMoney(change.toFixed(2), currency, { signed: true })}
              </span>
            </span>
          ) : (
            <span className="text-ink-2">No change</span>
          )}{" "}
          <span className="text-ink-2">since {formatDate(first.date)}</span>
        </p>
        {ranges.length > 1 ? (
          <div
            className="flex gap-1"
            role="group"
            aria-label="Net worth chart range"
          >
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={range === r.key}
                onClick={() => {
                  setRange(r.key);
                  setActive(null);
                }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  range === r.key
                    ? "bg-ink text-on-brand"
                    : "text-ink-2 hover:bg-wash",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : null}
      </figcaption>

      <div className="mt-4 flex gap-3">
        {/* Y axis: round values, compact; the exact figure is in the tooltip. */}
        <div className="figures text-ink-3 relative h-40 w-10 shrink-0 text-right text-[11px] tabular-nums">
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
          aria-label={`Net worth from ${formatDate(first.date)} to ${formatDate(last.date)}: ${formatMoney(first.total, currency)} to ${formatMoney(last.total, currency)}. Use the left and right arrow keys to read each date.`}
          onPointerMove={(e) =>
            setActive(
              nearest(e.clientX, e.currentTarget.getBoundingClientRect()),
            )
          }
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const step = e.key === "ArrowLeft" ? -1 : 1;
            setActive((i) =>
              Math.min(
                shown.length - 1,
                Math.max(0, (i ?? shown.length - 1) + (i === null ? 0 : step)),
              ),
            );
          }}
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className="bg-line absolute inset-x-0 h-px"
              style={{ top: `${y(tick)}%` }}
            />
          ))}
          <svg
            aria-hidden
            className="absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {runs.map((run, i) => (
              <path
                key={i}
                d={run.d}
                fill="none"
                stroke="var(--color-art-cobalt)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={run.estimated ? "5 5" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {focus ? (
            <div
              aria-hidden
              className="bg-ink-3 absolute inset-y-0 w-px"
              style={{ left: `${x(focus)}%` }}
            />
          ) : null}
          {(focus ? [focus] : [last]).map((p) => (
            <span
              key={p.date}
              aria-hidden
              className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-art-cobalt)] shadow-[0_0_0_2px_var(--color-surface)]"
              style={{ left: `${x(p)}%`, top: `${y(Number(p.total))}%` }}
            />
          ))}
          {focus ? (
            <div
              role="status"
              className={cn(
                "card pointer-events-none absolute top-0 z-10 w-max max-w-56 px-3 py-2 text-[12px] shadow-lg",
                x(focus) > 60
                  ? "-translate-x-[calc(100%+12px)]"
                  : "translate-x-3",
              )}
              style={{ left: `${x(focus)}%` }}
            >
              <p className="text-ink-2">{formatDate(focus.date)}</p>
              <p className="figures mt-0.5 text-[14px] font-semibold">
                <span className="sensitive">
                  {formatMoney(focus.total, currency)}
                </span>
              </p>
              {focus.estimated || focus.partial ? (
                <p className="text-ink-3 mt-0.5">
                  {[
                    focus.estimated && "Estimated from your entries",
                    focus.partial && "partial total",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="text-ink-3 mt-2 flex justify-between pl-[3.25rem] text-[11px]">
        <span>{formatDate(first.date)}</span>
        <span>{formatDate(last.date)}</span>
      </div>

      {anyEstimated ? (
        <p className="text-ink-3 mt-3 text-[12px]">
          <svg
            aria-hidden
            className="mr-1.5 inline-block align-middle"
            width="18"
            height="4"
          >
            <line
              x1="1"
              y1="2"
              x2="17"
              y2="2"
              stroke="var(--color-art-cobalt)"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          Estimated from your account entries at their recorded values
          {firstRecorded
            ? `, until daily figures began on ${formatDate(firstRecorded.date)}.`
            : ". Daily figures are recorded from today."}
        </p>
      ) : null}

      <details className="mt-2 text-[12px]">
        <summary className="text-ink-3 hover:text-ink cursor-pointer">
          Show as table
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full max-w-sm">
            <thead>
              <tr className="text-ink-3 text-left">
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 text-right font-medium">Net worth</th>
              </tr>
            </thead>
            <tbody className="figures tabular-nums">
              {[...shown].reverse().map((p) => (
                <tr key={p.date} className="border-line border-t">
                  <td className="py-1">
                    {formatDate(p.date)}
                    {p.estimated ? (
                      <span className="text-ink-3"> · estimated</span>
                    ) : null}
                  </td>
                  <td className="py-1 text-right">
                    <span className="sensitive">
                      {formatMoney(p.total, currency)}
                    </span>
                    {p.partial ? (
                      <span className="text-ink-3"> · partial</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
