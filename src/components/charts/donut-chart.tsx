"use client";

import { useState } from "react";

import { cn } from "~/lib/cn";

export type DonutSegment = {
  key: string;
  label: string;
  /** Share of the whole, 0–100. */
  share: number;
  display: string;
  color: string;
};

/**
 * Allocation donut with a linked legend: hovering or focusing either one highlights the
 * segment and puts its value in the centre.
 */
export function DonutChart({
  segments,
  totalLabel,
  totalDisplay,
  className,
}: {
  segments: DonutSegment[];
  totalLabel: string;
  totalDisplay: string;
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  // A small gap between segments, skipped when there is only one.
  const gap = segments.length > 1 ? 1.2 : 0;

  let offset = 0;
  const arcs = segments.map((s) => {
    const length = Math.max((s.share / 100) * circumference - gap, 0.01);
    const arc = { ...s, length, offset };
    offset += (s.share / 100) * circumference;
    return arc;
  });
  const current = segments.find((s) => s.key === active);

  return (
    <div
      className={cn(
        "grid items-center gap-6 sm:grid-cols-[11rem_1fr]",
        className,
      )}
    >
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--color-sunken)"
            strokeWidth="11"
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={active === a.key ? 14 : 11}
              strokeDasharray={`${a.length} ${circumference}`}
              strokeDashoffset={-a.offset}
              opacity={active && active !== a.key ? 0.35 : 1}
              className="cursor-pointer transition-[stroke-width,opacity] duration-150"
              onPointerEnter={() => setActive(a.key)}
              onPointerLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="eyebrow text-[10px]">
              {current ? current.label : totalLabel}
            </p>
            <p className="figures mt-1 font-mono text-[15px] font-semibold">
              {current ? `${current.share.toFixed(1)}%` : totalDisplay}
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-1">
        {segments.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onPointerEnter={() => setActive(s.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive(null)}
              className={cn(
                "rounded-ctl flex w-full items-center gap-3 px-2 py-1.5 text-left text-sm transition-colors",
                active === s.key ? "bg-wash" : "hover:bg-wash/60",
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: s.color }}
              />
              <span className="text-ink-2 flex-1">{s.label}</span>
              <span className="figures font-mono text-[13px]">{s.display}</span>
              <span className="figures text-ink-3 w-12 text-right font-mono text-[12px]">
                {s.share.toFixed(1)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
