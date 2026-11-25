"use client";

import { Download, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo } from "react";
import { AmountsToggle } from "~/components/finance/privacy";
import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import { Input } from "~/components/ui/field";
import { categoryLabel, useT } from "~/i18n/client";
import { orderCategories } from "~/lib/categories";
import { cn } from "~/lib/cn";
import { type RouterOutputs } from "~/trpc/react";

const UNCATEGORISED_VALUE = "__uncategorised__";

export function SpendingFilters({
  accounts,
  categories,
  accountId,
  categoryId,
  uncategorised,
  search,
  query,
  rowCount,
  hasData,
  hasNextPage,
  exportDisabled,
  showFilters,
  activeFilters,
  clearFilters,
  onExport,
  onToggleFilters,
  onSearchChange,
  onAccountChange,
  onCategoryChange,
}: {
  accounts: RouterOutputs["accounts"]["list"];
  categories: RouterOutputs["catalog"]["categories"];
  accountId: string | null;
  categoryId: string | null;
  uncategorised: boolean;
  search: string;
  query: string;
  rowCount: number;
  hasData: boolean;
  hasNextPage: boolean;
  exportDisabled: boolean;
  showFilters: boolean;
  activeFilters: number;
  clearFilters: () => void;
  onExport: () => Promise<void>;
  onToggleFilters: () => void;
  onSearchChange: (value: string) => void;
  onAccountChange: (value: string | null) => void;
  onCategoryChange: (value: string | null, uncategorised: boolean) => void;
}) {
  const t = useT();
  const accountOptions = useMemo(
    () => [
      { value: "", label: t.spending.spendingView.allAccounts },
      ...accounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [accounts, t],
  );
  const categoryOptions = useMemo(
    () => [
      { value: "", label: t.spending.spendingView.allCategories },
      {
        value: UNCATEGORISED_VALUE,
        label: t.spending.spendingView.uncategorised,
      },
      ...orderCategories(categories).map((c) => ({
        value: c.id,
        label: c.parentId
          ? `— ${categoryLabel(t, c.name)}`
          : categoryLabel(t, c.name),
        keywords: c.name,
      })),
    ],
    [categories, t],
  );
  const categoryFilterValue = uncategorised
    ? UNCATEGORISED_VALUE
    : (categoryId ?? "");

  return (
    <div className="border-line border-b px-4 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">
            {t.spending.spendingView.transactions}
          </h2>
          {hasData ? (
            <span className="bg-wash text-ink-3 figures rounded-full px-2 py-0.5 text-[11px]">
              {rowCount}
              {hasNextPage ? "+" : null}
            </span>
          ) : null}
          {rowCount ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 rounded-full px-2 sm:px-3"
              aria-label={t.spending.spendingView.exportTheseTransactionsAsCSV}
              disabled={exportDisabled}
              onClick={onExport}
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
          onClick={onToggleFilters}
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
              placeholder={t.spending.spendingView.descriptionMerchantOrNote}
              className="h-10 rounded-lg pl-8 text-[12px]"
              maxLength={100}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </span>
        </label>
        <div className="min-w-0">
          <span className="text-ink-3 mb-1 block text-[11px]">
            {t.spending.spendingView.account}
          </span>
          <Combobox
            aria-label={t.spending.spendingView.filterByAccount}
            className="h-10 rounded-lg text-[12px]"
            value={accountId ?? ""}
            options={accountOptions}
            onChange={(value) => onAccountChange(value || null)}
          />
        </div>
        <div className="min-w-0">
          <span className="text-ink-3 mb-1 block text-[11px]">
            {t.spending.spendingView.category}
          </span>
          <Combobox
            aria-label={t.spending.spendingView.filterByCategory}
            className="h-10 rounded-lg text-[12px]"
            value={categoryFilterValue}
            options={categoryOptions}
            onChange={(value) =>
              onCategoryChange(
                value === UNCATEGORISED_VALUE ? null : value || null,
                value === UNCATEGORISED_VALUE,
              )
            }
          />
        </div>
      </div>
      {activeFilters > 0 ? (
        <div className="mt-2 flex min-w-0 items-center gap-2 sm:hidden">
          <p className="text-ink-3 min-w-0 flex-1 truncate text-[11px]">
            {[
              query && `“${query}”`,
              accounts.find((a) => a.id === accountId)?.name,
              uncategorised
                ? t.spending.spendingView.uncategorised
                : categoryLabel(
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
  );
}
