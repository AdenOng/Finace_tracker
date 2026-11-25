"use client";

import { useState } from "react";
import { categoryLabel, useT } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import { Drawer } from "~/components/ui/dialog";
import {
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { type CategoryKind, orderCategories } from "~/lib/categories";
import { errorMessage } from "~/lib/errors";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";
import { categoryKind } from "~/lib/transaction-classification";
import { TransactionTypeSelect } from "./transaction-type-select";

type Transaction = RouterOutputs["spending"]["list"][number];
export type BulkAction = "edit" | "rules" | "delete";

export function BulkEditDrawer({
  rows,
  action,
  onClose,
  onSaved,
}: {
  rows: Transaction[];
  action: BulkAction;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const t = useT();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const [changeMerchant, setChangeMerchant] = useState(false);
  const [changeNotes, setChangeNotes] = useState(false);
  const [categoryId, setCategoryId] = useState("keep");
  const [type, setType] = useState<CategoryKind | "keep">("keep");
  const allExpenses = rows.every((r) => r.amount.startsWith("-"));
  const allIncome = rows.every((r) => !r.amount.startsWith("-"));
  function chooseType(value: CategoryKind | "keep") {
    setType(value);
    if (value === "keep") return;
    const kind = categoryKind(categories, categoryId);
    if (kind && (kind === "transfer") !== (value === "transfer"))
      setCategoryId("");
  }
  const update = api.spending.bulkUpdate.useMutation();
  const remove = api.spending.bulkRemove.useMutation();
  const apply = api.merchantRules.applyRules.useMutation();
  const ids = rows.map((r) => r.id);
  const preview = api.merchantRules.preview.useQuery(
    { ids },
    { enabled: action === "rules", retry: false },
  );
  const error =
    update.error ??
    remove.error ??
    apply.error ??
    (action === "rules" ? preview.error : null);
  const reconciled = rows.some((r) => r.reconciliationId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cleared = formText(form, "cleared");
    const result = await update.mutateAsync({
      ids,
      changes: {
        ...(categoryId !== "keep" ? { categoryId: categoryId || null } : {}),
        ...(type !== "keep" ? { isTransfer: type === "transfer" } : {}),
        ...(!reconciled && cleared !== "keep"
          ? { cleared: cleared === "yes" }
          : {}),
        ...(changeMerchant ? { merchant: formText(form, "merchant") } : {}),
        ...(changeNotes ? { notes: formText(form, "notes") } : {}),
      },
    });
    await onSaved(t.spending.bulkEditDrawer.updated(result.count));
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        action === "edit"
          ? t.spending.bulkEditDrawer.editSelectedTransactions
          : action === "rules"
            ? t.spending.bulkEditDrawer.applyMerchantRules
            : t.spending.bulkEditDrawer.deleteSelectedTransactions
      }
      description={t.spending.bulkEditDrawer.selected(rows.length)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
          </Button>
          {action === "edit" ? (
            <Button
              type="submit"
              form="bulk-edit-form"
              loading={update.isPending}
            >
              {t.spending.bulkEditDrawer.saveChanges}
            </Button>
          ) : null}
          {action === "rules" ? (
            <Button
              loading={apply.isPending}
              disabled={
                !preview.data?.changes.length ||
                preview.isFetching ||
                apply.isPending
              }
              onClick={() => {
                if (preview.data)
                  void apply
                    .mutateAsync({ ids, revision: preview.data.revision })
                    .then((r) =>
                      onSaved(t.spending.bulkEditDrawer.categorised(r.count)),
                    )
                    .catch(() => undefined);
              }}
            >
              {t.spending.bulkEditDrawer.applyChanges(
                preview.data?.changes.length ?? 0,
              )}
            </Button>
          ) : null}
          {action === "delete" ? (
            <Button
              variant="danger"
              loading={remove.isPending}
              disabled={reconciled || remove.isPending}
              onClick={() =>
                void remove
                  .mutateAsync({ ids })
                  .then((r) =>
                    onSaved(t.spending.bulkEditDrawer.deleted(r.count)),
                  )
                  .catch(() => undefined)
              }
            >
              {t.spending.bulkEditDrawer.deleteTransactions(rows.length)}
            </Button>
          ) : null}
        </>
      }
    >
      {error ? (
        <Notice tone="error" className="mb-5">
          {errorMessage(error)}
        </Notice>
      ) : null}
      {action === "edit" ? (
        <form
          id="bulk-edit-form"
          className="space-y-5"
          onSubmit={(e) => void submit(e).catch(() => undefined)}
        >
          <p className="text-ink-2 text-sm">
            {t.spending.bulkEditDrawer.onlyTheFieldsYouChooseWillChange}
          </p>
          <Field
            label={t.spending.bulkEditDrawer.category}
            htmlFor="bulk-category"
          >
            <Combobox
              id="bulk-category"
              value={categoryId}
              onChange={(val) => {
                setCategoryId(val);
                const kind = categoryKind(categories, val);
                if (kind)
                  setType(
                    kind === "transfer"
                      ? "transfer"
                      : allExpenses
                        ? "expense"
                        : allIncome
                          ? "income"
                          : "keep",
                  );
              }}
              options={[
                {
                  value: "keep",
                  label: t.spending.bulkEditDrawer.keepExistingCategories,
                },
                {
                  value: "",
                  label: t.spending.bulkEditDrawer.clearCategory,
                },
                ...orderCategories(categories).map((c) => ({
                  value: c.id,
                  label: `${c.parentId ? "— " : ""}${categoryLabel(t, c.name)}`,
                  keywords: c.name,
                })),
              ]}
            />
          </Field>
          <Field
            label={t.spending.bulkEditDrawer.transactionType}
            hint={t.spending.bulkEditDrawer.expenseIsMoneyOutIncomeIsMoney}
          >
            <TransactionTypeSelect
              keep
              value={type}
              onChange={chooseType}
              expenseDisabled={!allExpenses}
              incomeDisabled={!allIncome}
            />
          </Field>
          <Field
            label={t.spending.bulkEditDrawer.cleared}
            htmlFor="bulk-cleared"
            hint={
              reconciled
                ? t.spending.bulkEditDrawer
                    .reopenReconciledPeriodsBeforeChangingClearedStatus
                : t.spending.bulkEditDrawer
                    .clearedMeansCheckedAgainstYourBankRecords
            }
          >
            <Select
              id="bulk-cleared"
              name="cleared"
              defaultValue="keep"
              disabled={reconciled}
            >
              <option value="keep">
                {t.spending.bulkEditDrawer.keepExistingClearedStatus}
              </option>
              <option value="yes">
                {t.spending.bulkEditDrawer.markCleared}
              </option>
              <option value="no">
                {t.spending.bulkEditDrawer.markUncleared}
              </option>
            </Select>
          </Field>
          <Checkbox
            label={t.spending.bulkEditDrawer.changeMerchant}
            checked={changeMerchant}
            onChange={(e) => setChangeMerchant(e.target.checked)}
          />
          {changeMerchant ? (
            <Field
              label={t.spending.bulkEditDrawer.merchantForAllSelectedEntries}
              htmlFor="bulk-merchant"
            >
              <Input id="bulk-merchant" name="merchant" maxLength={200} />
            </Field>
          ) : null}
          <Checkbox
            label={t.spending.bulkEditDrawer.changeNotes}
            checked={changeNotes}
            onChange={(e) => setChangeNotes(e.target.checked)}
          />
          {changeNotes ? (
            <Field
              label={t.spending.bulkEditDrawer.notesForAllSelectedEntries}
              htmlFor="bulk-notes"
            >
              <Textarea id="bulk-notes" name="notes" maxLength={2000} />
            </Field>
          ) : null}
        </form>
      ) : null}
      {action === "rules" ? (
        <div className="space-y-4">
          <p className="text-ink-2 text-sm">
            {
              t.spending.bulkEditDrawer
                .reviewTheProposedCategoriesManualChoicesAnd
            }
          </p>
          {preview.isLoading ? (
            <p>{t.spending.bulkEditDrawer.checkingRules}</p>
          ) : null}
          {preview.data ? (
            <>
              <p className="text-sm">
                {t.spending.bulkEditDrawer.previewSummary(
                  preview.data.changes.length,
                  preview.data.skipped,
                )}
              </p>
              <ul className="divide-line divide-y">
                {preview.data.changes.map((change) => (
                  <li className="py-3" key={change.id}>
                    <p className="font-semibold">
                      {change.merchant ?? change.description}
                    </p>
                    <p className="text-ink-2 text-sm">
                      {t.spending.bulkEditDrawer.ruleMatch(
                        categoryLabel(t, change.categoryName),
                        change.pattern,
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              apply.reset();
              void preview.refetch();
            }}
            disabled={preview.isFetching || apply.isPending}
          >
            {t.spending.bulkEditDrawer.refreshPreview}
          </Button>
        </div>
      ) : null}
      {action === "delete" ? (
        <div className="space-y-4">
          {reconciled ? (
            <Notice tone="warn">
              {
                t.spending.bulkEditDrawer
                  .yourSelectionIncludesReconciledTransactionsReopenThose
              }
            </Notice>
          ) : (
            <Notice tone="warn">
              {
                t.spending.bulkEditDrawer
                  .deletingTheseEntriesRemovesThemFromYour
              }
            </Notice>
          )}
          <ul className="text-sm">
            {rows.map((r) => (
              <li key={r.id} className="py-1">
                {r.postedDate} · {r.merchant ?? r.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Drawer>
  );
}
