"use client";

import Decimal from "decimal.js";
import { Section } from "~/components/ui/panel";
import { useLocale, useT } from "~/i18n/client";
import { cn } from "~/lib/cn";
import { formatDate, formatQuantity } from "~/lib/format";
import { RowAmount, RowControl, SelectAll } from "./row-controls";
import { money, type RowOf } from "./types";

export function BalanceSection({
  rows,
  asOf,
  disabled,
  onDecision,
}: {
  rows: RowOf<"cash_balance">[];
  asOf: string;
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  const locale = useLocale();
  if (rows.length === 0) return null;
  return (
    <Section
      title={t.imports.importReview.closingBalance}
      description={t.imports.importReview.savedAsTheAccountsBalance}
    >
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
          <RowControl
            row={r}
            checked={r.decision === "accept"}
            disabled={disabled}
            label={
              r.data.bucket
                ? t.imports.importReview.saveBucket(
                    t.common.cpfBuckets[r.data.bucket],
                  )
                : t.imports.importReview.saveTheClosingBalance
            }
            onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
          />
          <span>
            {t.imports.importReview.recordBefore}{" "}
            <span className="figures font-mono font-semibold">
              <RowAmount row={r} disabled={disabled} />
            </span>{" "}
            {t.imports.importReview.recordAfter(
              r.data.bucket ? t.common.cpfBuckets[r.data.bucket] : null,
              asOf
                ? formatDate(asOf, locale)
                : t.imports.importReview.statementDate,
            )}
          </span>
        </div>
      ))}
    </Section>
  );
}

export function HoldingsSection({
  positions,
  cash,
  disabled,
  onDecision,
}: {
  positions: RowOf<"position">[];
  cash: RowOf<"cash_balance">[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  const all = [...positions, ...cash];
  return (
    <Section
      title={t.imports.importReview.holdings(positions.length)}
      description={t.imports.importReview.savedTogetherAsWhatThe}
      actions={
        <SelectAll rows={all} disabled={disabled} onDecision={onDecision} />
      }
    >
      {all.length === 0 ? (
        <p className="text-ink-2 text-sm">
          {t.imports.importReview.noHoldingsOrCashWere}
        </p>
      ) : (
        <ul className="-mx-1">
          {positions.map((r) => (
            <li
              key={r.id}
              className={cn(
                "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-1 py-3",
                r.decision !== "accept" && "opacity-50",
              )}
            >
              <RowControl
                row={r}
                checked={r.decision === "accept"}
                disabled={disabled}
                label={t.imports.importReview.saveSymbol(r.data.symbol)}
                onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
              />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">
                  {r.data.symbol}
                  {r.data.exchange ? (
                    <span className="text-ink-3 ml-1.5 text-[12px] font-normal">
                      {r.data.exchange}
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-3 block truncate text-[12px]">
                  {[
                    t.common.assetClasses[r.data.assetClass],
                    r.data.name,
                    `${formatQuantity(r.data.quantity)}${r.data.price ? ` × ${money(r.data.price, r.data.currency)}` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="figures text-right font-mono text-[13px] font-semibold">
                {r.data.value
                  ? money(r.data.value, r.data.currency)
                  : r.data.price
                    ? money(
                        new Decimal(r.data.quantity).times(r.data.price),
                        r.data.currency,
                      )
                    : t.imports.importReview.noPrice}
              </span>
            </li>
          ))}
          {cash.map((r) => (
            <li
              key={r.id}
              className={cn(
                "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-1 py-3 last:border-b-0",
                r.decision !== "accept" && "opacity-50",
              )}
            >
              <RowControl
                row={r}
                checked={r.decision === "accept"}
                disabled={disabled}
                label={t.imports.importReview.saveCash(r.data.currency)}
                onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
              />
              <span className="text-[14px] font-semibold">
                {t.imports.importReview.cash(r.data.currency)}
              </span>
              <span className="figures text-right font-mono text-[13px] font-semibold">
                <RowAmount row={r} disabled={disabled} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
