"use client";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select, Textarea } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import {
  type AccountType,
  accountTypeLabels,
  accountTypes,
} from "~/lib/accounts";
import { errorMessage } from "~/lib/errors";
import { formText } from "~/lib/form";
import { api, type RouterOutputs } from "~/trpc/react";

export type EditableAccount = Pick<
  RouterOutputs["accounts"]["get"],
  | "id"
  | "name"
  | "type"
  | "currency"
  | "last4"
  | "notes"
  | "institutionId"
  | "institutionName"
  | "archivedAt"
>;

/** Create or edit an account. `account` null = closed, "new" = create. */
export function AccountDrawer({
  account,
  onClose,
  onSaved,
}: {
  account: EditableAccount | "new" | null;
  onClose: () => void;
  onSaved: (
    message: string,
    outcome: "saved" | "deleted" | "archived",
  ) => Promise<void> | void;
}) {
  const existing = account && account !== "new" ? account : null;
  const [institutions] = api.catalog.institutions.useSuspenseQuery();
  const [currencies] = api.catalog.currencies.useSuspenseQuery();
  const [settings] = api.settings.get.useSuspenseQuery();
  const create = api.accounts.create.useMutation();
  const update = api.accounts.update.useMutation();
  const remove = api.accounts.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error;

  // An institution archived by the admin after this account was created stays selectable here.
  const keepsArchivedInstitution =
    existing?.institutionId &&
    !institutions.some((i) => i.id === existing.institutionId);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: formText(form, "name"),
      type: formText(form, "type") as AccountType,
      institutionId: formText(form, "institutionId") || null,
      currency: formText(form, "currency"),
      last4: formText(form, "last4"),
      notes: formText(form, "notes"),
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved(`Saved ${values.name}.`, "saved");
    } else {
      await create.mutateAsync(values);
      await onSaved(`Added ${values.name}.`, "saved");
    }
  }

  async function onRemove() {
    if (!existing) return;
    const result = await remove.mutateAsync({ id: existing.id });
    await onSaved(
      result.outcome === "deleted"
        ? `Removed ${existing.name}.`
        : `${existing.name} has balances or transactions, so it was archived. Restore it from the archived list.`,
      result.outcome,
    );
  }

  return (
    <Drawer
      open={account !== null}
      onClose={onClose}
      title={existing ? existing.name : "Add account"}
      description={
        existing
          ? undefined
          : "A bank, card, brokerage or wallet account. Balances and holdings are added on the account page."
      }
      footer={
        <>
          {existing && !existing.archivedAt ? (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => void onRemove().catch(() => undefined)}
              loading={remove.isPending}
            >
              Remove
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="account-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form
        id="account-form"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
        className="space-y-5"
      >
        {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}
        <Field label="Name" htmlFor="account-name">
          <Input
            id="account-name"
            name="name"
            required
            maxLength={120}
            defaultValue={existing?.name}
            placeholder="e.g. DBS Multiplier"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Type"
            htmlFor="account-type"
            hint={
              existing
                ? "Type can only change before balances, transactions or reconciliations are recorded."
                : undefined
            }
          >
            <Select
              id="account-type"
              name="type"
              defaultValue={existing?.type ?? "checking"}
            >
              {accountTypes.map((t) => (
                <option key={t} value={t}>
                  {accountTypeLabels[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency" htmlFor="account-currency">
            <Select
              id="account-currency"
              name="currency"
              defaultValue={existing?.currency ?? settings.displayCurrency}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Bank or broker" htmlFor="account-institution">
          <Select
            id="account-institution"
            name="institutionId"
            defaultValue={existing?.institutionId ?? ""}
          >
            <option value="">Not listed</option>
            {keepsArchivedInstitution ? (
              <option value={existing.institutionId!}>
                {existing.institutionName}
              </option>
            ) : null}
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Last four digits"
          htmlFor="account-last4"
          hint="Optional. Helps tell similar accounts and cards apart."
        >
          <Input
            id="account-last4"
            name="last4"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            defaultValue={existing?.last4 ?? ""}
            className="w-28"
          />
        </Field>
        <Field label="Notes" htmlFor="account-notes">
          <Textarea
            id="account-notes"
            name="notes"
            maxLength={2000}
            defaultValue={existing?.notes ?? ""}
          />
        </Field>
      </form>
    </Drawer>
  );
}
