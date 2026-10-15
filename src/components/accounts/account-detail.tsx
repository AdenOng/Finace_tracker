"use client";

import { ArrowLeft, Pencil, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountDrawer } from "~/components/accounts/account-drawer";
import { AccountReconciliation } from "~/components/accounts/account-reconciliation";
import { SnapshotDrawer } from "~/components/accounts/snapshot-drawer";
import { Amounts } from "~/components/finance/amounts";
import { Button } from "~/components/ui/button";
import {
  EmptyState,
  Notice,
  PageHeader,
  Section,
  Tag,
} from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import {
  accountTypeLabels,
  assetClassLabels,
  holdsSecurities,
} from "~/lib/accounts";
import { formatDate, formatMoney, formatQuantity } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

export function AccountDetail({
  id,
  initialAccount,
  workspaceId,
}: {
  workspaceId?: string;
  id: string;
  initialAccount: RouterOutputs["accounts"]["get"];
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [account, accountQuery] = api.accounts.get.useSuspenseQuery(
    { id, ...(workspaceId ? { workspaceId } : {}) },
    {
      initialData: initialAccount,
      ...(workspaceId
        ? { staleTime: 0, refetchInterval: 15_000, retry: false }
        : {}),
    },
  );
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const invalidate = () =>
    Promise.all([
      utils.accounts.get.invalidate({ id }),
      utils.accounts.list.invalidate(),
    ]);
  const restore = api.accounts.restore.useMutation({ onSuccess: invalidate });

  const holdings = account.holdings;
  const investments = holdsSecurities(account.type);
  const readOnly = !!workspaceId;
  if (accountQuery.error)
    return <Notice tone="error">{accountQuery.error.message}</Notice>;

  return (
    <>
      <Link
        href={workspaceId ? `/workspaces/${workspaceId}` : "/accounts"}
        className="text-ink-2 hover:text-ink mb-4 inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" />
        Accounts
      </Link>
      <PageHeader
        title={account.name}
        description={[
          accountTypeLabels[account.type],
          account.institutionName,
          account.last4 ? `··${account.last4}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          readOnly ? (
            <Tag tone="outline">Read-only</Tag>
          ) : account.archivedAt ? (
            <Button
              variant="secondary"
              onClick={() => restore.mutate({ id })}
              loading={restore.isPending}
            >
              Restore
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button onClick={() => setUpdating(true)}>
                <RefreshCw className="size-4" />
                {investments ? "Update holdings" : "Update balance"}
              </Button>
            </>
          )
        }
      />

      {readOnly ? (
        <Notice className="mb-8">
          Shared by {account.ownerName}. Financial edits are available to the
          owner in Personal view.
        </Notice>
      ) : null}
      {account.archivedAt ? (
        <Notice tone="warn" className="mb-8">
          This account is archived. It is left out of your net worth and cannot
          take new entries until restored.
        </Notice>
      ) : null}
      {flash ? (
        <Notice tone="success" className="mb-8">
          {flash}
        </Notice>
      ) : null}

      <div className="space-y-14">
        <Section
          title={investments ? "Value" : "Balance"}
          description={
            holdings
              ? `As of ${formatDate(holdings.asOf)}${holdings.source === "manual" ? (readOnly ? ", entered by the owner" : ", entered by you") : ""}.`
              : undefined
          }
        >
          {holdings ? (
            <div className="space-y-2">
              <Amounts
                totals={holdings.totals}
                empty="Nothing held"
                className="font-wide text-4xl font-extrabold"
              />
              {holdings.unpriced > 0 ? (
                <p className="text-warn text-sm">
                  {holdings.unpriced} holding
                  {holdings.unpriced === 1 ? " has" : "s have"} no price and{" "}
                  {holdings.unpriced === 1 ? "is" : "are"} not counted.
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Nothing recorded yet"
              action={
                readOnly || account.archivedAt ? undefined : (
                  <Button onClick={() => setUpdating(true)}>
                    {investments ? "Record holdings" : "Record balance"}
                  </Button>
                )
              }
            >
              {investments
                ? "Enter what this account holds and its cash to include it in your net worth."
                : "Enter the current balance to include this account in your net worth."}
            </EmptyState>
          )}
        </Section>

        {investments && holdings ? (
          <Section title="Holdings">
            {holdings.positions.length === 0 ? (
              <p className="text-ink-2 text-sm">Only cash is held.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Holding</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Quantity</Th>
                    <Th className="text-right">Price</Th>
                    <Th className="text-right">Average cost</Th>
                    <Th className="text-right">Value</Th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.positions.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <span className="font-semibold">{p.symbol}</span>
                        {p.exchange ? (
                          <span className="text-ink-3 ml-1.5 text-[13px]">
                            {p.exchange}
                          </span>
                        ) : null}
                        {p.name ? (
                          <span className="text-ink-2 block text-[13px]">
                            {p.name}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-ink-2">
                        {assetClassLabels[p.assetClass]}
                      </Td>
                      <Td className="figures text-right">
                        {formatQuantity(p.quantity)}
                      </Td>
                      <Td className="figures text-right">
                        {p.statementPrice
                          ? formatMoney(p.statementPrice, p.currency)
                          : "—"}
                      </Td>
                      <Td className="figures text-ink-2 text-right">
                        {p.averageCost
                          ? formatMoney(p.averageCost, p.currency)
                          : "—"}
                      </Td>
                      <Td className="figures text-right font-semibold">
                        {p.value ? (
                          formatMoney(p.value.amount, p.value.currency)
                        ) : (
                          <Tag tone="warn">No price</Tag>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>
        ) : null}

        {investments && holdings && holdings.cash.length > 0 ? (
          <Section title="Cash">
            <Amounts totals={holdings.cash} className="text-lg" />
          </Section>
        ) : null}

        {!investments ? (
          <Section
            title="Transactions"
            description="Spending and income recorded against this account."
          >
            <Link
              href={
                workspaceId
                  ? `/workspaces/${workspaceId}`
                  : `/spending?account=${account.id}`
              }
              className="font-semibold underline underline-offset-4"
            >
              View transactions
            </Link>
          </Section>
        ) : null}
        {!investments && !readOnly ? (
          <AccountReconciliation
            accountId={account.id}
            currency={account.currency}
          />
        ) : null}
      </div>

      {!readOnly ? (
        <AccountDrawer
          key={editing ? "edit" : "closed"}
          account={editing ? account : null}
          onClose={() => setEditing(false)}
          onSaved={async (message, outcome) => {
            setEditing(false);
            if (outcome === "deleted") {
              await utils.accounts.list.invalidate();
              router.replace("/accounts");
              return;
            }
            setFlash(message);
            await invalidate();
          }}
        />
      ) : null}
      {!readOnly && updating ? (
        <SnapshotDrawer
          account={account}
          open
          onClose={() => setUpdating(false)}
          onSaved={async (message) => {
            setUpdating(false);
            setFlash(message);
            await invalidate();
          }}
        />
      ) : null}
    </>
  );
}
