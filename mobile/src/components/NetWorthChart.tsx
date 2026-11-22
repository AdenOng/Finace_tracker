import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Decimal from "decimal.js";
import Svg, { Line, Path } from "react-native-svg";
import { formatDate } from "../utils/labels";
import { money } from "../utils/money";
import { shiftMonth } from "../utils/server";
import { colors, Eyebrow, styles } from "./ui";

type Point = {
  date: string;
  total: string;
  partial: boolean;
  estimated: boolean;
  backfilled: boolean;
};

const ranges = [
  { label: "3M", months: 3 },
  { label: "1Y", months: 12 },
  { label: "All", months: 0 },
];

function startOfRange(date: string, months: number) {
  const month = shiftMonth(date.slice(0, 7), -months);
  const [year, index] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, index!, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(date.slice(8)), lastDay)).padStart(2, "0")}`;
}

const kindOf = (p: Point) =>
  p.backfilled ? "backfilled" : p.estimated ? "estimated" : "recorded";

export function NetWorthChart({
  history,
  current,
  date,
  currency,
}: {
  history: Point[];
  current: Pick<Point, "total" | "partial"> | null;
  date: string;
  currency: string;
}) {
  const [months, setMonths] = useState(0);
  const points = history.filter((p) => p.date < date);
  if (current)
    points.push({ ...current, date, estimated: false, backfilled: false });
  if (points.length < 2)
    return (
      <Text style={styles.muted}>
        Not enough net worth history to chart yet.
      </Text>
    );

  const last = points.at(-1)!;
  const options = ranges.filter(
    (range) =>
      !range.months || points[0]!.date < startOfRange(last.date, range.months),
  );
  const selected = options.some((range) => range.months === months)
    ? months
    : 0;
  const start = selected
    ? points.findIndex((p) => p.date >= startOfRange(last.date, selected)) - 1
    : 0;
  // Keep the point just before the cutoff so sparse history still shows its change.
  const shown = points.slice(start);
  const first = shown[0]!;
  const values = shown.map((p) => new Decimal(p.total));
  const min = values.reduce((a, b) => Decimal.min(a, b));
  const max = values.reduce((a, b) => Decimal.max(a, b));
  const span = max.minus(min);
  const startTime = Date.parse(first.date);
  const duration = Date.parse(last.date) - startTime;
  const coordinates = shown.map((p, i) => {
    const x = 3 + ((Date.parse(p.date) - startTime) / duration) * 314;
    const y = span.isZero()
      ? 60
      : 116 - values[i]!.minus(min).div(span).toNumber() * 112;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const runs: { kind: ReturnType<typeof kindOf>; path: string }[] = [];
  for (let i = 1; i < shown.length; i++) {
    const kind = kindOf(shown[i - 1]!);
    const previous = runs.at(-1);
    if (previous?.kind === kind) previous.path += ` L${coordinates[i]}`;
    else runs.push({ kind, path: `M${coordinates[i - 1]} L${coordinates[i]}` });
  }

  return (
    <View style={{ gap: 6, marginTop: 8 }}>
      <Eyebrow>Net worth over time</Eyebrow>
      {options.length > 1 && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {options.map(({ label, months }) => (
            <Pressable
              key={months}
              accessibilityRole="button"
              accessibilityLabel={
                months === 3
                  ? "3 months"
                  : months === 12
                    ? "1 year"
                    : "All time"
              }
              accessibilityState={{ selected: months === selected }}
              onPress={() => setMonths(months)}
              style={{
                minWidth: 48,
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: months === selected ? colors.wash : undefined,
              }}
            >
              <Text style={styles.strong}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={styles.muted}>{money(max, currency)}</Text>
      <Svg
        width="100%"
        height={120}
        viewBox="0 0 320 120"
        preserveAspectRatio="none"
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Net worth from ${money(first.total, currency)} on ${formatDate(first.date)} to ${money(last.total, currency)} on ${formatDate(last.date)}`}
      >
        {[4, 60, 116].map((y) => (
          <Line key={y} x1={3} x2={317} y1={y} y2={y} stroke={colors.line2} />
        ))}
        {runs.map(({ kind, path }, i) => (
          <Path
            key={i}
            d={path}
            fill="none"
            stroke={colors.cobalt}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={
              kind === "backfilled"
                ? "1 4"
                : kind === "estimated"
                  ? "5 4"
                  : undefined
            }
          />
        ))}
      </Svg>
      {!span.isZero() && (
        <Text style={styles.muted}>{money(min, currency)}</Text>
      )}
      <View style={styles.row}>
        <Text style={styles.muted}>{formatDate(first.date)}</Text>
        <Text style={styles.muted}>{formatDate(last.date)}</Text>
      </View>
      {runs.some((run) => run.kind === "estimated") && (
        <Text style={styles.muted}>Dashed lines show estimated balances.</Text>
      )}
      {runs.some((run) => run.kind === "backfilled") && (
        <Text style={styles.muted}>
          Dotted lines use first known balances for earlier dates.
        </Text>
      )}
      {shown.some((p) => p.partial) && (
        <Text style={styles.warn}>
          Some balances exclude holdings or currencies that could not be valued.
        </Text>
      )}
    </View>
  );
}
