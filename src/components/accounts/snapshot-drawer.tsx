"use client";

import Decimal from "decimal.js";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import {
  type AssetClass,
  type CpfBucket,
  assetClasses,
  assetClassLabels,
  cpfBucketLabels,
  cpfBuckets,
  holdsSecurities,
} from "~/lib/accounts";
import { todayIso } from "~/lib/dates";
import { errorMessage } from "~/lib/errors";
import { api, type RouterOutputs } from "~/trpc/react";

type Account = RouterOutputs["accounts"]["get"];

type PositionRow = {
  key: number;
  symbol: string;
  exchange: string;
  name: string;
  assetClass: AssetClass;
  currency: string;
  quantity: string;
  price: string;
  averageCost: string;
  value: string;
};
type CashRow = {
  key: number;
  currency: string;
  amount: string;
  bucket?: CpfBucket | null;
};

let lastKey = 0;
const key = () => ++lastKey;

/** NUMERIC strings arrive padded ("10.0000"); show them as typed. */
const plain = (value: string | null) =>
  value === null ? "" : new Decimal(value).toFixed();

/**
 * Records what an account held on a date. Starts from the latest entry so a routine update is a
 * matter of changing a few numbers.
 */
export function SnapshotDrawer({
  account,
  open,
  onClose,
  onSaved,
  entry,
  createOnly = false,
}: {
  account: Account;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  entry?: RouterOutputs["portfolio"]["snapshot"];
  createOnly?: boolean;
}) {
  const investments = holdsSecurities(account.type);
  const cpf = account.type === "cpf";
  const latest = entry ?? account.holdings;

  const [asOf, setAsOf] = useState(() => entry?.asOf ?? todayIso());
  const [positions, setPositions] = useState<PositionRow[]>(() =>
    (latest?.positions ?? []).map((p) => ({
      key: key(),
      symbol: p.symbol,
      exchange: p.exchange,
      name: p.name ?? "",
      assetClass: p.assetClass === "cash" ? "other" : p.assetClass,
      currency: p.currency,
      quantity: plain(p.quantity),
      price: plain(p.statementPrice),
      averageCost: plain(p.averageCost),
      value: plain(p.statementValue),
    })),
  );
  const [cash, setCash] = useState<CashRow[]>(() => {
    // CPF is always entered per sub-account, in SGD; an old unsplit total is kept until cleared.
    if (cpf) {
      const known = latest?.cash ?? [];
      const unsplit = known.filter((c) => !c.bucket);
      return [
        ...cpfBuckets.map((bucket) => ({
          key: key(),
          currency: "SGD",
          bucket,
          amount: plain(
            known.find((c) => c.bucket === bucket && c.currency === "SGD")
              ?.amount ?? null,
          ),
        })),
        ...unsplit.map((c) => ({
          key: key(),
          currency: c.currency,
          bucket: null,
          amount: plain(c.amount),
        })),
      ];
    }
    return latest?.cash.length
      ? latest.cash.map((c) => ({
          key: key(),
          currency: c.currency,
          amount: plain(c.amount),
        }))
      : [{ key: key(), currency: account.currency, amount: "" }];
  });
  const record = api.portfolio.recordSnapshot.useMutation();
  const add = api.portfolio.addSnapshot.useMutation();
  const update = api.portfolio.updateSnapshot.useMutation();
  const mutation = entry ? update : createOnly ? add : record;
  const hasEntries =
    positions.some((p) => p.symbol.trim()) || cash.some((c) => c.amount.trim());

  const setPosition = (k: number, patch: Partial<PositionRow>) =>
    setPositions((rows) =>
      rows.map((r) =>
        r.key === k
          ? {
              ...r,
              ...(patch.price !== undefined || patch.quantity !== undefined
                ? { value: "" }
                : {}),
              ...patch,
            }
          : r,
      ),
    );
  const setCashRow = (k: number, patch: Partial<CashRow>) =>
    setCash((rows) => rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      accountId: account.id,
      asOf,
      positions: positions
        .filter((p) => p.symbol.trim())
        .map(({ key: _, price, averageCost, value, ...p }) => ({
          ...p,
          price: price.trim() || null,
          averageCost: averageCost.trim() || null,
          value: value.trim() || null,
        })),
      cash: cash
        .filter((c) => c.amount.trim())
        .map(({ currency, amount, bucket }) => ({
          currency,
          amount,
          ...(cpf ? { bucket: bucket ?? null } : {}),
        })),
    };
    const result = entry
      ? await update.mutateAsync({
          snapshotId: entry.id,
          version: entry.version,
          entry: input,
        })
      : createOnly
        ? await add.mutateAsync(input)
        : await record.mutateAsync(input);
    await onSaved(
      entry
        ? "Entry updated."
        : result.replaced
          ? "Replaced the entry for that date."
          : investments
            ? "Holdings recorded."
            : "Balance recorded.",
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      className={investments ? "max-w-2xl" : undefined}
      title={
        entry
          ? "Edit entry"
          : createOnly
            ? "Add entry"
            : investments
              ? "Update holdings"
              : "Update balance"
      }
      description={
        investments
          ? "What the account held on a date. Prices are used until live quotes are available."
          : cpf
            ? "Copy each balance from the CPF app or your latest statement. Leave out any you don't have."
            : account.type === "credit_card"
              ? "Enter what you owe as a negative amount."
              : "The balance shown by your bank on a date."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="snapshot-form"
            loading={mutation.isPending}
            disabled={!hasEntries || mutation.isPending}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="snapshot-form"
        onSubmit={(e) => void onSubmit(e).catch(() => undefined)}
        className="space-y-8"
      >
        {mutation.error ? (
          <Notice tone="error">{errorMessage(mutation.error)}</Notice>
        ) : null}
        {entry?.documentId ? (
          <Notice>
            Editing these holdings keeps the original statement image or file
            and any imported trades. Changes apply to this saved entry.
          </Notice>
        ) : null}
        {!hasEntries ? (
          <Notice>
            Add a holding or cash balance before saving. To record an empty
            account, enter 0 under {investments ? "Cash" : "Balance"}.
          </Notice>
        ) : null}
        <Field
          label="As of"
          htmlFor="snapshot-date"
          hint={
            entry || createOnly
              ? "The newest dated entry determines the account value. An existing entry will not be overwritten."
              : "Saving the same date again replaces that entry."
          }
        >
          <Input
            id="snapshot-date"
            type="date"
            required
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-48"
          />
        </Field>

        {investments ? (
          <fieldset className="space-y-4">
            <legend className="mb-3 text-[15px] font-bold">Holdings</legend>
            {positions.map((p, i) => (
              <div key={p.key} className="border-line border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-ink-2 text-[13px] font-semibold">
                    Holding {i + 1}
                  </p>
                  <button
                    type="button"
                    aria-label={`Remove holding ${i + 1}`}
                    onClick={() =>
                      setPositions((rows) =>
                        rows.filter((r) => r.key !== p.key),
                      )
                    }
                    className="rounded-ctl hover:bg-wash grid size-8 place-items-center"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Symbol" htmlFor={`p-symbol-${p.key}`}>
                    <Input
                      id={`p-symbol-${p.key}`}
                      required
                      maxLength={32}
                      value={p.symbol}
                      onChange={(e) =>
                        setPosition(p.key, { symbol: e.target.value })
                      }
                      className="uppercase"
                      placeholder="AAPL"
                    />
                  </Field>
                  <Field label="Exchange" htmlFor={`p-exchange-${p.key}`}>
                    <Input
                      id={`p-exchange-${p.key}`}
                      maxLength={16}
                      value={p.exchange}
                      onChange={(e) =>
                        setPosition(p.key, { exchange: e.target.value })
                      }
                      className="uppercase"
                      placeholder="XNAS"
                    />
                  </Field>
                  <Field
                    label="Name"
                    htmlFor={`p-name-${p.key}`}
                    className="col-span-2"
                  >
                    <Input
                      id={`p-name-${p.key}`}
                      maxLength={200}
                      value={p.name}
                      onChange={(e) =>
                        setPosition(p.key, { name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Type" htmlFor={`p-class-${p.key}`}>
                    <Select
                      id={`p-class-${p.key}`}
                      value={p.assetClass}
                      onChange={(e) =>
                        setPosition(p.key, {
                          assetClass: e.target.value as AssetClass,
                        })
                      }
                    >
                      {assetClasses.map((c) => (
                        <option key={c} value={c}>
                          {assetClassLabels[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Currency" htmlFor={`p-currency-${p.key}`}>
                    <Input
                      id={`p-currency-${p.key}`}
                      required
                      pattern="[A-Za-z]{3}"
                      maxLength={3}
                      value={p.currency}
                      onChange={(e) =>
                        setPosition(p.key, { currency: e.target.value })
                      }
                      className="uppercase"
                    />
                  </Field>
                  <Field label="Quantity" htmlFor={`p-qty-${p.key}`}>
                    <Input
                      id={`p-qty-${p.key}`}
                      required
                      inputMode="decimal"
                      value={p.quantity}
                      onChange={(e) =>
                        setPosition(p.key, { quantity: e.target.value })
                      }
                      className="figures"
                    />
                  </Field>
                  <Field label="Price" htmlFor={`p-price-${p.key}`}>
                    <Input
                      id={`p-price-${p.key}`}
                      inputMode="decimal"
                      value={p.price}
                      onChange={(e) =>
                        setPosition(p.key, { price: e.target.value })
                      }
                      className="figures"
                    />
                  </Field>
                  <Field
                    label="Average cost"
                    htmlFor={`p-cost-${p.key}`}
                    hint="Optional, per unit"
                    className="col-span-2"
                  >
                    <Input
                      id={`p-cost-${p.key}`}
                      inputMode="decimal"
                      value={p.averageCost}
                      onChange={(e) =>
                        setPosition(p.key, { averageCost: e.target.value })
                      }
                      className="figures"
                    />
                  </Field>
                  <Field
                    label="Market value"
                    htmlFor={`p-value-${p.key}`}
                    hint="Optional total; otherwise quantity × price."
                    className="col-span-2"
                  >
                    <Input
                      id={`p-value-${p.key}`}
                      inputMode="decimal"
                      value={p.value}
                      onChange={(e) =>
                        setPosition(p.key, { value: e.target.value })
                      }
                      className="figures"
                    />
                  </Field>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setPositions((rows) => [
                  ...rows,
                  {
                    key: key(),
                    symbol: "",
                    exchange: "",
                    name: "",
                    assetClass: "stock",
                    currency: account.currency,
                    quantity: "",
                    price: "",
                    averageCost: "",
                    value: "",
                  },
                ])
              }
            >
              <Plus className="size-4" />
              Add holding
            </Button>
          </fieldset>
        ) : null}

        {cpf ? (
          <fieldset className="space-y-3">
            <legend className="mb-3 text-[15px] font-bold">Balances</legend>
            <div className="grid grid-cols-2 gap-3">
              {cash
                .filter((c) => c.bucket)
                .map((c) => (
                  <Field
                    key={c.key}
                    label={`${cpfBucketLabels[c.bucket!]} (SGD)`}
                    htmlFor={`c-bucket-${c.bucket}`}
                  >
                    <Input
                      id={`c-bucket-${c.bucket}`}
                      inputMode="decimal"
                      value={c.amount}
                      onChange={(e) =>
                        setCashRow(c.key, { amount: e.target.value })
                      }
                      className="figures"
                    />
                  </Field>
                ))}
            </div>
            <p className="text-ink-3 text-[13px]">
              Retirement opens at 55, when Special closes.
            </p>
            {cash.some((c) => !c.bucket) ? (
              <Notice>
                An earlier entry recorded{" "}
                {cash
                  .filter((c) => !c.bucket)
                  .map((c) => `${c.currency} ${c.amount}`)
                  .join(", ")}{" "}
                without a split.{" "}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-4"
                  onClick={() =>
                    setCash((rows) => rows.filter((r) => r.bucket))
                  }
                >
                  Remove it
                </button>{" "}
                once you&apos;ve entered the balances above.
              </Notice>
            ) : null}
          </fieldset>
        ) : null}

        {cpf ? null : (
          <fieldset className="space-y-3">
            <legend className="mb-3 text-[15px] font-bold">
              {investments ? "Cash" : "Balance"}
            </legend>
            {cash.map((c, i) => (
              <div key={c.key} className="flex items-end gap-3">
                <Field label="Currency" htmlFor={`c-currency-${c.key}`}>
                  <Input
                    id={`c-currency-${c.key}`}
                    required
                    pattern="[A-Za-z]{3}"
                    maxLength={3}
                    value={c.currency}
                    onChange={(e) =>
                      setCashRow(c.key, { currency: e.target.value })
                    }
                    className="w-24 uppercase"
                  />
                </Field>
                <Field
                  label="Amount"
                  htmlFor={`c-amount-${c.key}`}
                  className="flex-1"
                >
                  <Input
                    id={`c-amount-${c.key}`}
                    inputMode="decimal"
                    required={!investments && i === 0}
                    value={c.amount}
                    onChange={(e) =>
                      setCashRow(c.key, { amount: e.target.value })
                    }
                    className="figures"
                  />
                </Field>
                {cash.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove ${c.currency || "cash"} balance`}
                    onClick={() =>
                      setCash((rows) => rows.filter((r) => r.key !== c.key))
                    }
                    className="rounded-ctl hover:bg-wash mb-1 grid size-8 place-items-center"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setCash((rows) => [
                  ...rows,
                  { key: key(), currency: "", amount: "" },
                ])
              }
            >
              <Plus className="size-4" />
              Add currency
            </Button>
          </fieldset>
        )}
      </form>
    </Drawer>
  );
}
