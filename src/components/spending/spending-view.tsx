"use client";

import Decimal from "decimal.js";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { categoryLabel, useT, useLocale } from "~/i18n/client";
import { intlLocale } from "~/i18n/config";
import {
  BulkEditDrawer,
  type BulkAction,
} from "~/components/spending/bulk-edit-drawer";
import { AmountsScope, AmountsToggle } from "~/components/finance/privacy";
import { MerchantRulesDrawer } from "~/components/spending/merchant-rules-drawer";
import { MobileTransactionRow } from "~/components/spending/mobile-transaction-row";
import { TransactionDrawer } from "~/components/spending/transaction-drawer";
import { Button } from "~/components/ui/button";
import { Input, Select } from "~/components/ui/field";
import { EmptyState, Notice, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { orderCategories } from "~/lib/categories";
import { cn } from "~/lib/cn";
import { downloadFile, toCsv } from "~/lib/csv";
import { currentMonth, shiftMonth } from "~/lib/dates";
import { formatDate, formatMoney, formatMonth } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Transaction = RouterOutputs["spending"]["list"][number];

export function SpendingView({
  initialAccountId,
  initialMonth,
}: {
  initialAccountId: string | null;
  initialMonth: string;
}) {
  const t = useT();
  const locale = useLocale();
  const utils = api.useUtils();
  const [month, setMonth] = useState(initialMonth);
  useEffect(() => {
    setMonth(currentMonth());
  }, []);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();
      setQuery((previous) => {
        if (previous !== next) setSelected(new Set());
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [accounts] = api.accounts.list.useSuspenseQuery();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const list = api.spending.list.useQuery(
    { month, accountId, categoryId, search: query },
    { placeholderData: (previous) => previous },
  );
  const summary = api.spending.summary.useQuery(
    { month },
    { placeholderData: (previous) => previous },
  );

  const selectedRows = (list.data ?? []).filter((r) => selected.has(r.id));
  const selectionBusy = list.isFetching || list.isPlaceholderData;
  const selectable = (list.data ?? []).slice(0, 500);
  function toggleSelection(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 500) next.add(id);
      return next;
    });
  }
  const openAccounts = accounts.filter((a) => !a.archivedAt);
  const totals = useMemo(() => {
    const byCurrency = new Map<string, { spent: Decimal; received: Decimal }>();
    for (const row of summary.data ?? []) {
      const previous = byCurrency.get(row.currency) ?? {
        spent: new Decimal(0),
        received: new Decimal(0),
      };
      byCurrency.set(row.currency, {
        spent: previous.spent.plus(row.spent),
        received: previous.received.plus(row.received),
      });
    }
    return [...byCurrency];
  }, [summary.data]);

  const spending = (summary.data ?? []).filter(
    (r) => !new Decimal(r.spent).isZero(),
  );
  const invalidate = () =>
    Promise.all([
      utils.spending.list.invalidate(),
      utils.spending.summary.invalidate(),
      utils.reconciliation.invalidate(),
      utils.merchantRules.preview.invalidate(),
    ]);

  const activeFilters =
    Number(!!accountId) + Number(!!categoryId) + Number(!!query);
  const clearFilters = () => {
    setSelected(new Set());
    setAccountId(null);
    setCategoryId(null);
    setSearch("");
    setQuery("");
  };
  function exportCsv() {
    const rows = list.data ?? [];
    downloadFile(
      `finfolio-transactions-${query ? "search" : month}.csv`,
      toCsv([
        [
          t.common.fields.date,
          t.spending.spendingView.description,
          t.spending.spendingView.merchant,
          t.spending.spendingView.account,
          t.spending.spendingView.category,
          t.common.fields.amount,
          t.common.fields.currency,
          t.spending.spendingView.transfer,
          t.common.fields.status,
          t.common.fields.notes,
        ],
        ...rows.map((row) => [
          row.postedDate,
          row.description,
          row.merchant,
          row.accountName,
          row.categoryName
            ? categoryLabel(t, row.categoryName)
            : row.categoryName,
          row.amount,
          row.currency,
          row.isTransfer
            ? t.spending.spendingView.yes
            : t.spending.spendingView.no,
          row.reconciliationId
            ? t.spending.spendingView.reconciled
            : row.cleared
              ? t.spending.spendingView.cleared
              : t.spending.spendingView.uncleared,
          row.notes,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
  }
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(selectable.map((r) => r.id)) : new Set());
  const shortMonth = new Intl.DateTimeFormat(intlLocale[locale], {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

  return (
    <>
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-tight font-semibold sm:text-4xl">
            {t.spending.spendingView.spending}
          </h1>
          <p className="text-ink-3 mt-1 text-[13px] sm:text-sm">
            {t.spending.spendingView.yourMoneyMonthByMonth}
          </p>
        </div>
        <Button
          onClick={() => setEditing("new")}
          disabled={openAccounts.length === 0}
          aria-label={t.spending.spendingView.addTransaction}
          className="h-11 rounded-full px-4"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span className="sm:hidden">{t.common.actions.add}</span>
          <span className="hidden sm:inline">
            {t.spending.spendingView.addTransaction}
          </span>
        </Button>
      </header>
      <Link
        href="/spending/transfers"
        className="mb-4 inline-block text-sm font-semibold underline underline-offset-4"
      >
        {t.spending.spendingView.reviewTransfers}
      </Link>
      <div className="border-line mb-5 flex items-center justify-between gap-2 border-b pb-4">
        <div className="card flex min-w-0 items-center rounded-full p-0.5 shadow-none">
          <Button
            variant="ghost"
            size="sm"
            className="size-10 rounded-full px-0"
            aria-label={t.spending.spendingView.previousMonth}
            onClick={() => {
              setSelected(new Set());
              setMonth((m) => shiftMonth(m, -1));
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p
            className="figures min-w-24 px-1 text-center text-[13px] font-semibold"
            aria-label={formatMonth(month, locale)}
          >
            <span className="sm:hidden">{shortMonth}</span>
            <span className="hidden sm:inline">
              {formatMonth(month, locale)}
            </span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="size-10 rounded-full px-0"
            aria-label={t.spending.spendingView.nextMonth}
            onClick={() => {
              setSelected(new Set());
              setMonth((m) => shiftMonth(m, 1));
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 rounded-full px-2 sm:px-3"
          aria-label={t.spending.spendingView.merchantRules}
          onClick={() => setShowRules(true)}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          <span className="sm:hidden">{t.spending.spendingView.rules}</span>
          <span className="hidden sm:inline">
            {t.spending.spendingView.merchantRules}
          </span>
        </Button>
      </div>

      {openAccounts.length === 0 ? (
        <EmptyState
          title={t.spending.spendingView.addAnAccountFirst}
          action={
            <Link
              href="/accounts"
              className="font-semibold underline underline-offset-4"
            >
              {t.spending.spendingView.goToAccounts}
            </Link>
          }
        >
          {t.spending.spendingView.transactionsBelongToABankCardOr}
        </EmptyState>
      ) : null}

      {flash ? (
        <Notice tone="success" className="mb-8">
          {flash}
        </Notice>
      ) : null}

      <div className="space-y-5">
        <AmountsScope
          scope="spending-summary"
          className="card min-w-0 overflow-hidden"
          aria-label={t.spending.spendingView.monthlySummary}
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-2 sm:px-6 sm:pt-3">
            <h2 className="text-sm font-semibold">
              {t.spending.spendingView.monthlyOverview}
            </h2>
            <span className="text-ink-3 flex items-center gap-1 text-[11px]">
              {t.spending.spendingView.excludesTransfers}
              <AmountsToggle />
            </span>
          </div>
          {summary.error ? (
            <div className="p-4">
              <Notice tone="error">{summary.error.message}</Notice>
            </div>
          ) : !summary.data ? (
            <div className="m-4 grid grid-cols-2 gap-3">
              <div className="bg-wash h-20 animate-pulse rounded-lg" />
              <div className="bg-wash h-20 animate-pulse rounded-lg" />
            </div>
          ) : totals.length === 0 ? (
            <div className="px-4 py-6 sm:px-6">
              <p className="text-ink-2 text-sm">
                {t.spending.spendingView.freshStart(shortMonth)}
              </p>
              <p className="text-ink-3 mt-1 text-[13px]">
                {t.spending.spendingView.yourIncomeAndSpendingWillAppearHere}
              </p>
            </div>
          ) : (
            <>
              <dl className="divide-line divide-y px-4 sm:px-6">
                {totals.map(([currency, row]) => (
                  <div key={currency} className="grid grid-cols-2 gap-4 py-5">
                    <div className="min-w-0">
                      <dt className="text-ink-3 flex items-center gap-1.5 text-[12px]">
                        <ArrowUpRight className="size-3.5" />
                        {t.spending.spendingView.moneyOut}
                      </dt>
                      <dd className="font-poster figures mt-2 text-[clamp(20px,5.5vw,32px)] leading-none font-bold break-words">
                        <span className="sensitive">
                          {formatMoney(row.spent.toFixed(), currency)}
                        </span>
                      </dd>
                    </div>
                    <div className="border-line min-w-0 border-l pl-4">
                      <dt className="text-ink-3 flex items-center gap-1.5 text-[12px]">
                        <ArrowDownLeft className="size-3.5" />
                        {t.spending.spendingView.moneyIn}
                      </dt>
                      <dd className="font-poster figures text-gain mt-2 text-[clamp(20px,5.5vw,32px)] leading-none font-bold break-words">
                        <span className="sensitive">
                          {formatMoney(row.received.toFixed(), currency)}
                        </span>
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              {spending.length > 0 ? (
                <div className="border-line border-t px-4 py-4 sm:px-6">
                  <p className="text-ink-3 mb-2 text-[11px] font-medium tracking-wide uppercase">
                    {t.spending.spendingView.whereItWent}
                  </p>
                  <ul className="space-y-3">
                    {spending.map((r) => (
                      <li
                        key={`${r.categoryId ?? "none"}-${r.currency}`}
                        className="flex min-w-0 items-center justify-between gap-3 text-[13px]"
                      >
                        <span className="min-w-0 truncate">
                          <CategoryLabel
                            name={r.categoryName}
                            color={r.categoryColor}
                          />
                        </span>
                        <span className="figures sensitive shrink-0 font-mono text-[12px]">
                          {formatMoney(r.spent, r.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </AmountsScope>

        <AmountsScope
          scope="spending-transactions"
          className="card min-w-0 overflow-hidden"
          aria-label={t.spending.spendingView.transactions}
        >
          <div className="border-line border-b px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold">
                  {t.spending.spendingView.transactions}
                </h2>
                {list.data ? (
                  <span className="bg-wash text-ink-3 figures rounded-full px-2 py-0.5 text-[11px]">
                    {list.data.length}
                  </span>
                ) : null}
                {list.data?.length ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 rounded-full px-2 sm:px-3"
                    aria-label={
                      t.spending.spendingView.exportTheseTransactionsAsCSV
                    }
                    disabled={list.isPlaceholderData}
                    onClick={exportCsv}
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {t.spending.spendingView.exportCSV}
                    </span>
                  </Button>
                ) : null}
                <AmountsToggle className="h-10 rounded-full px-2" />
              </div>
              <Button
                variant={showFilters || activeFilters ? "secondary" : "ghost"}
                size="sm"
                className="h-10 rounded-full px-3 sm:hidden"
                onClick={() => setShowFilters((value) => !value)}
                aria-expanded={showFilters}
                aria-controls="spending-filters"
              >
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                {t.spending.spendingView.filters(activeFilters)}
              </Button>
              {activeFilters ? (
                <button
                  type="button"
                  className="text-ink-3 hidden text-xs underline underline-offset-4 sm:block"
                  onClick={clearFilters}
                >
                  {t.spending.spendingView.clearFilters}
                </button>
              ) : null}
            </div>
            <div
              id="spending-filters"
              className={cn(
                "mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]",
                !showFilters && "hidden sm:grid",
              )}
            >
              <label className="col-span-2 min-w-0 sm:col-span-1">
                <span className="text-ink-3 mb-1 block text-[11px]">
                  {t.spending.spendingView.searchEveryMonth}
                </span>
                <span className="relative block">
                  <Search
                    className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    aria-label={t.spending.spendingView.searchTransactions}
                    placeholder={
                      t.spending.spendingView.descriptionMerchantOrNote
                    }
                    className="h-10 rounded-lg pl-8 text-[12px]"
                    maxLength={100}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </span>
              </label>
              <label className="min-w-0">
                <span className="text-ink-3 mb-1 block text-[11px]">
                  {t.spending.spendingView.account}
                </span>
                <Select
                  aria-label={t.spending.spendingView.filterByAccount}
                  className="h-10 min-w-0 rounded-lg text-[12px]"
                  value={accountId ?? ""}
                  onChange={(e) => {
                    setSelected(new Set());
                    setAccountId(e.target.value || null);
                  }}
                >
                  <option value="">
                    {t.spending.spendingView.allAccounts}
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="min-w-0">
                <span className="text-ink-3 mb-1 block text-[11px]">
                  {t.spending.spendingView.category}
                </span>
                <Select
                  aria-label={t.spending.spendingView.filterByCategory}
                  className="h-10 min-w-0 rounded-lg text-[12px]"
                  value={categoryId ?? ""}
                  onChange={(e) => {
                    setSelected(new Set());
                    setCategoryId(e.target.value || null);
                  }}
                >
                  <option value="">
                    {t.spending.spendingView.allCategories}
                  </option>
                  {orderCategories(categories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentId
                        ? `— ${categoryLabel(t, c.name)}`
                        : categoryLabel(t, c.name)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {activeFilters > 0 ? (
              <div className="mt-2 flex min-w-0 items-center gap-2 sm:hidden">
                <p className="text-ink-3 min-w-0 flex-1 truncate text-[11px]">
                  {[
                    query && `“${query}”`,
                    accounts.find((a) => a.id === accountId)?.name,
                    categoryLabel(
                      t,
                      categories.find((c) => c.id === categoryId)?.name ?? "",
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <button
                  type="button"
                  aria-label={t.spending.spendingView.clearFilters}
                  onClick={clearFilters}
                  className="text-ink-3 hover:bg-wash grid size-8 shrink-0 place-items-center rounded-full"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="p-4 sm:p-6">
            {selectedRows.length > 0 ? (
              <div
                className="bg-wash mb-4 flex flex-wrap items-center gap-2 p-3"
                role="region"
                aria-label={t.spending.spendingView.selectedTransactionActions}
              >
                <span className="mr-auto text-sm font-semibold">
                  {t.spending.spendingView.selected(selectedRows.length)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectionBusy}
                  onClick={() => setBulkAction("edit")}
                >
                  {t.spending.spendingView.bulkEdit}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectionBusy}
                  onClick={() => setBulkAction("rules")}
                >
                  {t.spending.spendingView.applyRules}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={selectionBusy}
                  onClick={() => setBulkAction("delete")}
                >
                  {t.spending.spendingView.deleteSelected}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  {t.spending.spendingView.clearSelection}
                </Button>
              </div>
            ) : null}
            {query && list.data?.length ? (
              <p className="text-ink-3 mb-3 text-[13px]">
                {list.data.length >= 500
                  ? t.spending.spendingView.limitedMatches(query)
                  : t.spending.spendingView.matches(query)}
              </p>
            ) : null}
            {(list.data?.length ?? 0) > 500 ? (
              <p className="text-ink-2 mb-3 text-sm">
                {t.spending.spendingView.selectUpTo500EntriesAtA}
              </p>
            ) : null}
            {list.error ? (
              <Notice tone="error">{list.error.message}</Notice>
            ) : !list.data ? (
              <div className="bg-wash h-24" />
            ) : list.data.length === 0 ? (
              <div className="flex flex-col items-center py-7 text-center sm:py-10">
                <span className="bg-wash text-ink-3 mb-3 grid size-11 place-items-center rounded-full">
                  <ReceiptText className="size-5" strokeWidth={1.5} />
                </span>
                <p className="text-sm font-semibold">
                  {query
                    ? t.spending.spendingView.nothingMatches(query)
                    : activeFilters
                      ? t.spending.spendingView.noMatchingTransactions
                      : t.spending.spendingView.nothingHereYet}
                </p>
                <p className="text-ink-3 mt-1 max-w-64 text-[13px]">
                  {query
                    ? t.spending.spendingView.theSearchCoversEveryMonthTryA
                    : activeFilters
                      ? t.spending.spendingView.tryAnotherAccountOrCategory
                      : t.spending.spendingView
                          .addATransactionToStartYourMonthly}
                </p>
                {activeFilters ? (
                  <button
                    type="button"
                    className="mt-3 text-[13px] font-semibold underline underline-offset-4"
                    onClick={clearFilters}
                  >
                    {t.spending.spendingView.clearFilters}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "sm:hidden",
                    list.isPlaceholderData && "opacity-60",
                  )}
                >
                  <label className="text-ink-3 mb-1 flex min-h-10 items-center gap-2 text-[11px]">
                    <input
                      type="checkbox"
                      className="accent-brand size-4"
                      aria-label={
                        t.spending.spendingView.selectAllVisibleTransactions
                      }
                      disabled={selectionBusy}
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                    {t.spending.spendingView.selectAll}
                  </label>
                  <ul className="divide-line divide-y">
                    {list.data.map((row) => (
                      <MobileTransactionRow
                        key={row.id}
                        transaction={row}
                        selected={selected.has(row.id)}
                        disabled={
                          selectionBusy ||
                          (!selected.has(row.id) && selected.size >= 500)
                        }
                        onSelect={() => toggleSelection(row.id)}
                        onEdit={() => setEditing(row)}
                      />
                    ))}
                  </ul>
                </div>
                <Table
                  className={cn(
                    "hidden sm:block",
                    list.isPlaceholderData && "opacity-60",
                  )}
                >
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
                          checked={
                            selectable.length > 0 &&
                            selectable.every((r) => selected.has(r.id))
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? new Set(selectable.map((r) => r.id))
                                : new Set(),
                            )
                          }
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
                    {list.data.map((row) => {
                      const incoming = new Decimal(row.amount).isPositive();
                      return (
                        <Tr
                          key={row.id}
                          className={
                            selected.has(row.id) ? "bg-brand-soft" : undefined
                          }
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
                              onChange={() => toggleSelection(row.id)}
                            />
                          </Td>
                          <Td className="text-ink-2 whitespace-nowrap">
                            {formatDate(row.postedDate, locale)}
                          </Td>
                          <Td>
                            <button
                              type="button"
                              onClick={() => setEditing(row)}
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
                              <Tag tone="outline">
                                {t.spending.spendingView.cleared}
                              </Tag>
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
            )}
          </div>
        </AmountsScope>
      </div>

      {showRules ? (
        <MerchantRulesDrawer onClose={() => setShowRules(false)} />
      ) : null}
      {bulkAction && selectedRows.length > 0 ? (
        <BulkEditDrawer
          rows={selectedRows}
          action={bulkAction}
          onClose={() => setBulkAction(null)}
          onSaved={async (message) => {
            setBulkAction(null);
            setSelected(new Set());
            setFlash(message);
            await invalidate();
          }}
        />
      ) : null}
      <TransactionDrawer
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        transaction={editing}
        defaultAccountId={accountId}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          setFlash(message);
          await invalidate();
        }}
      />
    </>
  );
}

function CategoryLabel({
  name,
  color,
}: {
  name: string | null;
  color: string | null;
}) {
  const t = useT();
  if (!name)
    return (
      <span className="text-ink-3">
        {t.spending.spendingView.uncategorised}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0"
        style={{ backgroundColor: color ?? "var(--color-ink-3)" }}
      />
      {categoryLabel(t, name)}
    </span>
  );
}
