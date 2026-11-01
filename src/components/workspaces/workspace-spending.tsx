"use client";

import { useState } from "react";
import { categoryLabel, useT, useLocale } from "~/i18n/client";
import { Button } from "~/components/ui/button";
import { Select } from "~/components/ui/field";
import { Notice, Section } from "~/components/ui/panel";
import {
  nextSpendingCursor,
  SPENDING_PAGE_SIZE,
} from "~/components/spending/pagination";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { shiftMonth } from "~/lib/dates";
import { formatDate, formatMoney, formatMonth } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

export function WorkspaceSpending({
  workspaceId,
  initialMonth,
  accounts,
}: {
  workspaceId: string;
  initialMonth: string;
  accounts: RouterOutputs["accounts"]["list"];
}) {
  const t = useT();
  const locale = useLocale();
  const [month, setMonth] = useState(initialMonth);
  const [accountId, setAccountId] = useState<string | null>(null);
  const summary = api.spending.summary.useQuery(
    { workspaceId, month },
    { staleTime: 0, refetchInterval: 15_000, retry: false },
  );
  const list = api.spending.list.useInfiniteQuery(
    {
      workspaceId,
      month,
      accountId,
      categoryId: null,
      limit: SPENDING_PAGE_SIZE,
    },
    {
      staleTime: 0,
      // Polling refetches every loaded page, so keep it live only on the first one.
      refetchInterval: (query) =>
        (query.state.data?.pages.length ?? 0) > 1 ? false : 15_000,
      retry: false,
      getNextPageParam: nextSpendingCursor,
    },
  );
  const rows = list.data?.pages.flat() ?? [];
  const owners = new Map(accounts.map((a) => [a.id, a.ownerName]));
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          aria-label={t.workspaces.workspaceSpending.previousMonth}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ←
        </Button>
        <p className="font-semibold">{formatMonth(month, locale)}</p>
        <Button
          variant="ghost"
          aria-label={t.workspaces.workspaceSpending.nextMonth}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          →
        </Button>
        <Select
          aria-label={
            t.workspaces.workspaceSpending.filterSharedTransactionsByAccount
          }
          className="ml-auto w-auto"
          value={accountId ?? ""}
          onChange={(e) => setAccountId(e.target.value || null)}
        >
          <option value="">
            {t.workspaces.workspaceSpending.allSharedAccounts}
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.ownerName}
            </option>
          ))}
        </Select>
      </div>
      <Section
        amounts="workspace-spending"
        amountsFor={workspaceId}
        title={t.workspaces.workspaceSpending.spendingSummary}
        description={
          t.workspaces.workspaceSpending
            .markedTransfersAreExcludedAmountsAreGrouped
        }
      >
        {summary.error ? (
          <Notice tone="error">{summary.error.message}</Notice>
        ) : !summary.data ? (
          <p>{t.workspaces.workspaceSpending.loadingSummary}</p>
        ) : !summary.data.length ? (
          <p className="text-ink-2 text-sm">
            {t.workspaces.workspaceSpending.noSpendingRecordedThisMonth}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.workspaces.workspaceSpending.category}</Th>
                <Th>{t.common.fields.currency}</Th>
                <Th className="text-right">
                  {t.workspaces.workspaceSpending.spent}
                </Th>
                <Th className="text-right">
                  {t.workspaces.workspaceSpending.received}
                </Th>
              </tr>
            </thead>
            <tbody>
              {summary.data.map((r) => (
                <Tr key={`${r.categoryId}-${r.currency}`}>
                  <Td>
                    {r.categoryName
                      ? categoryLabel(t, r.categoryName)
                      : t.workspaces.workspaceSpending.uncategorised}
                  </Td>
                  <Td>{r.currency}</Td>
                  <Td className="figures text-right">
                    <span className="sensitive">
                      {formatMoney(r.spent, r.currency)}
                    </span>
                  </Td>
                  <Td className="figures text-right">
                    <span className="sensitive">
                      {formatMoney(r.received, r.currency)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      <Section
        amounts="workspace-transactions"
        amountsFor={workspaceId}
        title={t.workspaces.workspaceSpending.sharedTransactions}
        description={
          t.workspaces.workspaceSpending
            .readonlyAccountOwnersManageEntriesInPersonal
        }
      >
        {list.error ? (
          <Notice tone="error">{list.error.message}</Notice>
        ) : !list.data ? (
          <p>{t.workspaces.workspaceSpending.loadingTransactions}</p>
        ) : !rows.length ? (
          <p className="text-ink-2 text-sm">
            {t.workspaces.workspaceSpending.noTransactionsMatch}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.common.fields.date}</Th>
                <Th>{t.workspaces.workspaceSpending.description}</Th>
                <Th>{t.workspaces.workspaceSpending.accountOwner}</Th>
                <Th>{t.workspaces.workspaceSpending.category}</Th>
                <Th className="text-right">{t.common.fields.amount}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>{formatDate(row.postedDate, locale)}</Td>
                  <Td>{row.merchant ?? row.description}</Td>
                  <Td>
                    {row.accountName}
                    <span className="text-ink-3 block text-[13px]">
                      {owners.get(row.accountId)}
                    </span>
                  </Td>
                  <Td>
                    {row.isTransfer
                      ? t.workspaces.workspaceSpending.transfer
                      : row.categoryName
                        ? categoryLabel(t, row.categoryName)
                        : t.workspaces.workspaceSpending.uncategorised}
                  </Td>
                  <Td className="figures text-right">
                    <span className="sensitive">
                      {formatMoney(row.amount, row.currency, { signed: true })}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {list.hasNextPage ? (
          <Button
            variant="ghost"
            disabled={list.isFetching}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage
              ? t.common.status.loading
              : t.common.actions.showMore}
          </Button>
        ) : null}
      </Section>
    </div>
  );
}
