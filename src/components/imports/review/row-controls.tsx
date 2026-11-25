"use client";

import Decimal from "decimal.js";
import { Trash2 } from "lucide-react";
import { createContext, useContext, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/field";
import { Tag } from "~/components/ui/panel";
import { useT } from "~/i18n/client";
import { moneyInput } from "~/server/api/inputs";

import { activityLabels, money, type Row, type RowOf } from "./types";

export const RowControls = createContext<{
  completed: boolean;
  canRemove: boolean;
  onRemove: (row: Row) => void;
  editingAmount: string | null;
  setEditingAmount: (id: string | null) => void;
  onAmount: (id: string, amount: string) => void;
  onConfirmAmount: (id: string) => void;
}>({
  completed: false,
  canRemove: false,
  onRemove: () => undefined,
  editingAmount: null,
  setEditingAmount: () => undefined,
  onAmount: () => undefined,
  onConfirmAmount: () => undefined,
});

export function RowControl({
  row,
  ...props
}: {
  row: Row;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const t = useT();
  const controls = useContext(RowControls);
  if (!controls.completed)
    return (
      <Toggle {...props} disabled={props.disabled || !controls.canRemove} />
    );
  if (row.removed) return <Tag>{t.imports.importReview.removed}</Tag>;
  if (!row.committedRecordId)
    return <Tag>{t.imports.importReview.excluded}</Tag>;
  return (
    <button
      type="button"
      aria-label={t.imports.importReview.remove(props.label)}
      title={
        controls.canRemove
          ? t.imports.importReview.reviewRemoval
          : t.imports.importReview.restoreTheOriginalAccountToText
      }
      disabled={!controls.canRemove}
      onClick={() => controls.onRemove(row)}
      className="text-loss hover:bg-wash rounded-ctl grid size-10 shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-ink size-4 shrink-0 cursor-pointer disabled:cursor-default"
    />
  );
}

export function SelectAll({
  rows,
  disabled,
  onDecision,
}: {
  rows: Row[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  if (disabled || rows.length < 2) return null;
  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          onDecision(
            rows.filter((r) => r.decision !== "accept").map((r) => r.id),
            "accept",
          )
        }
      >
        {t.imports.importReview.all}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          onDecision(
            rows.filter((r) => r.decision !== "skip").map((r) => r.id),
            "skip",
          )
        }
      >
        {t.imports.importReview.none}
      </Button>
    </div>
  );
}

export function MatchTag({ status }: { status: Row["matchStatus"] }) {
  const t = useT();
  if (status === "duplicate")
    return <Tag tone="outline">{t.imports.importReview.alreadyRecorded}</Tag>;
  if (status === "possible_duplicate")
    return <Tag tone="warn">{t.imports.importReview.similarOneRecorded}</Tag>;
  return null;
}

export function DuplicateDecision({
  row,
  disabled,
  onDecision,
}: {
  row: Row;
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  if (disabled || row.matchStatus !== "possible_duplicate") return null;
  return (
    <span className="mt-2 flex items-center gap-2">
      {row.decision === "pending" ? (
        <Tag tone="warn">{t.imports.importReview.needsDecision}</Tag>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={row.decision === "accept"}
        onClick={() => onDecision([row.id], "accept")}
      >
        {t.imports.importReview.keep}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={row.decision === "skip"}
        onClick={() => onDecision([row.id], "skip")}
      >
        {t.imports.importReview.skip}
      </Button>
    </span>
  );
}

export function AmountWarning({
  row,
  disabled,
}: {
  row: RowOf<"transaction">;
  disabled: boolean;
}) {
  const t = useT();
  const controls = useContext(RowControls);
  const data = row.data;
  if (!data.signMismatch) return null;
  const direction =
    data.printedDirection === "credit"
      ? "CR "
      : data.printedDirection === "debit"
        ? "DR "
        : "";
  return (
    <span className="text-warn mt-1 block text-[12px]">
      {t.imports.importReview.printed(
        direction,
        data.printedAmount ?? new Decimal(data.amount).abs().toFixed(),
      )}
      {!disabled ? (
        <span className="mt-1 flex flex-wrap gap-1">
          {data.suggestedAmount !== null ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => controls.onAmount(row.id, data.suggestedAmount!)}
            >
              {t.imports.importReview.useAmount(
                money(data.suggestedAmount, data.currency, true),
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => controls.onConfirmAmount(row.id)}
          >
            {t.imports.importReview.confirmCurrentAmount}
          </Button>
        </span>
      ) : null}
    </span>
  );
}

export function RowAmount({
  row,
  disabled,
}: {
  row:
    | RowOf<"transaction">
    | RowOf<"cash_balance">
    | RowOf<"investment_transaction">;
  disabled: boolean;
}) {
  const t = useT();
  const controls = useContext(RowControls);
  const [draft, setDraft] = useState(row.data.amount);
  const editing = controls.editingAmount === row.id;
  const valid = moneyInput.safeParse(draft).success;
  const label =
    row.kind === "transaction"
      ? row.data.description
      : row.kind === "cash_balance"
        ? t.imports.importReview.balanceLabel(
            row.data.currency,
            row.data.bucket ? t.common.cpfBuckets[row.data.bucket] : null,
          )
        : t.imports.importReview.activityLabel(
            activityLabels(t)[row.data.type] ?? row.data.type,
            row.data.symbol,
          );
  return (
    <span className="inline-grid gap-1">
      {money(row.data.amount, row.data.currency, row.kind !== "cash_balance")}
      {!disabled && !editing ? (
        <button
          type="button"
          className="text-ink-3 text-right font-sans text-[12px] font-normal underline"
          aria-label={t.imports.importReview.editAmountFor(label)}
          onClick={() => {
            setDraft(row.data.amount);
            controls.setEditingAmount(row.id);
          }}
        >
          {t.imports.importReview.editAmount}
        </button>
      ) : null}
      {!disabled && editing ? (
        <span className="grid max-w-52 gap-1 font-sans font-normal">
          <Input
            aria-label={t.imports.importReview.amountFor(label)}
            inputMode="decimal"
            value={draft}
            aria-invalid={!valid}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8"
          />
          <span className="text-ink-3 text-[11px]">
            {row.kind === "cash_balance"
              ? t.imports.importReview.negativeDebtoverdraftPositiveCashcredit
              : t.imports.importReview.negativeMoneyOutPositiveMoney}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!valid}
            onClick={() =>
              setDraft(new Decimal(draft.trim()).negated().toFixed())
            }
          >
            {t.imports.importReview.flipDirection}
          </Button>
          <span className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => controls.setEditingAmount(null)}
            >
              {t.imports.importReview.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!valid}
              onClick={() => {
                controls.onAmount(row.id, draft.trim());
                controls.setEditingAmount(null);
              }}
            >
              {t.imports.importReview.applyAmount}
            </Button>
          </span>
        </span>
      ) : null}
    </span>
  );
}
