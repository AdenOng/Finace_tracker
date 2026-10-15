"use client";

import Decimal from "decimal.js";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import {
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { holdsSecurities } from "~/lib/accounts";
import { orderCategories } from "~/lib/categories";
import { cn } from "~/lib/cn";
import { todayIso } from "~/lib/dates";
import { errorMessage } from "~/lib/errors";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";

type Transaction = RouterOutputs["spending"]["list"][number];

/** Add or edit a transaction. Amounts are typed positive; the direction sets the sign. */
export function TransactionDrawer({
  transaction,
  defaultAccountId,
  onClose,
  onSaved,
}: {
  transaction: Transaction | "new" | null;
  defaultAccountId: string | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const existing = transaction && transaction !== "new" ? transaction : null;
  const locked = !!existing?.reconciliationId;
  const [accounts] = api.accounts.list.useSuspenseQuery();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const [currencies] = api.catalog.currencies.useSuspenseQuery();
  const [direction, setDirection] = useState<"out" | "in">(
    existing && new Decimal(existing.amount).isPositive() ? "in" : "out",
  );
  const create = api.spending.create.useMutation();
  const update = api.spending.update.useMutation();
  const remove = api.spending.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error;

  // A closed account still shows for rows already in it; new rows go to open accounts.
  const choices = accounts.filter(
    (a) => !a.archivedAt || a.id === existing?.accountId,
  );
  const initialAccount =
    existing?.accountId ??
    choices.find((a) => a.id === defaultAccountId)?.id ??
    (choices.find((a) => !holdsSecurities(a.type)) ?? choices[0])?.id;
  const [accountId, setAccountId] = useState(initialAccount ?? "");
  const accountCurrency = accounts.find((a) => a.id === accountId)?.currency;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const magnitude = formText(form, "amount").trim();
    const currency = locked ? existing.currency : formText(form, "currency");
    const values = {
      accountId,
      postedDate: formText(form, "postedDate"),
      description: formText(form, "description"),
      merchant: formText(form, "merchant"),
      amount: direction === "out" ? `-${magnitude}` : magnitude,
      currency: currency === "" ? null : currency,
      categoryId: formText(form, "categoryId") || null,
      isTransfer: form.get("isTransfer") === "on",
      cleared: locked ? existing.cleared : form.get("cleared") === "on",
      notes: formText(form, "notes"),
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved("Transaction saved.");
    } else {
      await create.mutateAsync(values);
      await onSaved("Transaction added.");
    }
  }

  async function onRemove() {
    if (!existing) return;
    await remove.mutateAsync({ id: existing.id });
    await onSaved("Transaction deleted.");
  }

  return (
    <Drawer
      open={transaction !== null}
      onClose={onClose}
      title={existing ? "Edit transaction" : "Add transaction"}
      footer={
        <>
          {existing && !locked ? (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => void onRemove().catch(() => undefined)}
              loading={remove.isPending}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="transaction-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form
        id="transaction-form"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
        className="space-y-5"
      >
        {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}
        {locked ? (
          <Notice tone="warn">
            This entry is reconciled. You can edit its category, merchant,
            transfer label and notes. Reopen the statement period from its
            account to change the amount, date or description.
          </Notice>
        ) : null}
        <div
          role="radiogroup"
          aria-label="Direction"
          className="border-line grid grid-cols-2 border"
        >
          {(
            [
              ["out", "Money out"],
              ["in", "Money in"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={locked}
              role="radio"
              aria-checked={direction === value}
              onClick={() => setDirection(value)}
              className={cn(
                "h-10 text-sm font-semibold transition-colors",
                direction === value
                  ? "bg-forest text-white"
                  : "text-ink-2 hover:bg-wash",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount" htmlFor="txn-amount">
            <Input
              id="txn-amount"
              name="amount"
              readOnly={locked}
              required
              inputMode="decimal"
              pattern="\d+(\.\d{1,4})?"
              title="A positive amount, up to four decimals"
              defaultValue={
                existing ? new Decimal(existing.amount).abs().toFixed() : ""
              }
              className="figures"
            />
          </Field>
          <Field label="Currency" htmlFor="txn-currency">
            <Select
              id="txn-currency"
              name="currency"
              disabled={locked}
              defaultValue={existing?.currency ?? ""}
            >
              <option value="">
                {accountCurrency
                  ? `${accountCurrency} (account)`
                  : "Account currency"}
              </option>
              {existing &&
              !currencies.some((c) => c.code === existing.currency) ? (
                <option value={existing.currency}>
                  {existing.currency} (inactive)
                </option>
              ) : null}
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account" htmlFor="txn-account">
            <Select
              id="txn-account"
              disabled={locked}
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {choices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="txn-date">
            <Input
              id="txn-date"
              name="postedDate"
              readOnly={locked}
              type="date"
              required
              defaultValue={existing?.postedDate ?? todayIso()}
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="txn-description">
          <Input
            id="txn-description"
            name="description"
            readOnly={locked}
            required
            maxLength={500}
            defaultValue={existing?.description}
          />
        </Field>
        <Field
          label="Merchant"
          htmlFor="txn-merchant"
          hint="Optional. A clean name shown instead of the description."
        >
          <Input
            id="txn-merchant"
            name="merchant"
            maxLength={200}
            defaultValue={existing?.merchant ?? ""}
          />
        </Field>
        <Field label="Category" htmlFor="txn-category">
          <Select
            id="txn-category"
            name="categoryId"
            defaultValue={existing?.categoryId ?? ""}
          >
            <option value="">Uncategorised</option>
            {existing?.categoryId &&
            !categories.some((c) => c.id === existing.categoryId) ? (
              <option value={existing.categoryId}>
                {existing.categoryName} (archived)
              </option>
            ) : null}
            {orderCategories(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          name="isTransfer"
          label="Transfer between my accounts"
          description="Card bill payments, top-ups and moves to savings. Left out of spending totals."
          defaultChecked={existing?.isTransfer}
        />
        <Checkbox
          name="cleared"
          label="Cleared"
          description="Checked against your bank records."
          defaultChecked={existing?.cleared}
          disabled={locked}
        />
        <Field label="Notes" htmlFor="txn-notes">
          <Textarea
            id="txn-notes"
            name="notes"
            maxLength={2000}
            defaultValue={existing?.notes ?? ""}
          />
        </Field>
      </form>
    </Drawer>
  );
}
