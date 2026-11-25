"use client";

import Decimal from "decimal.js";
import { useState } from "react";

import { categoryLabel, useT } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { Drawer } from "~/components/ui/dialog";
import {
  type Direction,
  DirectionToggle,
  signedAmount,
} from "~/components/ui/direction-toggle";
import {
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { accountGroupOf } from "~/lib/accounts";
import { type CategoryKind, orderCategories } from "~/lib/categories";
import { todayIso } from "~/lib/dates";
import { errorMessage } from "~/lib/errors";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  categoryKind,
  classifyTransaction,
} from "~/lib/transaction-classification";
import { TransactionTypeSelect } from "./transaction-type-select";

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
  const t = useT();
  const existing = transaction && transaction !== "new" ? transaction : null;
  const locked = !!existing?.reconciliationId;
  const [accounts] = api.accounts.list.useSuspenseQuery();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const [currencies] = api.catalog.currencies.useSuspenseQuery();
  const [direction, setDirection] = useState<Direction>(
    existing && new Decimal(existing.amount).isPositive() ? "in" : "out",
  );
  const [classification, setClassification] = useState({
    categoryId: existing?.categoryId ?? null,
    isTransfer: existing?.isTransfer ?? false,
  });
  function chooseType(value: CategoryKind | "keep") {
    if (value === "keep") return;
    setClassification(
      classifyTransaction(
        classification,
        {
          isTransfer: value === "transfer",
          ...(categoryKind(categories, classification.categoryId) !== value
            ? { categoryId: null }
            : {}),
        },
        categories,
      ),
    );
    if (value !== "transfer") setDirection(value === "expense" ? "out" : "in");
  }
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
    (choices.find((a) => accountGroupOf(a.type) === "banking") ?? choices[0])
      ?.id;
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
      amount: signedAmount(direction, magnitude),
      currency: currency === "" ? null : currency,
      ...classification,
      cleared: locked ? existing.cleared : form.get("cleared") === "on",
      notes: formText(form, "notes"),
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved(t.spending.transactionDrawer.transactionSaved);
    } else {
      await create.mutateAsync(values);
      await onSaved(t.spending.transactionDrawer.transactionAdded);
    }
  }

  async function onRemove() {
    if (!existing) return;
    await remove.mutateAsync({ id: existing.id });
    await onSaved(t.spending.transactionDrawer.transactionDeleted);
  }

  return (
    <Drawer
      open={transaction !== null}
      onClose={onClose}
      title={
        existing
          ? t.spending.transactionDrawer.editTransaction
          : t.spending.transactionDrawer.addTransaction
      }
      footer={
        <>
          {existing && !locked ? (
            <ConfirmButton
              variant="danger"
              className="mr-auto"
              onConfirm={() => void onRemove().catch(() => undefined)}
              loading={remove.isPending}
            >
              {t.common.actions.delete}
            </ConfirmButton>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
          </Button>
          <Button
            type="submit"
            form="transaction-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? t.common.actions.save : t.common.actions.add}
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
            {t.spending.transactionDrawer.thisEntryIsReconciledYouCanEdit}
          </Notice>
        ) : null}
        <Field
          label={t.spending.transactionDrawer.transactionType}
          hint={
            t.spending.transactionDrawer.transfersAreLeftOutOfSpendingTotals
          }
        >
          <TransactionTypeSelect
            value={
              classification.isTransfer
                ? "transfer"
                : direction === "out"
                  ? "expense"
                  : "income"
            }
            onChange={chooseType}
            expenseDisabled={locked && direction === "in"}
            incomeDisabled={locked && direction === "out"}
          />
        </Field>
        <DirectionToggle
          value={direction}
          disabled={locked}
          label={t.spending.transactionDrawer.direction}
          outLabel={t.spending.transactionDrawer.moneyOut}
          inLabel={t.spending.transactionDrawer.moneyIn}
          onChange={(value) => {
            setDirection(value);
            if (!classification.isTransfer) {
              const kind = categoryKind(categories, classification.categoryId);
              if (kind && kind !== (value === "out" ? "expense" : "income"))
                setClassification({ ...classification, categoryId: null });
            }
          }}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.common.fields.amount} htmlFor="txn-amount">
            <Input
              id="txn-amount"
              name="amount"
              readOnly={locked}
              required
              inputMode="decimal"
              pattern="\d+(\.\d{1,4})?"
              title={
                t.spending.transactionDrawer.aPositiveAmountUpToFourDecimals
              }
              defaultValue={
                existing ? new Decimal(existing.amount).abs().toFixed() : ""
              }
              className="figures"
            />
          </Field>
          <Field label={t.common.fields.currency} htmlFor="txn-currency">
            <Select
              id="txn-currency"
              name="currency"
              disabled={locked}
              defaultValue={existing?.currency ?? ""}
            >
              <option value="">
                {accountCurrency
                  ? t.spending.transactionDrawer.accountCurrencyLabel(
                      accountCurrency,
                    )
                  : t.spending.transactionDrawer.accountCurrency}
              </option>
              {existing &&
              !currencies.some((c) => c.code === existing.currency) ? (
                <option value={existing.currency}>
                  {t.spending.transactionDrawer.inactiveCurrency(
                    existing.currency,
                  )}
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
          <Field
            label={t.spending.transactionDrawer.account}
            htmlFor="txn-account"
          >
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
          <Field label={t.common.fields.date} htmlFor="txn-date">
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
        <Field
          label={t.spending.transactionDrawer.description}
          htmlFor="txn-description"
        >
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
          label={t.spending.transactionDrawer.merchant}
          htmlFor="txn-merchant"
          hint={t.spending.transactionDrawer.optionalACleanNameShownInsteadOf}
        >
          <Input
            id="txn-merchant"
            name="merchant"
            maxLength={200}
            defaultValue={existing?.merchant ?? ""}
          />
        </Field>
        <Field
          label={t.spending.transactionDrawer.category}
          htmlFor="txn-category"
        >
          <Combobox
            id="txn-category"
            name="categoryId"
            value={classification.categoryId ?? ""}
            onChange={(val) =>
              setClassification(
                classifyTransaction(
                  classification,
                  { categoryId: val || null },
                  categories,
                ),
              )
            }
            options={[
              {
                value: "",
                label: t.spending.transactionDrawer.uncategorised,
              },
              ...(existing?.categoryId &&
              !categories.some((c) => c.id === existing.categoryId)
                ? [
                    {
                      value: existing.categoryId,
                      label: t.spending.transactionDrawer.archivedCategory(
                        categoryLabel(t, existing.categoryName ?? ""),
                      ),
                    },
                  ]
                : []),
              ...orderCategories(categories).map((c) => ({
                value: c.id,
                label: c.parentId
                  ? `— ${categoryLabel(t, c.name)}`
                  : categoryLabel(t, c.name),
                keywords: c.name,
              })),
            ]}
          />
        </Field>
        <Checkbox
          name="cleared"
          label={t.spending.transactionDrawer.cleared}
          description={
            t.spending.transactionDrawer.checkedAgainstYourBankRecords
          }
          defaultChecked={existing?.cleared}
          disabled={locked}
        />
        <Field label={t.common.fields.notes} htmlFor="txn-notes">
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
