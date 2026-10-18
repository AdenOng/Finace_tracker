"use client";

import { CLASSES, MONTHS, SAMPLE_YEAR } from "./sample-year";

const INK = "var(--color-paper-ink)";
const PAPER = "var(--color-paper)";
const GAIN = "var(--color-art-green)";
const LOSS = "var(--color-art-red)";

const WORTH = SAMPLE_YEAR.map((m) => m.worth);

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const money = (v: number) =>
  `S$${Math.round(v).toLocaleString("en-SG", { maximumFractionDigits: 0 })}`;

// Chart geometry (page units, viewBox 400 × 520).
const X0 = 44;
const STEP = 312 / 11;
const LINE_TOP = 205;
const LINE_BOTTOM = 365;
const PAD = (Math.max(...WORTH) - Math.min(...WORTH)) * 0.15;
const MIN = Math.min(...WORTH) - PAD;
const MAX = Math.max(...WORTH) + PAD;

const x = (i: number) => X0 + i * STEP;
const y = (v: number) =>
  LINE_BOTTOM - ((v - MIN) / (MAX - MIN)) * (LINE_BOTTOM - LINE_TOP);

/**
 * The right-hand page: net worth over time, with allocation in a separate band below.
 * `write` (0–1) draws the new line segment and interpolates the allocation.
 */
export function ChartPage({ month, write }: { month: number; write: number }) {
  const data = SAMPLE_YEAR[month]!;
  const previous = SAMPLE_YEAR[month - 1];

  const shares = data.shares.map((s, i) =>
    previous ? lerp(previous.shares[i]!, s, write) : s,
  );
  let cursor = 0;
  const pie = CLASSES.map((c, i) => {
    const from = cursor;
    cursor += shares[i]!;
    return { ...c, from, to: cursor };
  });

  // Line up to last month, then this month's segment as far as it has been written.
  const tip = {
    x: month === 0 ? x(0) : lerp(x(month - 1), x(month), write),
    y:
      month === 0
        ? y(WORTH[0]!)
        : lerp(y(WORTH[month - 1]!), y(WORTH[month]!), write),
  };
  const points = [
    ...WORTH.slice(0, month).map((w, i) => `${x(i)},${y(w)}`),
    `${tip.x},${tip.y}`,
  ];
  const line = `M${points.join(" L")}`;
  const area = `${line} L${tip.x},${LINE_BOTTOM + 8} L${x(0)},${LINE_BOTTOM + 8} Z`;

  return (
    <div>
      <svg
        viewBox="0 0 400 520"
        role="img"
        aria-label={`Sample portfolio, January to ${MONTHS[month]}: net worth ${money(data.worth)}, ${data.change >= 0 ? "up" : "down"} ${money(Math.abs(data.change))} on the month.`}
        className="isolate block h-auto w-full"
      >
        {/* Masthead with the year's progress */}
        <text
          x="28"
          y="36"
          fill={INK}
          className="font-poster"
          fontSize="14"
          fontWeight="700"
        >
          Nº 01
        </text>
        <text
          x="372"
          y="35"
          fill={INK}
          textAnchor="end"
          className="figures font-mono"
          fontSize="8"
          letterSpacing="1.4"
        >
          PAGE {String(month + 1).padStart(2, "0")} OF 12
        </text>
        <line
          x1="28"
          x2="372"
          y1="46"
          y2="46"
          stroke={INK}
          strokeOpacity="0.25"
          strokeWidth="1"
        />
        <line
          x1="28"
          x2={28 + 344 * ((month + write) / 12)}
          y1="46"
          y2="46"
          stroke={INK}
          strokeWidth="2.5"
        />

        {/* Reading for the month, inked in as the page arrives */}
        <g key={month} className="animate-ink-in [animation-delay:350ms]">
          <text
            x="28"
            y="74"
            fill={INK}
            className="font-mono"
            fontSize="8.5"
            letterSpacing="1.4"
          >
            NET WORTH · {MONTHS[month]!.toUpperCase()}
          </text>
          <text
            x="26"
            y="116"
            fill={INK}
            className="font-poster figures"
            fontSize="44"
            fontWeight="800"
          >
            {money(data.worth)}
          </text>
          <text
            x="28"
            y="136"
            fill={data.change >= 0 ? GAIN : LOSS}
            className="figures font-mono"
            fontSize="10"
            fontWeight="600"
          >
            {data.change >= 0 ? "▲" : "▼"} {money(Math.abs(data.change))}
            <tspan fill={INK} fillOpacity="0.6" fontWeight="400">
              {" "}
              on {month === 0 ? "last December" : MONTHS[month - 1]}
            </tspan>
          </text>
        </g>

        <text
          x="28"
          y="176"
          fill={INK}
          fillOpacity="0.55"
          className="font-mono"
          fontSize="8"
          letterSpacing="1.2"
        >
          NET WORTH OVER TIME
        </text>
        {[LINE_TOP, (LINE_TOP + LINE_BOTTOM) / 2, LINE_BOTTOM].map((gridY) => (
          <line
            key={gridY}
            x1="36"
            x2="364"
            y1={gridY}
            y2={gridY}
            stroke={INK}
            strokeOpacity="0.1"
          />
        ))}

        {/* Net worth so far */}
        <g style={{ mixBlendMode: "multiply" }}>
          <path d={area} fill={INK} fillOpacity="0.06" />
          <path
            d={line}
            fill="none"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </g>
        <line
          x1={tip.x}
          x2={tip.x}
          y1={tip.y}
          y2={LINE_BOTTOM}
          stroke={INK}
          strokeWidth="0.8"
          strokeDasharray="2 3"
        />
        <circle
          cx={tip.x}
          cy={tip.y}
          r="5.5"
          fill={INK}
          stroke={PAPER}
          strokeWidth="2.5"
        />

        {MONTHS.map((m, i) => (
          <text
            key={m}
            x={x(i)}
            y="389"
            textAnchor="middle"
            fill={INK}
            fillOpacity={i === month ? 1 : i < month ? 0.6 : 0.25}
            className="font-mono"
            fontSize="9"
            fontWeight={i === month ? 700 : 400}
          >
            {m[0]}
          </text>
        ))}

        {/* Allocation is kept below the plot so each chart has room to breathe. */}
        <line
          x1="28"
          x2="372"
          y1="412"
          y2="412"
          stroke={INK}
          strokeOpacity="0.25"
        />
        <text
          x="28"
          y="433"
          fill={INK}
          fillOpacity="0.55"
          className="font-mono"
          fontSize="8"
          letterSpacing="1.2"
        >
          WHAT YOU OWN
        </text>
        {pie.map((c) => (
          <rect
            key={c.key}
            x={28 + c.from * 344}
            y="447"
            width={(c.to - c.from) * 344}
            height="12"
            fill={c.color}
          />
        ))}
        {CLASSES.map((c, i) => (
          <g key={c.key} transform={`translate(${28 + i * 89} 479)`}>
            <circle cx="3" cy="4" r="3" fill={c.color} />
            <text x="11" y="7" fill={INK} className="font-mono" fontSize="7.5">
              {c.label}
            </text>
            <text
              x="11"
              y="23"
              fill={INK}
              className="figures font-mono"
              fontSize="10"
              fontWeight="600"
            >
              {Math.round(data.shares[i]! * 100)}%
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
