"use client";

import Decimal from "decimal.js";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  BulkEditDrawer,
  type BulkAction,
} from "~/components/spending/bulk-edit-drawer";
import { MerchantRulesDrawer } from "~/components/spending/merchant-rules-drawer";
import { TransactionDrawer } from "~/components/spending/transaction-drawer";
import { Button } from "~/components/ui/button";
import { Select } from "~/components/ui/field";
import { EmptyState, Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { orderCategories } from "~/lib/categories";
import { cn } from "~/lib/cn";
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
  const utils = api.useUtils();
  const [month, setMonth] = useState(initialMonth);
  useEffect(() => {
    setMonth(currentMonth());
  }, []);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [accounts] = api.accounts.list.useSuspenseQuery();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const list = api.spending.list.useQuery(
    { month, accountId, categoryId },
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
      const t = byCurrency.get(row.currency) ?? {
        spent: new Decimal(0),
        received: new Decimal(0),
      };
      byCurrency.set(row.currency, {
        spent: t.spent.plus(row.spent),
        received: t.received.plus(row.received),
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

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous month"
            onClick={() => {
              setSelected(new Set());
              setMonth((m) => shiftMonth(m, -1));
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="font-wide min-w-44 text-center text-lg font-bold">
            {formatMonth(month)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next month"
            onClick={() => {
              setSelected(new Set());
              setMonth((m) => shiftMonth(m, 1));
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          variant="secondary"
          className="ml-auto"
          onClick={() => setShowRules(true)}
        >
          Merchant rules
        </Button>
        <Button
          onClick={() => setEditing("new")}
          disabled={openAccounts.length === 0}
        >
          <Plus className="size-4" />
          Add transaction
        </Button>
      </div>

      {openAccounts.length === 0 ? (
        <EmptyState
          title="Add an account first"
          action={
            <Link
              href="/accounts"
              className="font-semibold underline underline-offset-4"
            >
              Go to accounts
            </Link>
          }
        >
          Transactions belong to a bank, card or cash account.
        </EmptyState>
      ) : null}

      {flash ? (
        <Notice tone="success" className="mb-8">
          {flash}
        </Notice>
      ) : null}

      <div className="space-y-14">
        <Section
          title="Summary"
          description="Money out and in by category. Transfers between your own accounts are left out."
        >
          {summary.error ? (
            <Notice tone="error">{summary.error.message}</Notice>
          ) : !summary.data ? (
            <div className="bg-wash h-24" />
          ) : totals.length === 0 ? (
            <p className="text-ink-2 text-sm">
              Nothing recorded for {formatMonth(month)}.
            </p>
          ) : (
            <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
              <dl className="space-y-4">
                {totals.map(([currency, t]) => (
                  <div key={currency} className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-ink-2 text-[13px] font-semibold">
                        Spent
                      </dt>
                      <dd className="figures font-wide text-2xl font-extrabold">
                        {formatMoney(t.spent.toFixed(), currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-2 text-[13px] font-semibold">
                        Received
                      </dt>
                      <dd className="figures font-wide text-gain text-2xl font-extrabold">
                        {formatMoney(t.received.toFixed(), currency)}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              {spending.length > 0 ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Category</Th>
                      <Th className="text-right">Transactions</Th>
                      <Th className="text-right">Spent</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {spending.map((r) => (
                      <Tr key={`${r.categoryId ?? "none"}-${r.currency}`}>
                        <Td>
                          <CategoryLabel
                            name={r.categoryName}
                            color={r.categoryColor}
                          />
                        </Td>
                        <Td className="figures text-ink-2 text-right">
                          {r.count}
                        </Td>
                        <Td className="figures text-right font-semibold">
                          {formatMoney(r.spent, r.currency)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              ) : null}
            </div>
          )}
        </Section>

        <Section
          title="Transactions"
          actions={
            <>
              <Select
                aria-label="Filter by account"
                className="w-auto min-w-40"
                value={accountId ?? ""}
                onChange={(e) => {
                  setSelected(new Set());
                  setAccountId(e.target.value || null);
                }}
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by category"
                className="w-auto min-w-40"
                value={categoryId ?? ""}
                onChange={(e) => {
                  setSelected(new Set());
                  setCategoryId(e.target.value || null);
                }}
              >
                <option value="">All categories</option>
                {orderCategories(categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? `— ${c.name}` : c.name}
                  </option>
                ))}
              </Select>
            </>
          }
        >
          {selectedRows.length > 0 ? (
            <div
              className="bg-wash mb-4 flex flex-wrap items-center gap-2 p-3"
              role="region"
              aria-label="Selected transaction actions"
            >
              <span className="mr-auto text-sm font-semibold">
                {selectedRows.length} selected
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={selectionBusy}
                onClick={() => setBulkAction("edit")}
              >
                Bulk edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={selectionBusy}
                onClick={() => setBulkAction("rules")}
              >
                Apply rules
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={selectionBusy}
                onClick={() => setBulkAction("delete")}
              >
                Delete selected
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
            </div>
          ) : null}
          {(list.data?.length ?? 0) > 500 ? (
            <p className="text-ink-2 mb-3 text-sm">
              Select up to 500 entries at a time. Select all chooses the first
              500 visible entries.
            </p>
          ) : null}
          {list.error ? (
            <Notice tone="error">{list.error.message}</Notice>
          ) : !list.data ? (
            <div className="bg-wash h-24" />
          ) : list.data.length === 0 ? (
            <p className="text-ink-2 text-sm">No transactions match.</p>
          ) : (
            <Table className={cn(list.isPlaceholderData && "opacity-60")}>
              <thead>
                <tr>
                  <Th>
                    <input
                      type="checkbox"
                      className="accent-forest size-4"
                      aria-label="Select all visible transactions"
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
                  <Th>Date</Th>
                  <Th>Description</Th>
                  <Th>Account</Th>
                  <Th>Category</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((t) => {
                  const incoming = new Decimal(t.amount).isPositive();
                  return (
                    <Tr
                      key={t.id}
                      className={
                        selected.has(t.id) ? "bg-mint-soft" : undefined
                      }
                    >
                      <Td>
                        <input
                          type="checkbox"
                          className="accent-forest size-4"
                          aria-label={`Select ${t.description} on ${t.postedDate}`}
                          disabled={
                            selectionBusy ||
                            (!selected.has(t.id) && selected.size >= 500)
                          }
                          checked={selected.has(t.id)}
                          onChange={() => toggleSelection(t.id)}
                        />
                      </Td>
                      <Td className="text-ink-2 whitespace-nowrap">
                        {formatDate(t.postedDate)}
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          className="text-left font-semibold hover:underline hover:underline-offset-4"
                        >
                          {t.merchant ?? t.description}
                        </button>
                        {t.merchant ? (
                          <span className="text-ink-3 block text-[13px]">
                            {t.description}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-ink-2">{t.accountName}</Td>
                      <Td>
                        {t.isTransfer ? (
                          <Tag tone="outline">Transfer</Tag>
                        ) : (
                          <CategoryLabel
                            name={t.categoryName}
                            color={t.categoryColor}
                          />
                        )}
                      </Td>
                      <Td>
                        {t.reconciliationId ? (
                          <Tag>Reconciled</Tag>
                        ) : t.cleared ? (
                          <Tag tone="outline">Cleared</Tag>
                        ) : (
                          <span className="text-ink-3">Uncleared</span>
                        )}
                      </Td>
                      <Td
                        className={cn(
                          "figures text-right font-semibold whitespace-nowrap",
                          incoming && "text-gain",
                        )}
                      >
                        {formatMoney(t.amount, t.currency, { signed: true })}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Section>
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
  if (!name) return <span className="text-ink-3">Uncategorised</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0"
        style={{ backgroundColor: color ?? "var(--color-ink-3)" }}
      />
      {name}
    </span>
  );
}
