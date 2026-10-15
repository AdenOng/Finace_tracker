"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccountDrawer } from "~/components/accounts/account-drawer";
import { Amounts } from "~/components/finance/amounts";
import { Button } from "~/components/ui/button";
import { EmptyState, Notice, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { accountTypeLabels } from "~/lib/accounts";
import { formatDate } from "~/lib/format";
import { api } from "~/trpc/react";

type Filter = "open" | "archived";

export function AccountsView() {
  const utils = api.useUtils();
  const [rows] = api.accounts.list.useSuspenseQuery();
  const [filter, setFilter] = useState<Filter>("open");
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const restore = api.accounts.restore.useMutation({
    onSuccess: () => utils.accounts.list.invalidate(),
  });

  const open = rows.filter((r) => !r.archivedAt);
  const archived = rows.filter((r) => r.archivedAt);
  const visible = filter === "open" ? open : archived;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Filter accounts"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Open", count: open.length },
            { value: "archived", label: "Archived", count: archived.length },
          ]}
        />
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add account
        </Button>
      </div>

      {flash ? (
        <Notice tone="success" className="mb-6">
          {flash}
        </Notice>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "No accounts yet" : "Nothing archived"}
          action={
            filter === "open" ? (
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                Add your first account
              </Button>
            ) : undefined
          }
        >
          {filter === "open"
            ? "Add the bank, card and brokerage accounts you want to track, then record their balances and holdings."
            : "Accounts you remove that still have history end up here."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Type</Th>
              <Th>Bank or broker</Th>
              <Th className="text-right">Balance</Th>
              <Th className="text-right">As of</Th>
              {filter === "archived" ? (
                <Th className="text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link
                    href={`/accounts/${r.id}`}
                    className="font-semibold hover:underline hover:underline-offset-4"
                  >
                    {r.name}
                  </Link>
                  {r.last4 ? (
                    <span className="figures text-ink-3 ml-2 text-[13px]">
                      ··{r.last4}
                    </span>
                  ) : null}
                  {r.unpriced > 0 ? (
                    <Tag tone="warn" className="ml-2">
                      {r.unpriced} unpriced
                    </Tag>
                  ) : null}
                </Td>
                <Td className="text-ink-2">{accountTypeLabels[r.type]}</Td>
                <Td className="text-ink-2">{r.institutionName ?? "—"}</Td>
                <Td className="text-right">
                  <Amounts totals={r.totals} empty="Not recorded" />
                </Td>
                <Td className="text-ink-2 text-right">
                  {r.asOf ? formatDate(r.asOf) : "—"}
                </Td>
                {filter === "archived" ? (
                  <Td className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={
                        restore.isPending && restore.variables.id === r.id
                      }
                      onClick={() => restore.mutate({ id: r.id })}
                    >
                      Restore
                    </Button>
                  </Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <AccountDrawer
        key={adding ? "new" : "closed"}
        account={adding ? "new" : null}
        onClose={() => setAdding(false)}
        onSaved={async (message) => {
          setAdding(false);
          setFlash(message);
          await utils.accounts.list.invalidate();
        }}
      />
    </>
  );
}
