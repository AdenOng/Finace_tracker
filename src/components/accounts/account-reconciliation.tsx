"use client";

import { useT, useLocale } from "~/i18n/client";

import Decimal from "decimal.js";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select } from "~/components/ui/field";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Notice, Section } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { useFlash } from "~/components/ui/use-flash";
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
  const t = useT();
  const locale = useLocale();
  const utils = api.useUtils();
  const history = api.reconciliation.list.useQuery({ accountId });
  const reopen = api.reconciliation.reopen.useMutation();
  const [open, setOpen] = useState(false);
  const [reopening, setReopening] = useState<string | null>(null);
  const flash = useFlash();
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
      title={t.accounts.reconciliation.reconciliation}
      description={
        t.accounts.reconciliation
          .verifyStatementBalancesAndProtectTheEntriesYouHaveChecked
      }
      actions={
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {t.accounts.reconciliation.reconcileStatement}
        </Button>
      }
    >
      {history.error || reopen.error ? (
        <Notice tone="error" className="mb-4">
          {errorMessage((history.error ?? reopen.error)!)}
        </Notice>
      ) : null}
      <FlashNotice
        flash={flash.flash}
        onDismiss={flash.clear}
        className="mb-4"
      />
      {history.isLoading ? (
        <p className="text-ink-2 text-sm">
          {t.accounts.reconciliation.loadingStatementPeriods}
        </p>
      ) : null}
      {history.data?.length === 0 ? (
        <p className="text-ink-2 text-sm">
          {
            t.accounts.reconciliation
              .noReconciledStatementsYetEnterAStatementSOpeningAnd
          }
        </p>
      ) : null}
      {history.data?.length ? (
        <Table>
          <thead>
            <tr>
              <Th>{t.accounts.reconciliation.period}</Th>
              <Th className="text-right">
                {t.accounts.reconciliation.closingBalance}
              </Th>
              <Th>{t.accounts.reconciliation.actions}</Th>
            </tr>
          </thead>
          <tbody>
            {history.data.map((record) => (
              <Tr key={record.id}>
                <Td>
                  {formatDate(record.startDate, locale)} –{" "}
                  {formatDate(record.endDate, locale)}
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
                            flash.success(
                              t.accounts.reconciliation
                                .statementReopenedItsEntriesCanBeChangedAndReconciledAgain,
                            );
                            await refresh();
                          })
                          .catch(() => undefined);
                      }}
                    >
                      {reopening === record.id
                        ? t.accounts.reconciliation.confirmReopen
                        : t.accounts.reconciliation.reopen}
                    </Button>
                    {reopening === record.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReopening(null)}
                      >
                        {t.common.actions.cancel}
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
            flash.success(
              t.accounts.reconciliation
                .statementReconciledItsTransactionsAreClearedAndProtected,
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
  const t = useT();
  const locale = useLocale();
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
      title={t.accounts.reconciliation.reconcileStatement}
      className="max-w-2xl"
      description={
        t.accounts.reconciliation
          .openingBalanceAllSignedTransactionsClosingBalanceTransfersAreIncluded
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.actions.cancel}
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
            {t.accounts.reconciliation.finishReconciliation}
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
            <Field
              label={t.accounts.reconciliation.statementStart}
              htmlFor="reconcile-start"
            >
              <Input
                id="reconcile-start"
                name="startDate"
                type="date"
                required
                defaultValue={`${currentMonth()}-01`}
              />
            </Field>
            <Field
              label={t.accounts.reconciliation.statementEnd}
              htmlFor="reconcile-end"
            >
              <Input
                id="reconcile-end"
                name="endDate"
                type="date"
                required
                defaultValue={todayIso()}
              />
            </Field>
          </div>
          <Field
            label={t.accounts.reconciliation.statementCurrency}
            htmlFor="reconcile-currency"
          >
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
            <Field
              label={t.accounts.reconciliation.openingBalance}
              htmlFor="reconcile-opening"
            >
              <Input
                id="reconcile-opening"
                name="openingBalance"
                inputMode="decimal"
                required
                placeholder="0.00"
              />
            </Field>
            <Field
              label={t.accounts.reconciliation.closingBalance}
              htmlFor="reconcile-closing"
            >
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
            {
              t.accounts.reconciliation
                .useTheBalanceBeforeTheFirstDayAndAfterThe
            }
          </p>
          <Button
            type="submit"
            variant="secondary"
            loading={preview.isFetching}
          >
            {t.accounts.reconciliation.reviewTransactions}
          </Button>
        </form>
        {data && period ? (
          <>
            {data.overlaps ? (
              <Notice tone="warn">
                {
                  t.accounts.reconciliation
                    .thisPeriodOverlapsAReconciledStatementReopenItBeforeContinuing
                }
              </Notice>
            ) : null}
            <dl className="bg-wash grid grid-cols-2 gap-4 p-4 text-sm">
              <div>
                <dt>{t.accounts.reconciliation.expectedClosingBalance}</dt>
                <dd className="figures font-semibold">
                  {formatMoney(data.expectedClosing, period.currency)}
                </dd>
              </div>
              <div>
                <dt>{t.accounts.reconciliation.difference}</dt>
                <dd className="figures font-semibold">
                  {formatMoney(data.difference, period.currency, {
                    signed: true,
                  })}
                </dd>
              </div>
            </dl>
            {!matching ? (
              <Notice tone="warn">
                {t.accounts.reconciliation.mismatch(
                  data.difference,
                  period.currency,
                )}
              </Notice>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {t.accounts.reconciliation.verifiedCount(
                  verified.size,
                  data.rows.length,
                )}
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
                  ? t.accounts.reconciliation.uncheckAll
                  : t.accounts.reconciliation.verifyAllEntries}
              </Button>
            </div>
            {data.rows.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>{t.accounts.reconciliation.verified}</Th>
                    <Th>{t.accounts.reconciliation.dateDescription}</Th>
                    <Th className="text-right">{t.common.fields.amount}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <Tr key={row.id}>
                      <Td>
                        <input
                          type="checkbox"
                          className="accent-brand size-4"
                          aria-label={t.accounts.reconciliation.verify(
                            row.description,
                            row.postedDate,
                          )}
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
                          {formatDate(row.postedDate, locale)}
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
                {
                  t.accounts.reconciliation
                    .noEntriesInThisPeriodAndCurrencyOnlyFinishIf
                }
              </p>
            )}
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
