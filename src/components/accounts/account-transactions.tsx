"use client";

import { useT, useLocale, categoryLabel } from "~/i18n/client";

import Decimal from "decimal.js";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

import { TransactionDrawer } from "~/components/spending/transaction-drawer";
import { Button } from "~/components/ui/button";
import { Section } from "~/components/ui/panel";
import { cn } from "~/lib/cn";
import { currentMonth, shiftMonth } from "~/lib/dates";
import { formatDate, formatMoney, formatMonth } from "~/lib/format";
import { api } from "~/trpc/react";

const SHOWN = 12;

/** A bank or card account's transactions for one month, with in/out totals. */
export function AccountTransactions({
  accountId,
  readOnly,
  allHref,
}: {
  accountId: string;
  readOnly: boolean;
  allHref: string;
}) {
  const t = useT();
  const locale = useLocale();
  const utils = api.useUtils();
  // The month comes from the browser's clock, so it is set after hydration.
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => setMonth(currentMonth()), []);
  const [adding, setAdding] = useState(false);
  const list = api.spending.list.useQuery(
    { month: month ?? "2000-01", accountId, categoryId: null, limit: SHOWN },
    { enabled: !!month, placeholderData: (previous) => previous },
  );

  const rows = list.data ?? [];
  const summary = api.spending.summary.useQuery(
    { month: month ?? "2000-01", accountId },
    { enabled: !!month, placeholderData: (previous) => previous },
  );
  const total = (field: "spent" | "received") =>
    (summary.data ?? []).reduce(
      (sum, row) => sum.plus(row[field]),
      new Decimal(0),
    );
  const currency = summary.data?.[0]?.currency ?? rows[0]?.currency;

  return (
    <Section
      amounts="account-transactions"
      amountsFor={accountId}
      title={t.accounts.transactions.transactions}
      description={
        t.accounts.transactions.whatCameInAndWentOutTransfersBetweenYourOwn
      }
      actions={
        readOnly ? undefined : (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            {t.accounts.transactions.addTransaction}
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t.accounts.transactions.previousMonth}
            disabled={!month}
            onClick={() => setMonth((m) => (m ? shiftMonth(m, -1) : m))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-32 text-center text-[15px] font-semibold">
            {month ? formatMonth(month, locale) : " "}
          </p>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t.accounts.transactions.nextMonth}
            disabled={!month}
            onClick={() => setMonth((m) => (m ? shiftMonth(m, 1) : m))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {currency ? (
          <p className="figures font-mono text-[13px]">
            <span className="text-gain">
              {t.accounts.transactions.in}{" "}
              <span className="sensitive">
                {formatMoney(total("received").toFixed(2), currency)}
              </span>
            </span>
            <span className="text-ink-3 mx-2">·</span>
            <span className="text-loss">
              {t.accounts.transactions.out}{" "}
              <span className="sensitive">
                {formatMoney(total("spent").toFixed(2), currency)}
              </span>
            </span>
          </p>
        ) : null}
      </div>

      {list.isLoading || !month ? (
        <p className="text-ink-3 text-sm">{t.common.status.loading}</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-2 border-line-2 rounded-ctl border border-dashed px-5 py-6 text-sm">
          {t.accounts.transactions.empty(formatMonth(month, locale))}
        </p>
      ) : (
        <ul>
          {rows.slice(0, SHOWN).map((r) => {
            const amount = new Decimal(r.amount);
            return (
              <li
                key={r.id}
                className="border-line grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 border-b py-2.5 text-[13px] last:border-b-0"
              >
                <span className="figures text-ink-3 font-mono text-[12px]">
                  {formatDate(r.postedDate, locale).replace(/ \d{4}$/, "")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {r.merchant ?? r.description}
                  </span>
                  <span className="text-ink-3 block truncate text-[12px]">
                    {r.isTransfer
                      ? t.accounts.transactions.transfer
                      : r.categoryName
                        ? categoryLabel(t, r.categoryName)
                        : t.accounts.transactions.notCategorised}
                  </span>
                </span>
                <span
                  className={cn(
                    "figures font-mono font-semibold",
                    r.isTransfer
                      ? "text-ink-3"
                      : amount.isPositive()
                        ? "text-gain"
                        : undefined,
                  )}
                >
                  <span className="sensitive">
                    {formatMoney(r.amount, r.currency, { signed: true })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={allHref}
        className="mt-4 inline-block text-[13px] font-semibold underline decoration-current/30 underline-offset-4 hover:decoration-current"
      >
        {t.accounts.transactions.openInSpending}
      </Link>

      {adding ? (
        <Suspense fallback={null}>
          <TransactionDrawer
            transaction="new"
            defaultAccountId={accountId}
            onClose={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await Promise.all([
                utils.spending.invalidate(),
                utils.reconciliation.invalidate(),
              ]);
            }}
          />
        </Suspense>
      ) : null}
    </Section>
  );
}
