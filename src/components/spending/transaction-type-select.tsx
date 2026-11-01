"use client";

import { useT } from "~/i18n/client";
import { Select } from "~/components/ui/field";
import type { CategoryKind } from "~/lib/categories";

export function TransactionTypeSelect({
  value,
  onChange,
  disabled,
  expenseDisabled,
  incomeDisabled,
  keep,
}: {
  value: CategoryKind | "keep";
  onChange: (value: CategoryKind | "keep") => void;
  disabled?: boolean;
  expenseDisabled?: boolean;
  incomeDisabled?: boolean;
  keep?: boolean;
}) {
  const t = useT();
  return (
    <Select
      aria-label={t.spending.transactionTypeSelect.transactionType}
      value={value}
      onChange={(e) => onChange(e.target.value as CategoryKind | "keep")}
      disabled={disabled}
    >
      {keep ? (
        <option value="keep">
          {t.spending.transactionTypeSelect.keepExistingTypes}
        </option>
      ) : null}
      <option value="expense" disabled={expenseDisabled}>
        {t.spending.transactionTypeSelect.expense}
      </option>
      <option value="income" disabled={incomeDisabled}>
        {t.spending.transactionTypeSelect.income}
      </option>
      <option value="transfer">
        {t.spending.transactionTypeSelect.transfer}
      </option>
    </Select>
  );
}
