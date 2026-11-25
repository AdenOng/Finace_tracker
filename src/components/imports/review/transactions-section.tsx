"use client";

import Decimal from "decimal.js";
import { useMemo } from "react";
import { TransactionTypeSelect } from "~/components/spending/transaction-type-select";
import { Combobox } from "~/components/ui/combobox";
import { Section, Tag } from "~/components/ui/panel";
import { categoryLabel, useLocale, useT } from "~/i18n/client";
import { orderCategories } from "~/lib/categories";
import { cn } from "~/lib/cn";
import { transactionType } from "~/lib/transaction-classification";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  AmountWarning,
  DuplicateDecision,
  MatchTag,
  RowAmount,
  RowControl,
  SelectAll,
} from "./row-controls";
import { money, shortDate, type RowOf } from "./types";

export function TransactionsSection({
  rows,
  disabled,
  onDecision,
  onCategory,
  onTransfer,
}: {
  rows: RowOf<"transaction">[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
  onCategory: (rowId: string, categoryId: string | null) => void;
  onTransfer: (rowId: string, isTransfer: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const ordered = useMemo(() => orderCategories(categories), [categories]);
  const currencies = [...new Set(rows.map((r) => r.data.currency))];
  const sum = (currency: string, sign: 1 | -1) =>
    rows
      .filter(
        (r) =>
          r.decision === "accept" &&
          r.data.currency === currency &&
          !r.data.isTransfer &&
          new Decimal(r.data.amount).isPositive() === sign > 0,
      )
      .reduce((acc, r) => acc.plus(r.data.amount), new Decimal(0))
      .abs();

  return (
    <Section
      title={t.imports.importReview.transactions(rows.length)}
      description={
        !disabled && rows.length > 0
          ? t.imports.importReview.totals(
              currencies
                .map((currency) => money(sum(currency, 1), currency))
                .join(" · "),
              currencies
                .map((currency) => money(sum(currency, -1), currency))
                .join(" · "),
            )
          : undefined
      }
      actions={
        <SelectAll rows={rows} disabled={disabled} onDecision={onDecision} />
      }
    >
      {rows.length === 0 ? (
        <p className="text-ink-2 text-sm">
          {t.imports.importReview.noTransactionsWereFound}
        </p>
      ) : (
        <ul className="-mx-1">
          {rows.map((r) => {
            const amount = new Decimal(r.data.amount);
            const skipped = r.decision === "skip";
            return (
              <li
                key={r.id}
                className={cn(
                  "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border-b px-1 py-3 last:border-b-0 sm:grid-cols-[auto_4.5rem_minmax(0,1fr)_12rem_auto] sm:items-center",
                  skipped && "opacity-50",
                  r.decision === "pending" && "bg-warn-wash",
                )}
              >
                <span className="pt-0.5 sm:pt-0">
                  <RowControl
                    row={r}
                    checked={r.decision === "accept"}
                    disabled={disabled}
                    label={t.imports.importReview.saveRow(r.data.description)}
                    onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
                  />
                </span>
                <span className="figures text-ink-3 hidden font-mono text-[12px] sm:block">
                  {shortDate(r.data.postedDate, locale)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">
                    {r.data.merchant ?? r.data.description}
                  </span>
                  <span className="text-ink-3 block truncate text-[12px]">
                    <span className="sm:hidden">
                      {shortDate(r.data.postedDate, locale)}
                      {r.data.merchant ? " · " : ""}
                    </span>
                    {r.data.merchant ? r.data.description : null}
                    {r.data.reference
                      ? t.imports.importReview.reference(r.data.reference)
                      : null}
                    {r.data.originalAmount && r.data.originalCurrency
                      ? ` · ${money(r.data.originalAmount, r.data.originalCurrency)}`
                      : null}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.data.isTransfer ? (
                      <Tag>{t.imports.importReview.transfer}</Tag>
                    ) : null}
                    <MatchTag status={r.matchStatus} />
                    {r.data.signMismatch ? (
                      <Tag tone="warn">
                        {t.imports.importReview.checkAmountdirection}
                      </Tag>
                    ) : null}
                  </span>
                  <AmountWarning row={r} disabled={disabled} />
                  <DuplicateDecision
                    row={r}
                    disabled={disabled}
                    onDecision={onDecision}
                  />
                  <span className="mt-2 block sm:hidden">
                    <CategoryPicker
                      row={r}
                      categories={ordered}
                      disabled={disabled}
                      onCategory={onCategory}
                      onTransfer={onTransfer}
                    />
                  </span>
                </span>
                <span className="hidden sm:block">
                  <CategoryPicker
                    row={r}
                    categories={ordered}
                    disabled={disabled}
                    onCategory={onCategory}
                    onTransfer={onTransfer}
                  />
                </span>
                <span
                  className={cn(
                    "figures text-right font-mono text-[13px] font-semibold",
                    amount.isPositive() && "text-gain",
                  )}
                >
                  <RowAmount row={r} disabled={disabled} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function CategoryPicker({
  row,
  categories,
  disabled,
  onCategory,
  onTransfer,
}: {
  row: RowOf<"transaction">;
  categories: RouterOutputs["catalog"]["categories"];
  disabled: boolean;
  onCategory: (rowId: string, categoryId: string | null) => void;
  onTransfer: (rowId: string, isTransfer: boolean) => void;
}) {
  const t = useT();
  const options = useMemo(
    () => [
      { value: "", label: t.imports.importReview.uncategorised },
      ...categories.map((c) => ({
        value: c.id,
        label: c.parentId
          ? `— ${categoryLabel(t, c.name)}`
          : categoryLabel(t, c.name),
        keywords: c.name,
      })),
    ],
    [categories, t],
  );
  return (
    <span className="grid gap-1">
      <TransactionTypeSelect
        value={transactionType(row.data.amount, row.data.isTransfer)}
        disabled={disabled}
        expenseDisabled={new Decimal(row.data.amount).isPositive()}
        incomeDisabled={!new Decimal(row.data.amount).isPositive()}
        onChange={(value) => onTransfer(row.id, value === "transfer")}
      />
      <Combobox
        compact
        aria-label={t.imports.importReview.category}
        value={row.data.categoryId ?? ""}
        disabled={disabled}
        options={options}
        onChange={(val) => onCategory(row.id, val || null)}
      />
    </span>
  );
}
