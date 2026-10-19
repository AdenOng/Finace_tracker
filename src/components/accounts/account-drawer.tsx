"use client";

import { ArrowLeft, CandlestickChart, CreditCard } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select, Textarea } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import {
  type AccountGroup,
  type AccountType,
  accountGroupOf,
  accountGroups,
  accountTypeLabels,
} from "~/lib/accounts";
import { cn } from "~/lib/cn";
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

const institutionKindLabels: Record<string, string> = {
  broker: "Brokers and robo-advisers",
  crypto_exchange: "Crypto exchanges",
  depository: "Depository",
  bank: "Banks",
  card_issuer: "Card issuers",
};

const typeHints: Partial<Record<AccountType, string>> = {
  brokerage: "Shares, ETFs, funds and the cash waiting to be invested.",
  retirement: "CPF Investment, SRS or another retirement account that invests.",
  crypto_wallet: "Coins on an exchange or in your own wallet.",
  savings: "Savings and multiplier accounts that pay interest.",
  checking: "The account your salary lands in and bills leave from.",
  credit_card: "Record what you owe as a negative balance.",
  cash: "Physical cash you want counted.",
  other: "Anything else with a balance.",
};

const GROUP_COPY: Record<
  AccountGroup,
  {
    Icon: typeof CandlestickChart;
    title: string;
    blurb: string;
    examples: string;
    institution: string;
    next: string;
    submit: string;
  }
> = {
  investments: {
    Icon: CandlestickChart,
    title: "Add an investment account",
    blurb:
      "Valued from what it holds. You'll list the shares, units and coins, and any cash.",
    examples: "IBKR, moomoo, Endowus, SRS, Coinhako",
    institution: "Broker or platform",
    next: "Next, you'll enter its holdings.",
    submit: "Add and enter holdings",
  },
  banking: {
    Icon: CreditCard,
    title: "Add a bank account or card",
    blurb:
      "Carries a balance and your spending. You'll record the balance, then add transactions.",
    examples: "DBS, OCBC, UOB, Trust, Amex",
    institution: "Bank or card issuer",
    next: "Next, you'll record its balance.",
    submit: "Add and record balance",
  },
};

/**
 * Create or edit an account. `account` null = closed, "new" = create. A new account starts by
 * choosing its side: investments are valued from holdings, bank and card accounts from a balance
 * and transactions, so each gets its own form.
 */
