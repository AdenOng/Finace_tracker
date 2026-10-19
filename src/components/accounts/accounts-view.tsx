"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountDrawer } from "~/components/accounts/account-drawer";
import { InstitutionMark } from "~/components/accounts/institution-mark";
import { Amounts } from "~/components/finance/amounts";
import { Button } from "~/components/ui/button";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import {
  type AccountGroup,
  accountGroupOf,
  accountTypeLabels,
} from "~/lib/accounts";
import { formatDate } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Filter = "open" | "archived";
type Row = RouterOutputs["accounts"]["list"][number];

const GROUPS: {
  group: AccountGroup;
  title: string;
  description: string;
  empty: string;
  add: string;
  institution: string;
  value: string;
}[] = [
  {
    group: "investments",
    title: "Investments",
    description:
      "Brokerage, retirement and crypto accounts, valued from their holdings.",
    empty:
      "Add a brokerage, robo-adviser or crypto account and list what it holds.",
    add: "Add investment account",
    institution: "Broker",
    value: "Value",
  },
  {
    group: "banking",
    title: "Bank & cards",
    description:
      "Savings, current and credit card accounts. Their transactions feed Spending.",
    empty:
      "Add a bank account or credit card, record its balance, then add transactions.",
    add: "Add bank or card",
    institution: "Bank",
    value: "Balance",
  },
  {
    group: "cpf_srs",
    title: "CPF & SRS",
    description:
      "Retirement money you can't spend yet. Shown apart on the overview.",
    empty:
      "Add your CPF balances, or an SRS account with your bank or platform.",
    add: "Add CPF or SRS",
    institution: "Held with",
    value: "Value",
  },
];

export function AccountsView({
  initialAdd,
}: {
  initialAdd?: AccountGroup | null;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [rows] = api.accounts.list.useSuspenseQuery();
  const [settings] = api.settings.get.useSuspenseQuery();
  const offered = (group: AccountGroup) =>
    group !== "cpf_srs" || settings.cpfSrsEnabled;
  const [filter, setFilter] = useState<Filter>("open");
  const [adding, setAdding] = useState<AccountGroup | "choose" | null>(
    initialAdd && offered(initialAdd) ? initialAdd : null,
  );
  const [flash, setFlash] = useState<string | null>(null);
  const restore = api.accounts.restore.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.accounts.list.invalidate(),
        utils.portfolio.invalidate(),
      ]);
      router.refresh();
    },
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
        <Button className="ml-auto" onClick={() => setAdding("choose")}>
          <Plus className="size-4" />
          Add account
        </Button>
      </div>

      {flash ? (
        <Notice tone="success" className="mb-6">
          {flash}
        </Notice>
      ) : null}

      <div className="space-y-4">
        {GROUPS.map((g) => {
          const items = visible.filter(
            (r) => accountGroupOf(r.type) === g.group,
          );
          if (
            (filter === "archived" || !offered(g.group)) &&
            items.length === 0
          )
            return null;
          return (
            <Section
              key={g.group}
              title={g.title}
              description={g.description}
              actions={
                filter === "open" ? (
                  <>
                    {g.group === "investments" ? (
                      <Link
                        href="/portfolio"
                        className="inline-flex min-h-10 items-center px-2 text-sm font-semibold underline underline-offset-4"
                      >
                        Consolidated view
                      </Link>
                    ) : null}
                    {offered(g.group) ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setAdding(g.group)}
                      >
                        <Plus className="size-4" />
                        {g.add}
                      </Button>
                    ) : null}
                  </>
                ) : undefined
              }
            >
              {items.length === 0 ? (
                <p className="text-ink-2 border-line-2 rounded-ctl border border-dashed px-5 py-6 text-sm">
                  {g.empty}
                </p>
              ) : (
                <AccountTable
                  rows={items}
                  institution={g.institution}
                  value={g.value}
                  archived={filter === "archived"}
                  restoring={
                    restore.isPending ? restore.variables?.id : undefined
                  }
                  onRestore={(id) => restore.mutate({ id })}
                />
              )}
            </Section>
          );
        })}
        {filter === "archived" && archived.length === 0 ? (
          <p className="text-ink-3 text-sm">
            Accounts you remove that still have history end up here.
          </p>
        ) : null}
      </div>

      <AccountDrawer
        key={adding ?? "closed"}
        account={adding ? "new" : null}
        group={adding === "choose" ? null : adding}
        onClose={() => setAdding(null)}
        onSaved={async (message, _outcome, createdId) => {
          setAdding(null);
          await Promise.all([
            utils.accounts.list.invalidate(),
            utils.portfolio.invalidate(),
          ]);
          if (createdId) {
            router.push(`/accounts/${createdId}?record=1`);
            return;
          }
          setFlash(message);
        }}
      />
    </>
  );
}

function AccountTable({
  rows,
  institution,
  value,
  archived,
  restoring,
  onRestore,
}: {
  rows: Row[];
  institution: string;
  value: string;
  archived: boolean;
  restoring: string | undefined;
  onRestore: (id: string) => void;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Account</Th>
          <Th>{institution}</Th>
          <Th className="text-right">{value}</Th>
          <Th className="text-right">As of</Th>
          {archived ? (
            <Th className="text-right">
              <span className="sr-only">Actions</span>
            </Th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td>
              <span className="flex items-center gap-3">
                <InstitutionMark
                  institutionKey={r.institutionKey}
                  name={r.institutionName ?? r.name}
                  className="size-9"
                />
                <span>
                  <Link
                    href={`/accounts/${r.id}`}
                    className="font-semibold hover:underline hover:underline-offset-4"
                  >
                    {r.name}
                  </Link>
                  {r.last4 ? (
                    <span className="figures text-ink-3 ml-1.5 text-[13px]">
                      ··{r.last4}
                    </span>
                  ) : null}
                  <span className="text-ink-3 block text-[12px]">
                    {accountTypeLabels[r.type]}
                    {r.unpriced > 0 ? (
                      <Tag tone="warn" className="ml-2">
                        {r.unpriced} unpriced
                      </Tag>
                    ) : null}
                  </span>
                </span>
              </span>
            </Td>
            <Td className="text-ink-2">{r.institutionName ?? "—"}</Td>
            <Td className="text-right font-mono text-[13px]">
              <Amounts totals={r.totals} empty="Not recorded" />
            </Td>
            <Td className="text-ink-2 text-right">
              {r.asOf ? formatDate(r.asOf) : "—"}
            </Td>
            {archived ? (
              <Td className="text-right">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={restoring === r.id}
                  onClick={() => onRestore(r.id)}
                >
                  Restore
                </Button>
              </Td>
            ) : null}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
