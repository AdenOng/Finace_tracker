"use client";

import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AmountsScope } from "~/components/finance/privacy";
import {
  BulkEditDrawer,
  type BulkAction,
} from "~/components/spending/bulk-edit-drawer";
import { MerchantRulesDrawer } from "~/components/spending/merchant-rules-drawer";
import { MonthlySummaryCard } from "~/components/spending/monthly-summary-card";
import {
  nextSpendingCursor,
  SPENDING_PAGE_SIZE,
} from "~/components/spending/pagination";
import { TransactionDrawer } from "~/components/spending/transaction-drawer";
import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { EmptyState, Notice, Tag } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { categoryLabel, useLocale, useT } from "~/i18n/client";
import { intlLocale } from "~/i18n/config";
import { cn } from "~/lib/cn";
import { downloadFile, toCsv } from "~/lib/csv";
import { currentMonth, shiftMonth } from "~/lib/dates";
import { formatMonth } from "~/lib/format";
import type { AppRouter } from "~/server/api/root";
import { api, type RouterOutputs } from "~/trpc/react";
import { SpendingFilters } from "./spending-filters";
import { TransactionTable } from "./transaction-table";

type Transaction = RouterOutputs["spending"]["list"][number];

export function SpendingView({
  initialAccountId,
  initialMonth,
  hasExplicitMonth = false,
  initialCategoryId = null,
  initialUncategorised = false,
  initialSearch = "",
}: {
  initialAccountId: string | null;
  initialMonth: string;
  hasExplicitMonth?: boolean;
  initialCategoryId?: string | null;
  initialUncategorised?: boolean;
  initialSearch?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const utils = api.useUtils();
  const [month, setMonth] = useState(initialMonth);
  useEffect(() => {
    if (!hasExplicitMonth) setMonth(currentMonth());
  }, [hasExplicitMonth]);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [categoryId, setCategoryId] = useState<string | null>(
    initialUncategorised ? null : initialCategoryId,
  );
  const [uncategorised, setUncategorised] = useState(initialUncategorised);
  const [search, setSearch] = useState(initialSearch);
  const [query, setQuery] = useState(initialSearch.trim());
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

  // Keep filters and month in the URL so Back navigation and reload preserve context.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("month", month);
    if (accountId) url.searchParams.set("account", accountId);
    else url.searchParams.delete("account");
    if (uncategorised) {
      url.searchParams.set("uncategorised", "1");
      url.searchParams.delete("category");
    } else {
      url.searchParams.delete("uncategorised");
      if (categoryId) url.searchParams.set("category", categoryId);
      else url.searchParams.delete("category");
    }
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (
      next !==
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    ) {
      window.history.replaceState(null, "", next);
    }
  }, [month, accountId, categoryId, uncategorised, query]);

  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showFilters, setShowFilters] = useState(
    Boolean(initialAccountId) ||
      Boolean(initialCategoryId) ||
      initialUncategorised ||
      Boolean(initialSearch),
  );
  const flash = useFlash();
  // A search spans every month, so the month only keys the list while browsing. Freezing it
  // while searching stops the month arrows from refetching identical results.
  const [searchMonth] = useState(initialMonth);
  const listMonth = query ? searchMonth : month;

  const [accounts] = api.accounts.list.useSuspenseQuery();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const list = api.spending.list.useInfiniteQuery(
    {
      month: listMonth,
      accountId,
      categoryId,
      ...(uncategorised ? { uncategorised: true } : {}),
      search: query,
      limit: SPENDING_PAGE_SIZE,
    },
    {
      placeholderData: (previous) => previous,
      getNextPageParam: nextSpendingCursor,
    },
  );
  // Fetch and render another batch only when requested, including on mobile.
  const rows = list.data?.pages.flat() ?? [];
  const [exporting, setExporting] = useState(false);
  const summary = api.spending.summary.useQuery(
    { month },
    { placeholderData: (previous) => previous },
  );

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectionBusy = list.isFetching || list.isPlaceholderData;
  const selectable = rows.slice(0, 500);
  function toggleSelection(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 500) next.add(id);
      return next;
    });
  }
  const openAccounts = accounts.filter((a) => !a.archivedAt);
  const invalidate = () =>
    Promise.all([
      utils.spending.list.invalidate(),
      utils.spending.summary.invalidate(),
      utils.reconciliation.invalidate(),
      utils.merchantRules.preview.invalidate(),
    ]);

  const activeFilters =
    Number(!!accountId) +
    Number(!!categoryId || uncategorised) +
    Number(!!query);
  const clearFilters = () => {
    setSelected(new Set());
    setAccountId(null);
    setCategoryId(null);
    setUncategorised(false);
    setSearch("");
    setQuery("");
  };

  async function exportCsv() {
    setExporting(true);
    try {
      const exported = await utils.spending.export.fetch({
        month: listMonth,
        accountId,
        categoryId,
        ...(uncategorised ? { uncategorised: true } : {}),
        search: query,
      });
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
          ...exported.map((row) => [
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
    } catch (error) {
      // A deliberate server error (a limit, a bad filter) explains itself. Transport failures
      // ("Failed to fetch", aborted streams) carry no server error data, and internal errors
      // say nothing useful, so both get the translated message.
      const code =
        error instanceof TRPCClientError
          ? (error as TRPCClientError<AppRouter>).data?.code
          : undefined;
      const deliberate =
        error instanceof Error &&
        !!error.message &&
        !!code &&
        code !== "INTERNAL_SERVER_ERROR";
      flash.error(
        deliberate ? error.message : t.spending.spendingView.exportFailed,
      );
    } finally {
      setExporting(false);
    }
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
      <div className="border-line mb-5 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div
              className={cn(
                "card flex min-w-0 items-center rounded-full p-0.5 shadow-none transition-opacity",
                query && "opacity-75",
              )}
            >
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
            {query ? (
              <Tag tone="soft">
                {t.spending.spendingView.allMonthsSearching}
              </Tag>
            ) : null}
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
        {query ? (
          <p className="text-ink-3 mt-2 text-[12px]">
            {t.spending.spendingView.monthControlsSummaryOnly}
          </p>
        ) : null}
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

      <FlashNotice
        flash={flash.flash}
        onDismiss={flash.clear}
        className="mb-8"
      />

      <div className="space-y-5">
        <MonthlySummaryCard
          shortMonth={shortMonth}
          data={summary.data}
          error={summary.error}
        />

        <AmountsScope
          scope="spending-transactions"
          className="card min-w-0 overflow-hidden"
          aria-label={t.spending.spendingView.transactions}
        >
          <SpendingFilters
            accounts={accounts}
            categories={categories}
            accountId={accountId}
            categoryId={categoryId}
            uncategorised={uncategorised}
            search={search}
            query={query}
            rowCount={rows.length}
            hasData={!!list.data}
            hasNextPage={list.hasNextPage}
            exportDisabled={list.isPlaceholderData || exporting}
            showFilters={showFilters}
            activeFilters={activeFilters}
            clearFilters={clearFilters}
            onExport={exportCsv}
            onToggleFilters={() => setShowFilters((value) => !value)}
            onSearchChange={setSearch}
            onAccountChange={(value) => {
              setSelected(new Set());
              setAccountId(value);
            }}
            onCategoryChange={(value, withoutCategory) => {
              setSelected(new Set());
              setCategoryId(value);
              setUncategorised(withoutCategory);
            }}
          />
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
            {query && rows.length ? (
              <p className="text-ink-3 mb-3 text-[13px]">
                {t.spending.spendingView.matches(query)}
              </p>
            ) : null}
            {(rows.length ?? 0) > 500 ? (
              <p className="text-ink-2 mb-3 text-sm">
                {t.spending.spendingView.selectUpTo500EntriesAtA}
              </p>
            ) : null}
            {list.error ? (
              <Notice tone="error">{list.error.message}</Notice>
            ) : !list.data ? (
              <div
                className="space-y-3 py-2"
                role="status"
                aria-label={t.common.status.loading}
              >
                <div className="bg-wash h-10 animate-pulse rounded-lg" />
                <div className="bg-wash h-10 animate-pulse rounded-lg" />
                <div className="bg-wash h-10 animate-pulse rounded-lg" />
              </div>
            ) : rows.length === 0 ? (
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
              <TransactionTable
                rows={rows}
                selected={selected}
                selectionBusy={selectionBusy}
                allSelected={allSelected}
                placeholder={list.isPlaceholderData}
                onToggleAll={toggleAll}
                onToggle={toggleSelection}
                onEdit={setEditing}
              />
            )}
            {list.hasNextPage ? (
              <Button
                variant="ghost"
                disabled={selectionBusy}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage
                  ? t.common.status.loading
                  : t.common.actions.showMore}
              </Button>
            ) : null}
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
            flash.success(message);
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
          flash.success(message);
          await invalidate();
        }}
      />
    </>
  );
}
