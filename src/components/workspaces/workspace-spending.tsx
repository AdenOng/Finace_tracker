"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Select } from "~/components/ui/field";
import { Notice, Section } from "~/components/ui/panel";
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
  const [month, setMonth] = useState(initialMonth);
  const [accountId, setAccountId] = useState<string | null>(null);
  const summary = api.spending.summary.useQuery(
    { workspaceId, month },
    { staleTime: 0, refetchInterval: 15_000, retry: false },
  );
  const list = api.spending.list.useQuery(
    { workspaceId, month, accountId, categoryId: null },
    { staleTime: 0, refetchInterval: 15_000, retry: false },
  );
  const owners = new Map(accounts.map((a) => [a.id, a.ownerName]));
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ←
        </Button>
        <p className="font-semibold">{formatMonth(month)}</p>
        <Button
          variant="ghost"
          aria-label="Next month"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          →
        </Button>
        <Select
          aria-label="Filter shared transactions by account"
          className="ml-auto w-auto"
          value={accountId ?? ""}
          onChange={(e) => setAccountId(e.target.value || null)}
        >
          <option value="">All shared accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.ownerName}
            </option>
          ))}
        </Select>
      </div>
      <Section
        title="Spending summary"
        description="Marked transfers are excluded. Amounts are grouped by their original currency."
      >
        {summary.error ? (
          <Notice tone="error">{summary.error.message}</Notice>
        ) : !summary.data ? (
          <p>Loading summary…</p>
        ) : !summary.data.length ? (
          <p className="text-ink-2 text-sm">No spending recorded this month.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Currency</Th>
                <Th className="text-right">Spent</Th>
                <Th className="text-right">Received</Th>
              </tr>
            </thead>
            <tbody>
              {summary.data.map((r) => (
                <Tr key={`${r.categoryId}-${r.currency}`}>
                  <Td>{r.categoryName ?? "Uncategorised"}</Td>
                  <Td>{r.currency}</Td>
                  <Td className="figures text-right">
                    {formatMoney(r.spent, r.currency)}
                  </Td>
                  <Td className="figures text-right">
                    {formatMoney(r.received, r.currency)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      <Section
        title="Shared transactions"
        description="Read-only. Account owners manage entries in Personal view."
      >
        {list.error ? (
          <Notice tone="error">{list.error.message}</Notice>
        ) : !list.data ? (
          <p>Loading transactions…</p>
        ) : !list.data.length ? (
          <p className="text-ink-2 text-sm">No transactions match.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Account / owner</Th>
                <Th>Category</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((t) => (
                <Tr key={t.id}>
                  <Td>{formatDate(t.postedDate)}</Td>
                  <Td>{t.merchant ?? t.description}</Td>
                  <Td>
                    {t.accountName}
                    <span className="text-ink-3 block text-[13px]">
                      {owners.get(t.accountId)}
                    </span>
                  </Td>
                  <Td>
                    {t.isTransfer
                      ? "Transfer"
                      : (t.categoryName ?? "Uncategorised")}
                  </Td>
                  <Td className="figures text-right">
                    {formatMoney(t.amount, t.currency, { signed: true })}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
