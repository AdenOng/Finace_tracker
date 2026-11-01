"use client";

import { useT } from "~/i18n/client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountDrawer } from "~/components/accounts/account-drawer";
import { InstitutionMark } from "~/components/accounts/institution-mark";
import { Amounts } from "~/components/finance/amounts";
import { BalanceDate } from "~/components/finance/balance-date";
import { Button } from "~/components/ui/button";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { type AccountGroup, accountGroupOf } from "~/lib/accounts";
import { api, type RouterOutputs } from "~/trpc/react";

type Filter = "open" | "archived";
type Row = RouterOutputs["accounts"]["list"][number];

export function AccountsView({
  initialAdd,
}: {
  initialAdd?: AccountGroup | null;
}) {
  const t = useT();

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
      title: t.accounts.view.investments,
      description:
        t.accounts.view
          .brokerageRetirementAndCryptoAccountsValuedFromTheirHoldings,
      empty: t.accounts.view.addABrokerageRoboAdviserOrCryptoAccountAndList,
      add: t.accounts.view.addInvestmentAccount,
      institution: t.accounts.view.broker,
      value: t.accounts.view.value,
    },
    {
      group: "banking",
      title: t.accounts.view.bankCards,
      description:
        t.accounts.view
          .savingsCurrentAndCreditCardAccountsTheirTransactionsFeedSpending,
      empty: t.accounts.view.addABankAccountOrCreditCardRecordItsBalance,
      add: t.accounts.view.addBankOrCard,
      institution: t.accounts.view.bank,
      value: t.accounts.view.balance,
    },
    {
      group: "cpf_srs",
      title: t.accounts.view.cPFSRS,
      description: t.accounts.view.retirementMoneyYouCanTSpendYetShownApartOn,
      empty: t.accounts.view.addYourCPFBalancesOrAnSRSAccountWithYour,
      add: t.accounts.view.addCPFOrSRS,
      institution: t.accounts.view.heldWith,
      value: t.accounts.view.value,
    },
  ];

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
          label={t.accounts.view.filterAccounts}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: t.accounts.view.open, count: open.length },
            {
              value: "archived",
              label: t.accounts.view.archived,
              count: archived.length,
            },
          ]}
        />
        <Button className="ml-auto" onClick={() => setAdding("choose")}>
          <Plus className="size-4" />
          {t.accounts.view.addAccount}
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
              amounts={`accounts-${g.group}`}
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
                        {t.accounts.view.consolidatedView}
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
            {t.accounts.view.accountsYouRemoveThatStillHaveHistoryEndUpHere}
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
  const t = useT();

  return (
    <Table>
      <thead>
        <tr>
          <Th>{t.accounts.view.account}</Th>
          <Th>{institution}</Th>
          <Th className="text-right">{value}</Th>
          <Th className="text-right">{t.accounts.view.asOf}</Th>
          {archived ? (
            <Th className="text-right">
              <span className="sr-only">{t.accounts.view.actions}</span>
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
                    {t.common.accountTypes[r.type]}
                    {r.unpriced > 0 ? (
                      <Tag tone="warn" className="ml-2">
                        {t.accounts.view.unpriced(r.unpriced)}
                      </Tag>
                    ) : null}
                  </span>
                </span>
              </span>
            </Td>
            <Td className="text-ink-2">{r.institutionName ?? "—"}</Td>
            <Td className="text-right font-mono text-[13px]">
              <Amounts totals={r.totals} empty={t.accounts.view.notRecorded} />
            </Td>
            <Td className="text-ink-2 text-right">
              <BalanceDate asOf={r.asOf} />
            </Td>
            {archived ? (
              <Td className="text-right">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={restoring === r.id}
                  onClick={() => onRestore(r.id)}
                >
                  {t.accounts.view.restore}
                </Button>
              </Td>
            ) : null}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
