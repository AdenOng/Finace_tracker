"use client";
import { useT, useLocale } from "~/i18n/client";

import Decimal from "decimal.js";
import { useState } from "react";
import { CardBills } from "~/components/planning/card-bills";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";
import {
  type Direction,
  DirectionToggle,
  signedAmount,
} from "~/components/ui/direction-toggle";
import { Field, Input, Select } from "~/components/ui/field";
import { Notice, PageHeader, Section, Tag } from "~/components/ui/panel";
import { isCashFlowAccount } from "~/lib/cash-flow";
import { isBalanceStale } from "~/lib/balance-freshness";
import { formText } from "~/lib/form";
import { formatDate, formatMoney } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Forecast = RouterOutputs["planning"]["overview"]["forecasts"][number];

export function ForecastChart({ points }: { points: Forecast["points"] }) {
  const t = useT();
  const locale = useLocale();
  const values = points.flatMap((p) =>
    p.balance === null ? [] : [new Decimal(p.balance)],
  );
  if (!values.length) return null;
  const min = Decimal.min(...values);
  const max = Decimal.max(...values);
  const range = max.minus(min);
  const path = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${((i / Math.max(1, values.length - 1)) * 600).toFixed(2)},${range.isZero() ? 70 : (130 - v.minus(min).div(range).times(120).toNumber()).toFixed(2)}`,
    )
    .join(" ");
  return (
    <figure
      className="my-5"
      aria-label={
        t.planning.cashFlowView
          .dailyProjectedAccountBalanceExactDailyBalancesAre
      }
    >
      <svg
        viewBox="0 0 600 140"
        className="text-brand h-36 w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="text-ink-2 flex justify-between text-xs">
        <span>{formatDate(points[0]!.date, locale)}</span>
        <span>{formatDate(points.at(-1)!.date, locale)}</span>
      </figcaption>
    </figure>
  );
}

export function CashFlowView() {
  const t = useT();
  const locale = useLocale();
  const utils = api.useUtils();
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const query = api.planning.overview.useQuery(
    { days },
    { staleTime: 0, refetchInterval: 30_000 },
  );
  const refresh = () => utils.planning.invalidate();
  const create = api.planning.createSchedule.useMutation({
    onSuccess: refresh,
  });
  const pause = api.planning.setActive.useMutation({ onSuccess: refresh });
  const remove = api.planning.removeSchedule.useMutation({
    onSuccess: refresh,
  });
  const decide = api.planning.decideOccurrence.useMutation({
    onSuccess: refresh,
  });
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">(
    "monthly",
  );
  const [direction, setDirection] = useState<Direction>("out");
  const error = create.error ?? pause.error ?? remove.error ?? decide.error;
  const busy =
    create.isPending || pause.isPending || remove.isPending || decide.isPending;
  const data = query.data;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await create.mutateAsync({
      accountId: formText(form, "accountId"),
      name: formText(form, "name"),
      amount: signedAmount(direction, formText(form, "amount").trim()),
      frequency,
      startDate: formText(form, "startDate"),
      endDate: formText(form, "endDate") || null,
    });
    setAdding(false);
  }

  if (query.error) return <Notice tone="error">{query.error.message}</Notice>;
  if (!data)
    return (
      <p className="text-ink-2">{t.planning.cashFlowView.loadingCashFlow}</p>
    );
  const cashAccounts = data.accounts.filter(
    (a) => !a.archived && isCashFlowAccount(a.type),
  );
  const forecast =
    data.forecasts.find((f) => f.accountId === selectedAccount) ??
    data.forecasts[0];
  const occurrences = data.occurrences.filter(
    (o) => showReviewed || (!o.matched && !o.skipped),
  );
  return (
    <>
      <PageHeader
        title={t.planning.cashFlowView.cashFlow}
        description={
          t.planning.cashFlowView
            .planRecurringIncomeBillsAndCreditcardPaymentsWithout
        }
        actions={
          <Button
            disabled={!cashAccounts.length}
            onClick={() => {
              create.reset();
              setDirection("out");
              setAdding(true);
            }}
          >
            {t.planning.cashFlowView.addRecurringItem}
          </Button>
        }
      />
      <div className="space-y-4">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        <Section
          title={t.planning.cashFlowView.cashflowForecast}
          amounts="cash-flow-forecast"
          description={
            t.planning.cashFlowView
              .recordedClosingBalancePlusLaterPostedTransactionsThen
          }
        >
          <div className="mb-5 flex flex-wrap gap-4">
            <Field
              label={t.planning.cashFlowView.account}
              htmlFor="forecast-account"
              className="min-w-0 grow basis-56"
            >
              <Select
                id="forecast-account"
                value={forecast?.accountId ?? ""}
                onChange={(e) => setSelectedAccount(e.target.value)}
              >
                {!data.forecasts.length ? (
                  <option value="">
                    {t.planning.cashFlowView.noBankOrCashAccounts}
                  </option>
                ) : null}
                {data.forecasts.map((f) => (
                  <option key={f.accountId} value={f.accountId}>
                    {f.name} · {f.currency}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t.planning.cashFlowView.forecastPeriod}
              htmlFor="forecast-period"
            >
              <Select
                id="forecast-period"
                value={days}
                onChange={(e) =>
                  setDays(Number(e.target.value) as 30 | 60 | 90)
                }
              >
                <option value={30}>{t.planning.cashFlowView["30Days"]}</option>
                <option value={60}>{t.planning.cashFlowView["60Days"]}</option>
                <option value={90}>{t.planning.cashFlowView["90Days"]}</option>
              </Select>
            </Field>
          </div>
          {forecast ? (
            <>
              {forecast.balance === null ? (
                <Notice tone="warn">
                  {t.planning.cashFlowView.recordBalance(
                    forecast.currency,
                    forecast.name,
                  )}
                </Notice>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      [
                        t.planning.cashFlowView.estimatedToday,
                        forecast.balance,
                      ],
                      [
                        t.planning.cashFlowView.endOfForecast,
                        forecast.projected,
                      ],
                      [
                        t.planning.cashFlowView.lowestProjectedBalance,
                        forecast.lowest,
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-ink-2 text-sm">{label}</p>
                        <p className="figures sensitive mt-1 font-mono text-xl">
                          {formatMoney(value!, forecast.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                  {forecast.lowest && new Decimal(forecast.lowest).lt(0) ? (
                    <Notice className="mt-4" tone="warn">
                      {
                        t.planning.cashFlowView
                          .thisAccountIsProjectedToGoBelowZero
                      }
                    </Notice>
                  ) : null}
                  <ForecastChart points={forecast.points} />
                  <details className="text-sm">
                    <summary className="cursor-pointer">
                      {t.planning.cashFlowView.dailyProjectedBalances}
                    </summary>
                    <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {forecast.points.map((p) => (
                        <li key={p.date} className="flex justify-between gap-3">
                          <span>{formatDate(p.date, locale)}</span>
                          <span className="sensitive figures font-mono">
                            {formatMoney(p.balance!, forecast.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
              {forecast.asOf ? (
                <p className="text-ink-2 mt-4 text-sm">
                  {t.planning.cashFlowView.startingBalance(
                    formatDate(forecast.asOf, locale),
                  )}{" "}
                  {isBalanceStale(forecast.asOf, data.today)
                    ? t.planning.cashFlowView.thisBalanceIsStaleUpdateItForA
                    : ""}
                </p>
              ) : null}
              <h3 className="mt-5 mb-2 font-medium">
                {t.planning.cashFlowView.outstandingPlannedCashFlows}
              </h3>
              {forecast.events.length ? (
                <ul className="divide-line divide-y text-sm">
                  {forecast.events
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((event, index) => (
                      <li
                        key={`${event.name}-${event.date}-${index}`}
                        className="flex flex-wrap justify-between gap-2 py-2"
                      >
                        <span>
                          {event.name} · {formatDate(event.date, locale)}
                          {event.date < data.today
                            ? t.planning.cashFlowView.overdueReservedToday
                            : ""}
                        </span>
                        <span className="sensitive figures font-mono">
                          {formatMoney(event.amount, forecast.currency, {
                            signed: true,
                          })}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-ink-2 text-sm">
                  {
                    t.planning.cashFlowView
                      .noOutstandingPlannedCashFlowsInThisPeriod
                  }
                </p>
              )}
            </>
          ) : (
            <p className="text-ink-2 text-sm">
              {t.planning.cashFlowView.addABankOrCashAccountUnderAccounts}
            </p>
          )}
          <p className="text-ink-2 mt-4 text-sm">
            {
              t.planning.cashFlowView
                .estimatesIncludeOnlyEnteredPlansAndStatementsOverdue
            }
          </p>
        </Section>

        <Section
          title={t.planning.cashFlowView.recurringItems}
          amounts="cash-flow-schedules"
          description={
            t.planning.cashFlowView
              .positiveAmountsAreIncomeNegativeAmountsAreBills
          }
        >
          {!data.schedules.length ? (
            <p className="text-ink-2 text-sm">
              {
                t.planning.cashFlowView
                  .addSalaryRentSubscriptionsOrAnotherRegularCash
              }
            </p>
          ) : (
            <ul className="divide-line divide-y">
              {data.schedules.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {s.name}{" "}
                      {!s.active ? (
                        <Tag>{t.planning.cashFlowView.paused}</Tag>
                      ) : null}
                    </p>
                    <p className="text-ink-2 text-sm">
                      {data.accounts.find((a) => a.id === s.accountId)?.name} ·{" "}
                      {t.planning.cashFlowView.scheduleDates(
                        t.planning.cashFlowView.frequencies[s.frequency],
                        formatDate(s.startDate, locale),
                        s.endDate ? formatDate(s.endDate, locale) : null,
                      )}{" "}
                      ·{" "}
                      <span className="sensitive figures font-mono">
                        {formatMoney(s.amount, s.currency, { signed: true })}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        busy ||
                        data.accounts.find((a) => a.id === s.accountId)
                          ?.archived
                      }
                      onClick={() =>
                        pause.mutate({ id: s.id, active: !s.active })
                      }
                    >
                      {s.active
                        ? t.planning.cashFlowView.pause
                        : t.planning.cashFlowView.resume}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={
                        busy ||
                        data.accounts.find((a) => a.id === s.accountId)
                          ?.archived
                      }
                      onClick={() => {
                        if (deleting !== s.id) {
                          setDeleting(s.id);
                          return;
                        }
                        remove.mutate(
                          { id: s.id },
                          { onSuccess: () => setDeleting(null) },
                        );
                      }}
                    >
                      {deleting === s.id
                        ? t.planning.cashFlowView.confirmRemovePlan
                        : t.common.actions.remove}
                    </Button>
                    {deleting === s.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleting(null)}
                      >
                        {t.common.actions.cancel}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={t.planning.cashFlowView.matchRecordedPayments}
          amounts="cash-flow-occurrences"
          description={
            t.planning.cashFlowView
              .suggestionsMatchTheAccountCurrencyAndSignedAmount
          }
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowReviewed(!showReviewed)}
            >
              {showReviewed
                ? t.planning.cashFlowView.hideReviewed
                : t.planning.cashFlowView.showReviewed}
            </Button>
          }
        >
          {!occurrences.length ? (
            <p className="text-ink-2 text-sm">
              {t.planning.cashFlowView.noOccurrencesToReviewInThisPeriod}
            </p>
          ) : (
            <ul className="divide-line divide-y">
              {occurrences.map((o) => (
                <li
                  key={`${o.scheduleId}-${o.dueDate}`}
                  className="space-y-2 py-4"
                >
                  <p className="font-medium">
                    {o.name} · {formatDate(o.dueDate, locale)} ·{" "}
                    <span className="sensitive figures font-mono">
                      {formatMoney(o.amount, o.currency, { signed: true })}
                    </span>
                  </p>
                  <p className="text-ink-2 text-sm">
                    {data.accounts.find((a) => a.id === o.accountId)?.name}
                    {o.matched
                      ? t.planning.cashFlowView.matched(
                          o.matched.description,
                          formatDate(o.matched.postedDate, locale),
                        )
                      : o.skipped
                        ? t.planning.cashFlowView.skipped
                        : o.dueDate < data.today
                          ? t.planning.cashFlowView.overdue
                          : t.planning.cashFlowView.expected}
                  </p>
                  {o.staleMatch ? (
                    <p className="text-warn text-sm">
                      {
                        t.planning.cashFlowView
                          .theMatchedTransactionChangedThisAmountIsForecast
                      }
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {o.suggestions.map((transaction) => (
                      <Button
                        key={transaction.id}
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        className="h-auto min-h-8 max-w-full py-1 text-left whitespace-normal"
                        onClick={() =>
                          decide.mutate({
                            scheduleId: o.scheduleId,
                            dueDate: o.dueDate,
                            action: "match",
                            transactionId: transaction.id,
                          })
                        }
                      >
                        {t.planning.cashFlowView.matchPayment(
                          transaction.description,
                          formatDate(transaction.postedDate, locale),
                        )}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        decide.mutate({
                          scheduleId: o.scheduleId,
                          dueDate: o.dueDate,
                          action:
                            o.matched || o.skipped || o.staleMatch
                              ? "reset"
                              : "skip",
                        })
                      }
                    >
                      {o.matched || o.skipped || o.staleMatch
                        ? t.planning.cashFlowView.clearDecision
                        : t.planning.cashFlowView.skipThisOccurrence}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <CardBills data={data} />
      </div>
      {adding ? (
        <Drawer
          open
          onClose={() => setAdding(false)}
          title={t.planning.cashFlowView.addRecurringItem}
          description={t.planning.cashFlowView.useABankOrCashAccountCardBills}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => void save(e).catch(() => undefined)}
          >
            {create.error ? (
              <Notice tone="error">{create.error.message}</Notice>
            ) : null}
            <Field label={t.common.fields.name} htmlFor="schedule-name">
              <Input
                id="schedule-name"
                name="name"
                required
                maxLength={120}
                placeholder={t.planning.cashFlowView.salaryRentSubscriptions}
              />
            </Field>
            <Field
              label={t.planning.cashFlowView.account}
              htmlFor="schedule-account"
            >
              <Select id="schedule-account" name="accountId" required>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
              </Select>
            </Field>
            <DirectionToggle
              value={direction}
              onChange={setDirection}
              label={t.planning.cashFlowView.direction}
              outLabel={t.planning.cashFlowView.moneyOut}
              inLabel={t.planning.cashFlowView.moneyIn}
            />
            <Field
              label={t.planning.cashFlowView.amountInAccountCurrency}
              htmlFor="schedule-amount"
              hint={t.planning.cashFlowView.aPositiveAmountUpToFourDecimals}
            >
              <Input
                id="schedule-amount"
                name="amount"
                inputMode="decimal"
                pattern="\d+(\.\d{1,4})?"
                title={t.planning.cashFlowView.aPositiveAmountUpToFourDecimals}
                required
                className="figures"
              />
            </Field>
            <Field
              label={t.planning.cashFlowView.repeat}
              htmlFor="schedule-frequency"
            >
              <Select
                id="schedule-frequency"
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as typeof frequency)
                }
              >
                <option value="weekly">{t.planning.cashFlowView.weekly}</option>
                <option value="monthly">
                  {t.planning.cashFlowView.monthly}
                </option>
                <option value="yearly">{t.planning.cashFlowView.yearly}</option>
              </Select>
            </Field>
            <Field
              label={t.planning.cashFlowView.firstDueDate}
              htmlFor="schedule-start"
              hint={
                t.planning.cashFlowView.chooseTheFirstOccurrenceYouWantToTrack
              }
            >
              <Input
                id="schedule-start"
                name="startDate"
                type="date"
                defaultValue={data.today}
                required
              />
            </Field>
            <Field
              label={t.planning.cashFlowView.lastDueDateOptional}
              htmlFor="schedule-end"
            >
              <Input id="schedule-end" name="endDate" type="date" />
            </Field>
            <Button type="submit" loading={create.isPending}>
              {t.planning.cashFlowView.addRecurringItem}
            </Button>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
