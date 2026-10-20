"use client";

import Decimal from "decimal.js";
import { useMemo, useState } from "react";

import { EmptyState, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Usage = RouterOutputs["admin"]["ai"]["usage"];
type Price = Usage["providers"][number];

const integer = new Intl.NumberFormat("en-SG");
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function cost(price: Price | undefined, input: number, output: number) {
  if (!price?.inputCostPerMTok && !price?.outputCostPerMTok) return null;
  return new Decimal(price.inputCostPerMTok ?? 0)
    .times(input)
    .plus(new Decimal(price.outputCostPerMTok ?? 0).times(output))
    .dividedBy(1_000_000);
}

function DailyChart({ usage }: { usage: Usage }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const totals = new Map<string, { tokens: number; jobs: number }>();
    for (const row of usage.daily) {
      const t = totals.get(row.day) ?? { tokens: 0, jobs: 0 };
      t.tokens += row.inputTokens + row.outputTokens;
      t.jobs += row.jobs;
      totals.set(row.day, t);
    }
    const start = new Date(usage.since);
    return Array.from({ length: usage.days }, (_, i) => {
      const day = new Date(start.getTime() + i * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return { day, ...(totals.get(day) ?? { tokens: 0, jobs: 0 }) };
    });
  }, [usage]);
  const peak = Math.max(1, ...days.map((d) => d.tokens));
  const total = days.reduce((n, d) => n + d.tokens, 0);
  const shown = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-ink-2 text-[13px]" aria-live="polite">
          {shown ? (
            <>
              <span className="text-ink font-semibold">
                {formatDate(shown.day)}
              </span>{" "}
              · {integer.format(shown.tokens)} tokens · {shown.jobs} job
              {shown.jobs === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <span className="text-ink font-semibold">
                {compact.format(total)} tokens
              </span>{" "}
              over {usage.days} days. Hover a day for detail.
            </>
          )}
        </p>
        <p className="text-ink-3 text-[12px]">
          Peak {compact.format(peak === 1 ? 0 : peak)}
        </p>
      </div>
      <div
        className="border-line flex h-40 items-end gap-[2px] border-b"
        role="img"
        aria-label={`Tokens used per day over the last ${usage.days} days, ${integer.format(total)} in total. The table below has the figures.`}
        onMouseLeave={() => setHover(null)}
      >
        {days.map((d, i) => (
          <div
            key={d.day}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
          >
            <div
              className={cn(
                "w-full rounded-t-[4px] transition-opacity",
                d.tokens ? "bg-brand" : "bg-line",
                hover !== null && hover !== i && "opacity-50",
              )}
              style={{
                height: d.tokens
                  ? `${Math.max(3, (d.tokens / peak) * 100)}%`
                  : 2,
              }}
            />
          </div>
        ))}
      </div>
      <div className="text-ink-3 mt-1 flex justify-between text-[12px]">
        <span>{formatDate(days[0]!.day)}</span>
        <span>{formatDate(days.at(-1)!.day)}</span>
      </div>
    </div>
  );
}