export function AccountDrawer({
  account,
  group: initialGroup,
  onClose,
  onSaved,
}: {
  account: EditableAccount | "new" | null;
  group?: AccountGroup | null;
  onClose: () => void;
  onSaved: (
    message: string,
    outcome: "saved" | "deleted" | "archived",
    createdId?: string,
  ) => Promise<void> | void;
}) {
  const existing = account && account !== "new" ? account : null;
  const [group, setGroup] = useState<AccountGroup | null>(
    existing ? accountGroupOf(existing.type) : (initialGroup ?? null),
  );
  const [institutions] = api.catalog.institutions.useSuspenseQuery();
  const [currencies] = api.catalog.currencies.useSuspenseQuery();
  const [settings] = api.settings.get.useSuspenseQuery();
  const create = api.accounts.create.useMutation();
  const update = api.accounts.update.useMutation();
  const remove = api.accounts.remove.useMutation();
  const error = create.error ?? update.error ?? remove.error;

  const [type, setType] = useState<AccountType>(
    existing?.type ?? (group === "investments" ? "brokerage" : "savings"),
  );
  const [name, setName] = useState(existing?.name ?? "");
  const [nameEdited, setNameEdited] = useState(!!existing);

  function choose(next: AccountGroup) {
    setGroup(next);
    setType(next === "investments" ? "brokerage" : "savings");
  }

  // An institution archived by the admin after this account was created stays selectable here.
  const keepsArchivedInstitution =
    existing?.institutionId &&
    !institutions.some((i) => i.id === existing.institutionId);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: name.trim(),
      type,
      institutionId: formText(form, "institutionId") || null,
      currency: formText(form, "currency"),
      last4: formText(form, "last4"),
      notes: formText(form, "notes"),
    };
    if (existing) {
      await update.mutateAsync({ id: existing.id, ...values });
      await onSaved(`Saved ${values.name}.`, "saved");
    } else {
      const created = await create.mutateAsync(values);
      await onSaved(`Added ${values.name}.`, "saved", created.id);
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

  if (!group) {
    return (
      <Drawer
        open={account !== null}
        onClose={onClose}
        title="Add account"
        description="What kind of account is it? The two are tracked differently."
      >
        <div className="space-y-3">
          {(Object.keys(accountGroups) as AccountGroup[]).map((g) => {
            const copy = GROUP_COPY[g];
            return (
              <button
                key={g}
                type="button"
                onClick={() => choose(g)}
                className="group border-line-2 hover:border-ink rounded-card block w-full border p-5 text-left transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-full text-white",
                      g === "investments" ? "bg-art-cobalt" : "bg-art-red",
                    )}
                  >
                    <copy.Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="font-poster text-[22px] font-bold">
                    {accountGroups[g].label}
                  </span>
                </span>
                <span className="text-ink-2 mt-3 block text-sm">
                  {copy.blurb}
                </span>
                <span className="text-ink-3 mt-2 block font-mono text-[11px] tracking-wide">
                  {copy.examples}
                </span>
              </button>
            );
          })}
        </div>
      </Drawer>
    );
  }

  const copy = GROUP_COPY[group];
  const kinds = accountGroups[group].institutionKinds as readonly string[];
  const offered = institutions.filter((i) => kinds.includes(i.kind));
  const institutionGroups = kinds
    .map((kind) => ({ kind, items: offered.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <Drawer
      open={account !== null}
      onClose={onClose}
      title={
        existing
          ? existing.name
          : copy.title
      }
      description={existing ? undefined : copy.next}
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
          {!existing && !initialGroup ? (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => setGroup(null)}
            >
              <ArrowLeft className="size-4" />
              Back
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
            {existing ? "Save" : copy.submit}
          </Button>
        </>
      }
    >
      <form
        id="account-form"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
        className="space-y-6"
      >
        {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}

        <fieldset>
          <legend className="text-ink-2 mb-2 text-[13px] font-medium">
            Type
          </legend>
          <div className="flex flex-wrap gap-2">
            {accountGroups[group].types.map((t) => (
              <label
                key={t}
                className={cn(
                  "border-line-2 has-[:focus-visible]:outline-brand flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                  type === t
                    ? "bg-brand text-on-brand border-brand"
                    : "hover:border-ink",
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                  className="sr-only"
                />
                {accountTypeLabels[t]}
              </label>
            ))}
          </div>
          <p className="text-ink-3 mt-2 text-[13px]">
            {existing
              ? "Type can only change before balances, transactions or reconciliations are recorded."
              : typeHints[type]}
          </p>
        </fieldset>

        <Field label={copy.institution} htmlFor="account-institution">
          <Select
            id="account-institution"
            name="institutionId"
            defaultValue={existing?.institutionId ?? ""}
            onChange={(e) => {
              const picked = institutions.find((i) => i.id === e.target.value);
              if (picked && !nameEdited) setName(picked.name);
            }}
          >
            <option value="">Not listed</option>
            {keepsArchivedInstitution ? (
              <option value={existing.institutionId!}>
                {existing.institutionName}
              </option>
            ) : null}
            {institutionGroups.map((g) => (
              <optgroup
                key={g.kind}
                label={institutionKindLabels[g.kind] ?? g.kind}
              >
                {g.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field
          label="Name"
          htmlFor="account-name"
          hint="How it shows in your lists."
        >
          <Input
            id="account-name"
            name="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameEdited(true);
            }}
            placeholder={
              group === "investments" ? "e.g. IBKR Pro" : "e.g. DBS Multiplier"
            }
          />
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-4">
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
          {group === "banking" ? (
            <Field label="Last four digits" htmlFor="account-last4">
              <Input
                id="account-last4"
                name="last4"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                defaultValue={existing?.last4 ?? ""}
                placeholder="Optional"
                className="figures w-28"
              />
            </Field>
          ) : (
            <input type="hidden" name="last4" value={existing?.last4 ?? ""} />
          )}
        </div>

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
