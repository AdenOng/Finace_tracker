"use client";
import { useT, useLocale } from "~/i18n/client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { formText } from "~/lib/form";
import { formatDate, formatMoney } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Planning = RouterOutputs["planning"]["overview"];

export function CardBills({
  data,
  accountId,
}: {
  data: Planning;
  accountId?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const labels = {
    paid: t.planning.cardBills.paidOff,
    unpaid: t.planning.cardBills.unpaid,
    partial: t.planning.cardBills.partiallyPaid,
    overdue: t.planning.cardBills.overdue,
  };
  const utils = api.useUtils();
  const refresh = () => utils.planning.invalidate();
  const link = api.planning.setPaymentBank.useMutation({ onSuccess: refresh });
  const create = api.planning.createStatement.useMutation({
    onSuccess: refresh,
  });
  const remove = api.planning.removeStatement.useMutation({
    onSuccess: refresh,
  });
  const [adding, setAdding] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const cards = data.accounts.filter(
    (a) => a.type === "credit_card" && (!accountId || a.id === accountId),
  );
  const error = link.error ?? create.error ?? remove.error;
  const busy = link.isPending || create.isPending || remove.isPending;
  const addingCard = data.accounts.find((a) => a.id === adding);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await create.mutateAsync({
      cardAccountId: adding!,
      statementDate: formText(form, "statementDate"),
      dueDate: formText(form, "dueDate"),
      amountDue: formText(form, "amountDue"),
    });
    setAdding(null);
  }

  return (
    <Section
      title={t.planning.cardBills.creditcardBills}
      amounts="card-bills"
      amountsFor={accountId}
      description={
        t.planning.cardBills.trackStatementBillsSeparatelyFromYourCurrentCard
      }
    >
      <div className="space-y-5">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {!cards.length ? (
          <p className="text-ink-2 text-sm">
            {t.planning.cardBills.addACreditcardAccountUnderAccountsToTrack}
          </p>
        ) : null}
        {cards.map((card) => {
          const profile = data.profiles.find(
            (p) => p.cardAccountId === card.id,
          );
          const bank = data.accounts.find(
            (a) => a.id === profile?.bankAccountId,
          );
          const bills = data.bills
            .filter((b) => b.cardAccountId === card.id)
            .reverse();
          return (
            <div
              key={card.id}
              className="border-line space-y-3 border-b pb-5 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">
                  <Link
                    href={`/accounts/${card.id}`}
                    className="hover:underline"
                  >
                    {card.name}
                  </Link>
                  {card.archived ? t.planning.cardBills.archived : ""}
                </h3>
                {!card.archived ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!bank || bank.archived || busy}
                    onClick={() => {
                      create.reset();
                      setAdding(card.id);
                    }}
                  >
                    {t.planning.cardBills.addStatementBill}
                  </Button>
                ) : null}
              </div>
              <p className="text-ink-2 text-sm">
                {t.planning.cardBills.paymentBank(
                  bank
                    ? `${bank.name}${bank.archived ? t.planning.cardBills.archivedSuffix : ""}`
                    : t.planning.cardBills.notLinked,
                )}
              </p>
              {!card.archived ? (
                <Field
                  label={t.planning.cardBills.bankFor(card.name)}
                  htmlFor={`payment-bank-${card.id}`}
                  hint={t.planning.cardBills.chooseBank(card.currency)}
                >
                  <Select
                    id={`payment-bank-${card.id}`}
                    className="max-w-md"
                    value={profile?.bankAccountId ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      link.mutate({
                        cardAccountId: card.id,
                        bankAccountId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">{t.planning.cardBills.notLinked}</option>
                    {data.accounts
                      .filter(
                        (a) =>
                          ["checking", "savings"].includes(a.type) &&
                          a.currency === card.currency &&
                          (!a.archived || a.id === bank?.id),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id} disabled={a.archived}>
                          {a.name}
                          {a.archived
                            ? t.planning.cardBills.archivedSuffix
                            : ""}
                        </option>
                      ))}
                  </Select>
                </Field>
              ) : null}
              {!bills.length ? (
                <p className="text-ink-2 text-sm">
                  {
                    t.planning.cardBills
                      .noStatementBillRecordedPaymentStatusIsUnknown
                  }
                </p>
              ) : null}
              <ul className="space-y-3">
                {bills.map((bill, index) => (
                  <li
                    key={bill.id}
                    className="bg-wash rounded-ctl space-y-2 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p>
                        {t.planning.cardBills.closed(
                          formatDate(bill.statementDate, locale),
                        )}
                      </p>
                      <Tag
                        tone={
                          bill.status === "overdue"
                            ? "loss"
                            : bill.status === "paid"
                              ? "brand"
                              : "warn"
                        }
                      >
                        {labels[bill.status]}
                        {bill.paidLate ? t.planning.cardBills.paidLate : ""}
                      </Tag>
                    </div>
                    <p>
                      {t.planning.cardBills.dueFrom(
                        formatDate(bill.dueDate, locale),
                        data.accounts.find((a) => a.id === bill.bankAccountId)
                          ?.name ?? t.planning.cardBills.unavailableBank,
                      )}
                    </p>
                    <div className="figures flex flex-wrap gap-x-5 gap-y-1">
                      <span>
                        {t.planning.cardBills.bill}{" "}
                        <span className="sensitive font-mono">
                          {formatMoney(bill.amountDue, bill.currency)}
                        </span>
                      </span>
                      <span>
                        {t.planning.cardBills.payments}{" "}
                        <span className="sensitive font-mono">
                          {formatMoney(bill.paid, bill.currency)}
                        </span>
                      </span>
                      <span>
                        {t.planning.cardBills.remaining}{" "}
                        <span className="sensitive font-mono">
                          {formatMoney(bill.remaining, bill.currency)}
                        </span>
                      </span>
                    </div>
                    {bill.paidOn ? (
                      <p>
                        {t.planning.cardBills.paidOn(
                          formatDate(bill.paidOn, locale),
                        )}
                      </p>
                    ) : null}
                    <p className="text-ink-2">
                      {index === 0
                        ? card.archived ||
                          data.accounts.find((a) => a.id === bill.bankAccountId)
                            ?.archived
                          ? t.planning.cardBills
                              .latestStatementArchivedAccountsAreExcludedFromForecasts
                          : bill.remaining === "0"
                            ? t.planning.cardBills
                                .latestStatementPaidOffWithNoRemainingAmount
                            : bill.dueDate > data.through
                              ? t.planning.cardBills
                                  .latestStatementDueBeyondTheSelectedForecastPeriod
                              : t.planning.cardBills
                                  .latestStatementItsRemainingBalanceIsIncludedIn
                        : t.planning.cardBills
                            .earlierStatementExcludedFromTheForecastBecauseA}
                    </p>
                    {bill.payments.length ? (
                      <details>
                        <summary className="cursor-pointer font-medium">
                          {
                            t.planning.cardBills
                              .confirmedPaymentsAfterThisStatement
                          }
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {bill.payments.map((p) => (
                            <li key={p.id}>
                              {formatDate(p.date, locale)} ·{" "}
                              <span className="sensitive">
                                {formatMoney(p.amount, p.currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p className="text-ink-2">
                        {
                          t.planning.cardBills
                            .noConfirmedBanktocardPaymentsFound
                        }
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        if (deleting !== bill.id) {
                          setDeleting(bill.id);
                          return;
                        }
                        remove.mutate(
                          { id: bill.id },
                          { onSuccess: () => setDeleting(null) },
                        );
                      }}
                    >
                      {deleting === bill.id
                        ? t.planning.cardBills.confirmRemoveBill
                        : t.planning.cardBills.removeBill}
                    </Button>
                    {deleting === bill.id ? (
                      <>
                        <span className="text-ink-2 ml-2">
                          {t.planning.cardBills.transactionsAndTransfersStay}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(null)}
                        >
                          {t.common.actions.cancel}
                        </Button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="text-ink-2 text-sm">
          {t.planning.cardBills.importOrRecordBothTheBankDebitAnd}{" "}
          <Link href="/spending/transfers" className="font-semibold underline">
            {t.planning.cardBills.transfers}
          </Link>
          {t.planning.cardBills.onlyConfirmedTransfersFromTheBillsPaymentBank}
        </p>
      </div>
      {addingCard ? (
        <Drawer
          open
          onClose={() => setAdding(null)}
          title={t.planning.cardBills.billTitle(addingCard.name)}
          description={
            t.planning.cardBills.enterTheFullStatementBalanceIncludingAnyCarried
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => void save(e).catch(() => undefined)}
          >
            {create.error ? (
              <Notice tone="error">{create.error.message}</Notice>
            ) : null}
            <Field
              label={t.planning.cardBills.statementClosingDate}
              htmlFor="bill-statement-date"
            >
              <Input
                id="bill-statement-date"
                name="statementDate"
                type="date"
                max={data.today}
                required
              />
            </Field>
            <Field
              label={t.planning.cardBills.paymentDueDate}
              htmlFor="bill-due-date"
            >
              <Input id="bill-due-date" name="dueDate" type="date" required />
            </Field>
            <Field
              label={t.planning.cardBills.fullAmount(addingCard.currency)}
              htmlFor="bill-amount"
            >
              <Input
                id="bill-amount"
                name="amountDue"
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </Field>
            <Button type="submit" loading={create.isPending}>
              {t.planning.cardBills.saveStatementBill}
            </Button>
          </form>
        </Drawer>
      ) : null}
    </Section>
  );
}

export function CardBillTracking({ accountId }: { accountId: string }) {
  const t = useT();
  const query = api.planning.overview.useQuery(
    { days: 30 },
    { staleTime: 0, refetchInterval: 30_000 },
  );
  if (query.error) return <Notice tone="error">{query.error.message}</Notice>;
  if (!query.data)
    return (
      <p className="text-ink-2 text-sm">
        {t.planning.cardBills.loadingCardBills}
      </p>
    );
  return <CardBills data={query.data} accountId={accountId} />;
}
