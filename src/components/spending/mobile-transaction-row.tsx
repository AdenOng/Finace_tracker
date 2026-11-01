"use client";

import Decimal from "decimal.js";

import { categoryLabel, useT, useLocale } from "~/i18n/client";
import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

export function MobileTransactionRow({
  transaction: row,
  selected,
  disabled,
  onSelect,
  onEdit,
}: {
  transaction: RouterOutputs["spending"]["list"][number];
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <li
      className={cn(
        "flex min-w-0 items-start gap-2 py-3",
        selected && "bg-brand-soft",
      )}
    >
      <label className="grid min-h-11 w-7 shrink-0 place-items-center">
        <input
          type="checkbox"
          className="accent-brand size-4"
          aria-label={t.spending.mobileTransactionRow.selectTransaction(
            row.description,
            row.postedDate,
          )}
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
        />
      </label>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 py-1 text-left"
        aria-label={t.spending.mobileTransactionRow.editTransaction(
          row.description,
        )}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-semibold">
            {row.merchant ?? row.description}
          </span>
          <span
            className={cn(
              "figures shrink-0 font-mono text-[12px] font-medium",
              new Decimal(row.amount).greaterThan(0) && "text-gain",
            )}
          >
            <span className="sensitive">
              {formatMoney(row.amount, row.currency, { signed: true })}
            </span>
          </span>
        </span>
        <span className="text-ink-3 mt-1 block truncate text-[11px]">
          {formatDate(row.postedDate, locale)} · {row.accountName}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span className="bg-wash text-ink-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5">
            {!row.isTransfer ? (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: row.categoryColor ?? "var(--color-ink-3)",
                }}
              />
            ) : null}
            <span className="truncate">
              {row.isTransfer
                ? row.transferLinkId
                  ? t.spending.mobileTransactionRow.transferLinked
                  : t.spending.mobileTransactionRow.transfer
                : row.categoryName
                  ? categoryLabel(t, row.categoryName)
                  : t.spending.mobileTransactionRow.uncategorised}
            </span>
          </span>
          <span className="text-ink-3">
            {row.reconciliationId
              ? t.spending.mobileTransactionRow.reconciled
              : row.cleared
                ? t.spending.mobileTransactionRow.cleared
                : t.spending.mobileTransactionRow.uncleared}
          </span>
        </span>
      </button>
    </li>
  );
}
