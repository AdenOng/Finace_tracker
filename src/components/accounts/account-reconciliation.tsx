"use client";

import Decimal from "decimal.js";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice, Section } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { currentMonth, todayIso } from "~/lib/dates";
import { errorMessage } from "~/lib/errors";
import { formatDate, formatMoney } from "~/lib/format";
import { formText } from "~/lib/form";
import { api, type RouterInputs } from "~/trpc/react";

export function AccountReconciliation({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const utils = api.useUtils();
  const history = api.reconciliation.list.useQuery({ accountId });
  const reopen = api.reconciliation.reopen.useMutation();
  const [open, setOpen] = useState(false);
  const [reopening, setReopening] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  async function refresh() {
    await Promise.all([
      utils.reconciliation.invalidate(),
      utils.spending.list.invalidate(),
      utils.merchantRules.preview.invalidate(),
    ]);
  }

  return (
    <Section
      amounts="account-reconciliation"
      amountsFor={accountId}
      title="Reconciliation"
      description="Verify statement balances and protect the entries you have checked."
      actions={
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Reconcile statement
        </Button>
      }
    >
      {history.error || reopen.error ? (
        <Notice tone="error" className="mb-4">
          {errorMessage((history.error ?? reopen.error)!)}
        </Notice>
      ) : null}
      {flash ? (
        <Notice tone="success" className="mb-4">
          {flash}
        </Notice>
      ) : null}
      {history.isLoading ? (
        <p className="text-ink-2 text-sm">Loading statement periods…</p>
      ) : null}
      {history.data?.length === 0 ? (
        <p className="text-ink-2 text-sm">
          No reconciled statements yet. Enter a statement’s opening and closing
          balances, then check its transactions.
        </p>
      ) : null}
      {history.data?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Period</Th>
              <Th className="text-right">Closing balance</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {history.data.map((record) => (
              <Tr key={record.id}>
                <Td>
                  {formatDate(record.startDate)} – {formatDate(record.endDate)}
                </Td>
                <Td className="figures text-right">
                  <span className="sensitive">
                    {formatMoney(record.closingBalance, record.currency)}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={reopen.isPending && reopening === record.id}
                      disabled={reopen.isPending}
                      onClick={() => {
                        if (reopening !== record.id) {
                          setReopening(record.id);
                          reopen.reset();
                          return;
                        }
                        void reopen
                          .mutateAsync({ id: record.id })
                          .then(async () => {
                            setReopening(null);
                            setFlash(
                              "Statement reopened. Its entries can be changed and reconciled again.",
                            );
                            await refresh();
                          })
                          .catch(() => undefined);
                      }}
                    >
                      {reopening === record.id ? "Confirm reopen" : "Reopen"}
                    </Button>
                    {reopening === record.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReopening(null)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {open ? (
        <ReconciliationDrawer
          accountId={accountId}
          currency={currency}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            setFlash(
              "Statement reconciled. Its transactions are cleared and protected.",
            );
            await refresh();
          }}
        />
      ) : null}
    </Section>
  );
}

function ReconciliationDrawer({
  accountId,
  currency,
  onClose,
  onSaved,
}: {
  accountId: string;
  currency: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [currencies] = api.catalog.currencies.useSuspenseQuery();
  const [period, setPeriod] = useState<
    RouterInputs["reconciliation"]["preview"] | null
  >(null);
  const [verification, setVerification] = useState<{
    revision: string;
    ids: Set<string>;
  } | null>(null);
  const finish = api.reconciliation.finish.useMutation();
  const preview = api.reconciliation.preview.useQuery(
    period ?? {
      accountId,
      currency,
      startDate: `${currentMonth()}-01`,
      endDate: todayIso(),
      openingBalance: "0",
      closingBalance: "0",
    },
    { enabled: period !== null, retry: false, staleTime: 0 },
  );
  const data = period ? preview.data : undefined;
  const verified =
    data && verification?.revision === data.revision
      ? verification.ids
      : new Set<string>();
  const matching = data ? new Decimal(data.difference).isZero() : false;
  const ready =
    !!data &&
    !data.overlaps &&
    matching &&
    verified.size === data.rows.length &&
    !preview.isFetching;
  const error = finish.error ?? (period ? preview.error : null);

  function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    finish.reset();
    setVerification(null);
    const nextPeriod = {
      accountId,
      currency: formText(form, "currency"),
      startDate: formText(form, "startDate"),
      endDate: formText(form, "endDate"),
      openingBalance: formText(form, "openingBalance"),
      closingBalance: formText(form, "closingBalance"),
    };
    if (JSON.stringify(nextPeriod) === JSON.stringify(period)) {
      void preview.refetch();
    }
    setPeriod(nextPeriod);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Reconcile statement"
      className="max-w-2xl"
      description="Opening balance + all signed transactions = closing balance. Transfers are included. Reconcile each currency separately."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={finish.isPending}
            disabled={!ready || finish.isPending}
            onClick={() => {
              if (period && data)
                void finish
                  .mutateAsync({
                    ...period,
                    revision: data.revision,
                    verifiedIds: [...verified],
                  })
                  .then(onSaved)
                  .catch(() => undefined);
            }}
          >
            Finish reconciliation
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}
        <form
          className="space-y-4"
          onSubmit={review}
          onChange={() => {
            setPeriod(null);
            setVerification(null);
            finish.reset();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Statement start" htmlFor="reconcile-start">
              <Input
                id="reconcile-start"
                name="startDate"
                type="date"
                required
                defaultValue={`${currentMonth()}-01`}
              />
            </Field>
            <Field label="Statement end" htmlFor="reconcile-end">
              <Input
                id="reconcile-end"
                name="endDate"
                type="date"
                required
                defaultValue={todayIso()}
              />
            </Field>
          </div>
          <Field label="Statement currency" htmlFor="reconcile-currency">
            <Select
              id="reconcile-currency"
              name="currency"
              defaultValue={currency}
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Opening balance" htmlFor="reconcile-opening">
              <Input
                id="reconcile-opening"
                name="openingBalance"
                inputMode="decimal"
                required
                placeholder="0.00"
              />
            </Field>
            <Field label="Closing balance" htmlFor="reconcile-closing">
              <Input
                id="reconcile-closing"
                name="closingBalance"
                inputMode="decimal"
                required
                placeholder="0.00"
              />
            </Field>
          </div>
          <p className="text-ink-2 text-sm">
            Use the balance before the first day and after the last day. Amounts
            owed on a credit card are negative. This check does not update your
            portfolio balance snapshot.
          </p>
          <Button
            type="submit"
            variant="secondary"
            loading={preview.isFetching}
          >
            Review transactions
          </Button>
        </form>
        {data && period ? (
          <>
            {data.overlaps ? (
              <Notice tone="warn">
                This period overlaps a reconciled statement. Reopen it before
                continuing.
              </Notice>
            ) : null}
            <dl className="bg-wash grid grid-cols-2 gap-4 p-4 text-sm">
              <div>
                <dt>Expected closing balance</dt>
                <dd className="figures font-semibold">
                  {formatMoney(data.expectedClosing, period.currency)}
                </dd>
              </div>
              <div>
                <dt>Difference</dt>
                <dd className="figures font-semibold">
                  {formatMoney(data.difference, period.currency, {
                    signed: true,
                  })}
                </dd>
              </div>
            </dl>
            {!matching ? (
              <Notice tone="warn">
                Balances do not match. Check for missing or duplicate
                transactions, incorrect amounts, and the statement dates.
                Correct the entries in Spending, then review again. Exact
                difference: {data.difference} {period.currency}.
              </Notice>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {verified.size} of {data.rows.length} entries verified against
                the statement.
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={data.overlaps || finish.isPending}
                onClick={() =>
                  setVerification({
                    revision: data.revision,
                    ids:
                      verified.size === data.rows.length
                        ? new Set()
                        : new Set(data.rows.map((r) => r.id)),
                  })
                }
              >
                {verified.size === data.rows.length && data.rows.length > 0
                  ? "Uncheck all"
                  : "Verify all entries"}
              </Button>
            </div>
            {data.rows.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Verified</Th>
                    <Th>Date / description</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <input
                          type="checkbox"
                          className="accent-brand size-4"
                          aria-label={`Verify ${row.description} on ${row.postedDate}`}
                          checked={verified.has(row.id)}
                          disabled={data.overlaps || finish.isPending}
                          onChange={(e) => {
                            const ids = new Set(verified);
                            if (e.target.checked) ids.add(row.id);
                            else ids.delete(row.id);
                            setVerification({ revision: data.revision, ids });
                          }}
                        />
                      </Td>
                      <Td>
                        <span className="text-ink-3 block text-[13px]">
                          {formatDate(row.postedDate)}
                        </span>
                        {row.merchant ?? row.description}
                      </Td>
                      <Td className="figures text-right">
                        {formatMoney(row.amount, row.currency, {
                          signed: true,
                        })}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-ink-2 text-sm">
                No entries in this period and currency. Only finish if the
                unchanged balance matches your statement.
              </p>
            )}
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