export function AiUsage() {
  const [usage] = api.admin.ai.usage.useSuspenseQuery({ days: 30 });
  const prices = useMemo(
    () => new Map(usage.providers.map((p) => [p.id, p])),
    [usage.providers],
  );
  const month = usage.month;
  const byProvider = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        jobs: number;
        input: number;
        output: number;
        id: string | null;
      }
    >();
    for (const row of month) {
      const key = row.providerId ?? "none";
      const entry = map.get(key) ?? {
        id: row.providerId,
        name: row.providerId
          ? (prices.get(row.providerId)?.name ?? "Deleted provider")
          : "Not recorded",
        jobs: 0,
        input: 0,
        output: 0,
      };
      entry.jobs += row.jobs;
      entry.input += row.inputTokens;
      entry.output += row.outputTokens;
      map.set(key, entry);
    }
    return [...map.values()].sort(
      (a, b) => b.input + b.output - (a.input + a.output),
    );
  }, [month, prices]);
  const monthCost = byProvider.reduce<Decimal | null>((acc, p) => {
    const c = p.id ? cost(prices.get(p.id), p.input, p.output) : null;
    return c ? (acc ?? new Decimal(0)).plus(c) : acc;
  }, null);
  const monthName = new Intl.DateTimeFormat("en-SG", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date());

  if (usage.daily.length === 0 && month.length === 0) {
    return (
      <EmptyState title="No usage yet">
        Token counts appear here once statements have been read.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title={`${monthName} so far`}
        description={
          monthCost
            ? `Estimated cost ${formatMoney(monthCost.toFixed(2), "USD")} from the list prices you entered. Your provider's bill is the source of truth.`
            : "Add list prices to a provider (Edit → Cost & limits) to see estimated cost."
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th className="text-right">Jobs</Th>
              <Th className="text-right">Input tokens</Th>
              <Th className="text-right">Output tokens</Th>
              <Th className="text-right">Est. cost</Th>
              <Th>Monthly limit</Th>
            </tr>
          </thead>
          <tbody>
            {byProvider.map((p) => {
              const price = p.id ? prices.get(p.id) : undefined;
              const c = cost(price, p.input, p.output);
              const used = p.input + p.output;
              const share = price?.monthlyTokenLimit
                ? used / price.monthlyTokenLimit
                : null;
              return (
                <Tr key={p.id ?? "none"}>
                  <Td className="font-medium">{p.name}</Td>
                  <Td className="figures text-right">
                    {integer.format(p.jobs)}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(p.input)}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(p.output)}
                  </Td>
                  <Td className="figures text-right">
                    {c ? formatMoney(c.toFixed(2), "USD") : "—"}
                  </Td>
                  <Td>
                    {share === null ? (
                      <span className="text-ink-3">None</span>
                    ) : (
                      <Tag
                        tone={
                          share >= 1
                            ? "loss"
                            : share >= 0.8
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {Math.round(share * 100)}% of{" "}
                        {compact.format(price!.monthlyTokenLimit!)}
                      </Tag>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Tokens per day"
        description="Input and output tokens together, last 30 days (UTC)."
      >
        <DailyChart usage={usage} />
      </Section>

      <Section title="By model, last 30 days">
        <Table>
          <thead>
            <tr>
              <Th>Model</Th>
              <Th>Provider</Th>
              <Th className="text-right">Jobs</Th>
              <Th className="text-right">Avg tokens per job</Th>
              <Th className="text-right">Total tokens</Th>
            </tr>
          </thead>
          <tbody>
            {Object.values(
              usage.daily.reduce<
                Record<
                  string,
                  {
                    model: string;
                    provider: string;
                    jobs: number;
                    tokens: number;
                  }
                >
              >((acc, row) => {
                const key = `${row.providerId ?? "none"}|${row.model ?? "?"}`;
                const entry = (acc[key] ??= {
                  model: row.model ?? "Unknown",
                  provider: row.providerId
                    ? (prices.get(row.providerId)?.name ?? "Deleted provider")
                    : "Not recorded",
                  jobs: 0,
                  tokens: 0,
                });
                entry.jobs += row.jobs;
                entry.tokens += row.inputTokens + row.outputTokens;
                return acc;
              }, {}),
            )
              .sort((a, b) => b.tokens - a.tokens)
              .map((m) => (
                <Tr key={`${m.provider}-${m.model}`}>
                  <Td className="font-medium break-all">{m.model}</Td>
                  <Td className="text-ink-2">{m.provider}</Td>
                  <Td className="figures text-right">
                    {integer.format(m.jobs)}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(Math.round(m.tokens / Math.max(1, m.jobs)))}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(m.tokens)}
                  </Td>
                </Tr>
              ))}
          </tbody>
        </Table>
      </Section>
    </div>
  );
}
