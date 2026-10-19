import Decimal from "decimal.js";

import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

export function MobileTransactionRow({
  transaction: t,
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
          aria-label={`Select ${t.description} on ${t.postedDate}`}
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
        />
      </label>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 py-1 text-left"
        aria-label={`Edit ${t.description}`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-semibold">
            {t.merchant ?? t.description}
          </span>
          <span
            className={cn(
              "figures shrink-0 font-mono text-[12px] font-medium",
              new Decimal(t.amount).greaterThan(0) && "text-gain",
            )}
          >
            {formatMoney(t.amount, t.currency, { signed: true })}
          </span>
        </span>
        <span className="text-ink-3 mt-1 block truncate text-[11px]">
          {formatDate(t.postedDate)} · {t.accountName}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span className="bg-wash text-ink-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5">
            {!t.isTransfer ? (
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: t.categoryColor ?? "var(--color-ink-3)",
                }}
              />
            ) : null}
            <span className="truncate">
              {t.isTransfer ? "Transfer" : (t.categoryName ?? "Uncategorised")}
            </span>
          </span>
          <span className="text-ink-3">
            {t.reconciliationId
              ? "Reconciled"
              : t.cleared
                ? "Cleared"
                : "Uncleared"}
          </span>
        </span>
      </button>
    </li>
  );
}
