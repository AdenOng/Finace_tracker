"use client";

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
  return (
    <Select
      aria-label="Transaction type"
      value={value}
      onChange={(e) => onChange(e.target.value as CategoryKind | "keep")}
      disabled={disabled}
    >
      {keep ? <option value="keep">Keep existing types</option> : null}
      <option value="expense" disabled={expenseDisabled}>
        Expense
      </option>
      <option value="income" disabled={incomeDisabled}>
        Income
      </option>
      <option value="transfer">Transfer</option>
    </Select>
  );
}
