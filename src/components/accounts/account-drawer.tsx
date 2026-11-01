"use client";

import { useT } from "~/i18n/client";

import {
  ArrowLeft,
  CandlestickChart,
  CreditCard,
  Landmark,
} from "lucide-react";
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
  accountTypes,
  holdsSecurities,
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

const defaultType: Record<AccountGroup, AccountType> = {
  investments: "brokerage",
  banking: "savings",
  cpf_srs: "cpf",
};

const groupColour: Record<AccountGroup, string> = {
  investments: "bg-art-cobalt text-white",
  banking: "bg-art-red text-white",
  cpf_srs: "bg-art-mustard text-[#16130f]",
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
  const t = useT();

  const institutionKindLabels: Record<string, string> = {
    broker: t.accounts.drawer.brokersAndRoboAdvisers,
    crypto_exchange: t.accounts.drawer.cryptoExchanges,
    depository: t.accounts.drawer.depository,
    bank: t.accounts.drawer.banks,
    card_issuer: t.accounts.drawer.cardIssuers,
    other: t.accounts.drawer.government,
  };

  const typeHints: Partial<Record<AccountType, string>> = {
    brokerage: t.accounts.drawer.sharesETFsFundsAndTheCashWaitingToBeInvested,
    retirement:
      t.accounts.drawer
        .cPFInvestmentSchemeOrAnOverseasRetirementAccountThatInvests,
    crypto_wallet: t.accounts.drawer.coinsOnAnExchangeOrInYourOwnWallet,
    savings: t.accounts.drawer.savingsAndMultiplierAccountsThatPayInterest,
    checking: t.accounts.drawer.theAccountYourSalaryLandsInAndBillsLeaveFrom,
    credit_card: t.accounts.drawer.recordWhatYouOweAsANegativeBalance,
    cash: t.accounts.drawer.physicalCashYouWantCounted,
    other: t.accounts.drawer.anythingElseWithABalance,
    cpf: t.accounts.drawer.yourOrdinarySpecialMediSaveAndRetirementBalances,
    srs: t.accounts.drawer.yourSRSCashAndWhateverItHasBought,
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
      title: t.accounts.drawer.addAnInvestmentAccount,
      blurb: t.accounts.drawer.valuedFromWhatItHoldsYouLlListTheShares,
      examples: t.accounts.drawer.iBKRMoomooEndowusSyfeCoinhako,
      institution: t.accounts.drawer.brokerOrPlatform,
      next: t.accounts.drawer.nextYouLlEnterItsHoldings,
      submit: t.accounts.drawer.addAndEnterHoldings,
    },
    banking: {
      Icon: CreditCard,
      title: t.accounts.drawer.addABankAccountOrCard,
      blurb: t.accounts.drawer.carriesABalanceAndYourSpendingYouLlRecordThe,
      examples: t.accounts.drawer.dBSOCBCUOBTrustAmex,
      institution: t.accounts.drawer.bankOrCardIssuer,
      next: t.accounts.drawer.nextYouLlRecordItsBalance,
      submit: t.accounts.drawer.addAndRecordBalance,
    },
    cpf_srs: {
      Icon: Landmark,
      title: t.accounts.drawer.addCPFOrSRS,
      blurb: t.accounts.drawer.moneySetAsideForRetirementKeptApartFromYourOther,
      examples: t.accounts.drawer.cPFDBSSRSOCBCSRSEndowusSRS,
      institution: t.accounts.drawer.heldWith,
      next: t.accounts.drawer.nextYouLlRecordItsBalances,
      submit: t.accounts.drawer.addAndRecordBalances,
    },
  };

  const [confirmRemove, setConfirmRemove] = useState(false);
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
    existing?.type ?? (group ? defaultType[group] : "savings"),
  );
  const [name, setName] = useState(existing?.name ?? "");
  const [nameEdited, setNameEdited] = useState(!!existing);

  function choose(next: AccountGroup) {
    setGroup(next);
    setType(defaultType[next]);
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
      await onSaved(t.accounts.drawer.saved(values.name), "saved");
    } else {
      const created = await create.mutateAsync(values);
      await onSaved(t.accounts.drawer.added(values.name), "saved", created.id);
    }
  }

  async function onRemove() {
    if (!existing) return;
    const result = await remove.mutateAsync({ id: existing.id });
    await onSaved(
      result.outcome === "deleted"
        ? t.accounts.drawer.removed(existing.name)
        : t.accounts.drawer.archived(existing.name),
      result.outcome,
    );
  }

  if (!group) {
    return (
      <Drawer
        open={account !== null}
        onClose={onClose}
        title={t.accounts.drawer.addAccount}
        description={
          t.accounts.drawer.whatKindOfAccountIsItEachIsTrackedDifferently
        }
      >
        <div className="space-y-3">
          {(Object.keys(accountGroups) as AccountGroup[])
            .filter((g) => g !== "cpf_srs" || settings.cpfSrsEnabled)
            .map((g) => {
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
                        "grid size-10 place-items-center rounded-full",
                        groupColour[g],
                      )}
                    >
                      <copy.Icon className="size-5" strokeWidth={1.8} />
                    </span>
                    <span className="font-poster text-[22px] font-bold">
                      {t.common.accountGroups[g]}
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
  // Accounts that hold securities can move between those types even with history.
  // CPF and SRS are only offered when the preset tracks them; an existing one keeps its type.
  const typeChoices: readonly AccountType[] = (
    existing && holdsSecurities(existing.type)
      ? accountTypes.filter(holdsSecurities)
      : accountGroups[group].types
  ).filter(
    (t) =>
      settings.cpfSrsEnabled ||
      accountGroupOf(t) !== "cpf_srs" ||
      t === existing?.type,
  );
  const kinds = accountGroups[group].institutionKinds as readonly string[];
  const offered = institutions.filter((i) => kinds.includes(i.kind));
  const institutionGroups = kinds
    .map((kind) => ({ kind, items: offered.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <Drawer
      open={account !== null}
      onClose={onClose}
      title={existing ? existing.name : copy.title}
      description={existing ? undefined : copy.next}
      footer={
        <>
          {existing && !existing.archivedAt ? (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                setConfirmRemove(true);
                document
                  .getElementById("account-form")
                  ?.scrollIntoView({ block: "start" });
              }}
              loading={remove.isPending}
            >
              {t.common.actions.remove}
            </Button>
          ) : null}
          {!existing && !initialGroup ? (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => setGroup(null)}
            >
              <ArrowLeft className="size-4" />
              {t.common.actions.back}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
          </Button>
          <Button
            type="submit"
            form="account-form"
            loading={create.isPending || update.isPending}
          >
            {existing ? t.common.actions.save : copy.submit}
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
        {confirmRemove ? (
          <Notice tone="warn">
            <p>{t.accounts.drawer.removeExplanation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmRemove(false)}
                type="button"
              >
                {t.common.actions.cancel}
              </Button>
              <Button
                variant="danger"
                type="button"
                loading={remove.isPending}
                onClick={() => void onRemove().catch(() => undefined)}
              >
                {t.accounts.drawer.confirmRemove}
              </Button>
            </div>
          </Notice>
        ) : null}

        <fieldset>
          <legend className="text-ink-2 mb-2 text-[13px] font-medium">
            {t.common.fields.type}
          </legend>
          <div className="flex flex-wrap gap-2">
            {typeChoices.map((accountType) => (
              <label
                key={accountType}
                className={cn(
                  "border-line-2 has-[:focus-visible]:outline-brand flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                  type === accountType
                    ? "bg-brand text-on-brand border-brand"
                    : "hover:border-ink",
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={accountType}
                  checked={type === accountType}
                  onChange={() => setType(accountType)}
                  className="sr-only"
                />
                {t.common.accountTypes[accountType]}
              </label>
            ))}
          </div>
          <p className="text-ink-3 mt-2 text-[13px]">
            {existing && !holdsSecurities(existing.type)
              ? t.accounts.drawer
                  .typeCanOnlyChangeBeforeBalancesTransactionsOrReconciliationsAre
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
            <option value="">{t.accounts.drawer.notListed}</option>
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
          label={t.common.fields.name}
          htmlFor="account-name"
          hint={t.accounts.drawer.howItShowsInYourLists}
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
              group === "investments"
                ? t.accounts.drawer.eGIBKRPro
                : t.accounts.drawer.eGDBSMultiplier
            }
          />
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-4">
          <Field label={t.common.fields.currency} htmlFor="account-currency">
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
            <Field
              label={t.accounts.drawer.lastFourDigits}
              htmlFor="account-last4"
            >
              <Input
                id="account-last4"
                name="last4"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                defaultValue={existing?.last4 ?? ""}
                placeholder={t.accounts.drawer.optional}
                className="figures w-28"
              />
            </Field>
          ) : (
            <input type="hidden" name="last4" value={existing?.last4 ?? ""} />
          )}
        </div>

        <Field label={t.common.fields.notes} htmlFor="account-notes">
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
