"use client";

import Decimal from "decimal.js";
import { Section } from "~/components/ui/panel";
import { useLocale, useT } from "~/i18n/client";
import { cn } from "~/lib/cn";
import { formatDate, formatQuantity } from "~/lib/format";
import {
  DuplicateDecision,
  MatchTag,
  RowAmount,
  RowControl,
  SelectAll,
} from "./row-controls";
import { activityLabels, money, type RowOf } from "./types";

export function ActivitySection({
  rows,
  disabled,
  onDecision,
}: {
  rows: RowOf<"investment_transaction">[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  const locale = useLocale();
  if (rows.length === 0) return null;
  return (
    <Section
      title={t.imports.importReview.activity(rows.length)}
      description={t.imports.importReview.buysSellsDividendsFeesAnd}
      actions={
        <SelectAll rows={rows} disabled={disabled} onDecision={onDecision} />
      }
    >
      <ul className="-mx-1">
        {rows.map((r) => (
          <li
            key={r.id}
            className={cn(
              "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-1 py-3 last:border-b-0",
              r.decision === "skip" && "opacity-50",
              r.decision === "pending" && "bg-warn-wash",
            )}
          >
            <RowControl
              row={r}
              checked={r.decision === "accept"}
              disabled={disabled}
              label={t.imports.importReview.saveActivity(
                activityLabels(t)[r.data.type] ?? r.data.type,
                r.data.symbol,
              )}
              onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
            />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold">
                {activityLabels(t)[r.data.type]}
                {r.data.symbol ? ` · ${r.data.symbol}` : ""}
              </span>
              <span className="text-ink-3 block truncate text-[12px]">
                {[
                  formatDate(r.data.tradeDate, locale),
                  r.data.quantity && r.data.price
                    ? `${formatQuantity(r.data.quantity)} × ${money(r.data.price, r.data.currency)}`
                    : null,
                  r.data.description,
                  r.data.reference
                    ? t.imports.importReview.ref(r.data.reference)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="mt-1 flex gap-1">
                <MatchTag status={r.matchStatus} />
              </span>
              <DuplicateDecision
                row={r}
                disabled={disabled}
                onDecision={onDecision}
              />
            </span>
            <span
              className={cn(
                "figures text-right font-mono text-[13px] font-semibold",
                new Decimal(r.data.amount).isPositive() && "text-gain",
              )}
            >
              <RowAmount row={r} disabled={disabled} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
