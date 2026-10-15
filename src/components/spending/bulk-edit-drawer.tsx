"use client";

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
import { orderCategories } from "~/lib/categories";
import { errorMessage } from "~/lib/errors";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";

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
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const [changeMerchant, setChangeMerchant] = useState(false);
  const [changeNotes, setChangeNotes] = useState(false);
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
    const categoryId = formText(form, "categoryId");
    const transfer = formText(form, "isTransfer");
    const cleared = formText(form, "cleared");
    const result = await update.mutateAsync({
      ids,
      changes: {
        ...(categoryId !== "keep" ? { categoryId: categoryId || null } : {}),
        ...(transfer !== "keep" ? { isTransfer: transfer === "yes" } : {}),
        ...(!reconciled && cleared !== "keep"
          ? { cleared: cleared === "yes" }
          : {}),
        ...(changeMerchant ? { merchant: formText(form, "merchant") } : {}),
        ...(changeNotes ? { notes: formText(form, "notes") } : {}),
      },
    });
    await onSaved(`${result.count} transactions updated.`);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        action === "edit"
          ? "Edit selected transactions"
          : action === "rules"
            ? "Apply merchant rules"
            : "Delete selected transactions"
      }
      description={`${rows.length} selected transactions.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {action === "edit" ? (
            <Button
              type="submit"
              form="bulk-edit-form"
              loading={update.isPending}
            >
              Save changes
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
                      onSaved(`${r.count} transactions categorised.`),
                    )
                    .catch(() => undefined);
              }}
            >
              Apply {preview.data?.changes.length ?? 0} changes
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
                  .then((r) => onSaved(`${r.count} transactions deleted.`))
                  .catch(() => undefined)
              }
            >
              Delete {rows.length} transactions
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
            Only the fields you choose will change. A blank value clears that
            field.
          </p>
          <Field label="Category" htmlFor="bulk-category">
            <Select id="bulk-category" name="categoryId" defaultValue="keep">
              <option value="keep">Keep existing categories</option>
              <option value="">Clear category</option>
              {orderCategories(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? "— " : ""}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Transfer" htmlFor="bulk-transfer">
            <Select id="bulk-transfer" name="isTransfer" defaultValue="keep">
              <option value="keep">Keep existing transfer status</option>
              <option value="yes">Mark as transfer</option>
              <option value="no">Mark as spending / income</option>
            </Select>
          </Field>
          <Field
            label="Cleared"
            htmlFor="bulk-cleared"
            hint={
              reconciled
                ? "Reopen reconciled periods before changing cleared status."
                : "Cleared means checked against your bank records."
            }
          >
            <Select
              id="bulk-cleared"
              name="cleared"
              defaultValue="keep"
              disabled={reconciled}
            >
              <option value="keep">Keep existing cleared status</option>
              <option value="yes">Mark cleared</option>
              <option value="no">Mark uncleared</option>
            </Select>
          </Field>
          <Checkbox
            label="Change merchant"
            checked={changeMerchant}
            onChange={(e) => setChangeMerchant(e.target.checked)}
          />
          {changeMerchant ? (
            <Field
              label="Merchant for all selected entries"
              htmlFor="bulk-merchant"
            >
              <Input id="bulk-merchant" name="merchant" maxLength={200} />
            </Field>
          ) : null}
          <Checkbox
            label="Change notes"
            checked={changeNotes}
            onChange={(e) => setChangeNotes(e.target.checked)}
          />
          {changeNotes ? (
            <Field label="Notes for all selected entries" htmlFor="bulk-notes">
              <Textarea id="bulk-notes" name="notes" maxLength={2000} />
            </Field>
          ) : null}
        </form>
      ) : null}
      {action === "rules" ? (
        <div className="space-y-4">
          <p className="text-ink-2 text-sm">
            Review the proposed categories. Manual choices and transfers are
            preserved.
          </p>
          {preview.isLoading ? <p>Checking rules…</p> : null}
          {preview.data ? (
            <>
              <p className="text-sm">
                {preview.data.changes.length} changes; {preview.data.skipped}{" "}
                entries unchanged.
              </p>
              <ul className="divide-line divide-y">
                {preview.data.changes.map((change) => (
                  <li className="py-3" key={change.id}>
                    <p className="font-semibold">
                      {change.merchant ?? change.description}
                    </p>
                    <p className="text-ink-2 text-sm">
                      {change.categoryName} · matches “{change.pattern}”
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
            Refresh preview
          </Button>
        </div>
      ) : null}
      {action === "delete" ? (
        <div className="space-y-4">
          {reconciled ? (
            <Notice tone="warn">
              Your selection includes reconciled transactions. Reopen those
              statement periods before deleting.
            </Notice>
          ) : (
            <Notice tone="warn">
              Deleting these entries removes them from your spending history and
              cannot be undone.
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
