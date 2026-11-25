"use client";

import Decimal from "decimal.js";
import { MobileTransactionRow } from "~/components/spending/mobile-transaction-row";
import { CategoryLabel } from "~/components/spending/monthly-summary-card";
import { Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { useLocale, useT } from "~/i18n/client";
import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";
import { type RouterOutputs } from "~/trpc/react";

type Transaction = RouterOutputs["spending"]["list"][number];

export function TransactionTable({
  rows,
  selected,
  selectionBusy,
  allSelected,
  placeholder,
  onToggleAll,
  onToggle,
  onEdit,
}: {
  rows: Transaction[];
  selected: ReadonlySet<string>;
  selectionBusy: boolean;
  allSelected: boolean;
  placeholder: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggle: (id: string) => void;
  onEdit: (row: Transaction) => void;
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <>
      <div className={cn("sm:hidden", placeholder && "opacity-60")}>
        <label className="text-ink-3 mb-1 flex min-h-10 items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            className="accent-brand size-4"
            aria-label={t.spending.spendingView.selectAllVisibleTransactions}
            disabled={selectionBusy}
            checked={allSelected}
            onChange={(e) => onToggleAll(e.target.checked)}
          />
          {t.spending.spendingView.selectAll}
        </label>
        <ul className="divide-line divide-y">
          {rows.map((row) => (
            <MobileTransactionRow
              key={row.id}
              transaction={row}
              selected={selected.has(row.id)}
              disabled={
                selectionBusy || (!selected.has(row.id) && selected.size >= 500)
              }
              onSelect={() => onToggle(row.id)}
              onEdit={() => onEdit(row)}
            />
          ))}
        </ul>
      </div>
      <Table className={cn("hidden sm:block", placeholder && "opacity-60")}>
        <thead>
          <tr>
            <Th>
              <input
                type="checkbox"
                className="accent-brand size-4"
                aria-label={
                  t.spending.spendingView.selectAllVisibleTransactions
                }
                disabled={selectionBusy}
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
            </Th>
            <Th>{t.common.fields.date}</Th>
            <Th>{t.spending.spendingView.description}</Th>
            <Th>{t.spending.spendingView.account}</Th>
            <Th>{t.spending.spendingView.category}</Th>
            <Th>{t.common.fields.status}</Th>
            <Th className="text-right">{t.common.fields.amount}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const incoming = new Decimal(row.amount).isPositive();
            return (
              <Tr
                key={row.id}
                className={selected.has(row.id) ? "bg-brand-soft" : undefined}
              >
                <Td>
                  <input
                    type="checkbox"
                    className="accent-brand size-4"
                    aria-label={t.spending.spendingView.selectTransaction(
                      row.description,
                      row.postedDate,
                    )}
                    disabled={
                      selectionBusy ||
                      (!selected.has(row.id) && selected.size >= 500)
                    }
                    checked={selected.has(row.id)}
                    onChange={() => onToggle(row.id)}
                  />
                </Td>
                <Td className="text-ink-2 whitespace-nowrap">
                  {formatDate(row.postedDate, locale)}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="text-left font-semibold hover:underline hover:underline-offset-4"
                  >
                    {row.merchant ?? row.description}
                  </button>
                  {row.merchant ? (
                    <span className="text-ink-3 block text-[13px]">
                      {row.description}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-ink-2">{row.accountName}</Td>
                <Td>
                  {row.isTransfer ? (
                    <Tag tone="outline">
                      {row.transferLinkId
                        ? t.spending.spendingView.transferLinked
                        : t.spending.spendingView.transfer}
                    </Tag>
                  ) : (
                    <CategoryLabel
                      name={row.categoryName}
                      color={row.categoryColor}
                    />
                  )}
                </Td>
                <Td>
                  {row.reconciliationId ? (
                    <Tag>{t.spending.spendingView.reconciled}</Tag>
                  ) : row.cleared ? (
                    <Tag tone="outline">{t.spending.spendingView.cleared}</Tag>
                  ) : (
                    <span className="text-ink-3">
                      {t.spending.spendingView.uncleared}
                    </span>
                  )}
                </Td>
                <Td
                  className={cn(
                    "figures text-right font-semibold whitespace-nowrap",
                    incoming && "text-gain",
                  )}
                >
                  <span className="sensitive">
                    {formatMoney(row.amount, row.currency, {
                      signed: true,
                    })}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
