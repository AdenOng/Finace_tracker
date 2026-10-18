"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Amounts } from "~/components/finance/amounts";
import { Select } from "~/components/ui/field";
import {
  EmptyState,
  Notice,
  PageHeader,
  Section,
  Tag,
} from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { FilterTabs } from "~/components/ui/tabs";
import { WorkspaceManagement } from "~/components/workspaces/workspace-management";
import { WorkspaceSpending } from "~/components/workspaces/workspace-spending";
import { accountTypeLabels, assetClassLabels } from "~/lib/accounts";
import { formatDate, formatMoney } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

export function WorkspaceDetail({
  initialWorkspace,
  initialMonth,
}: {
  initialWorkspace: RouterOutputs["workspaces"]["get"];
  initialMonth: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"dashboard" | "manage">("dashboard");
  const workspaceId = initialWorkspace.id;
  const liveOptions = { staleTime: 0, refetchInterval: 15_000, retry: false };
  const detail = api.workspaces.get.useQuery(
    { workspaceId },
    { initialData: initialWorkspace, ...liveOptions },
  );
  const list = api.workspaces.list.useQuery(undefined, liveOptions);
  const accounts = api.accounts.list.useQuery({ workspaceId }, liveOptions);
  const worth = api.portfolio.netWorth.useQuery({ workspaceId }, liveOptions);
  if (detail.error)
    return (
      <Notice tone="error">
        {detail.error.message}{" "}
        <Link href="/workspaces" className="underline">
          Back to workspaces
        </Link>
      </Notice>
    );
  const w = detail.data;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/workspaces"
          className="text-sm font-semibold underline underline-offset-4"
        >
          All workspaces
        </Link>
        <Select
          aria-label="Switch workspace"
          className="ml-auto w-auto max-w-full"
          value={w.id}
          onChange={(e) =>
            router.push(
              e.target.value === "personal"
                ? "/"
                : `/workspaces/${e.target.value}`,
            )
          }
        >
          <option value="personal">Personal</option>
          {(list.data ?? [{ ...w }]).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>
      <PageHeader
        title={w.name}
        description={
          <>
            {w.kind === "fund"
              ? "Shared portfolio visibility. Values show whole shared accounts; contributions and individual investor stakes are not tracked yet."
              : "Balances and activity from accounts explicitly shared with this workspace."}{" "}
            <Tag>{w.role}</Tag>
          </>
        }
      />
      <div className="mb-8">
        <FilterTabs
          label="Workspace sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: "dashboard", label: "Dashboard" },
            { value: "manage", label: "Sharing & members" },
          ]}
        />
      </div>
      {accounts.error ? (
        <Notice tone="error">{accounts.error.message}</Notice>
      ) : !accounts.data ? (
        <p>Loading shared accounts…</p>
      ) : tab === "manage" ? (
        <WorkspaceManagement workspace={w} accounts={accounts.data} />
      ) : (
        <div className="space-y-12">
          {worth.error ? (
            <Notice tone="error">{worth.error.message}</Notice>
          ) : !worth.data ? (
            <p>Loading portfolio…</p>
          ) : (
            <>
              <Section
                title="Shared account value"
                description={`Latest recorded balances, shown in ${worth.data.currency}.`}
              >
                <p className="figures font-display text-5xl font-semibold">
                  {formatMoney(worth.data.total ?? "0", worth.data.currency)}
                </p>
                {worth.data.asOf ? (
                  <p className="text-ink-2 mt-3 text-sm">
                    Latest snapshot: {formatDate(worth.data.asOf)}. Accounts may
                    have different snapshot dates.
                  </p>
                ) : null}
                {worth.data.unconverted.length > 0 ? (
                  <Notice tone="warn" className="mt-4">
                    Excluded because an exchange rate is missing:{" "}
                    <Amounts totals={worth.data.unconverted} />
                  </Notice>
                ) : null}
                {worth.data.unpriced > 0 ? (
                  <Notice tone="warn" className="mt-4">
                    {worth.data.unpriced} holdings without a price are excluded.
                  </Notice>
                ) : null}
              </Section>
              {worth.data.allocation.length > 0 ? (
                <Section title="Asset allocation">
                  <Table>
                    <tbody>
                      {worth.data.allocation.map((a) => (
                        <Tr key={a.assetClass}>
                          <Td>{assetClassLabels[a.assetClass]}</Td>
                          <Td className="text-right">
                            {formatMoney(a.total ?? "0", worth.data.currency)}
                            {a.unconverted.length > 0 ? (
                              <Amounts
                                totals={a.unconverted}
                                className="text-warn block"
                              />
                            ) : null}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Section>
              ) : null}
            </>
          )}
          <Section
            title="Shared accounts"
            description="Read-only here. Account owners edit their records in Personal view."
          >
            {!accounts.data.length ? (
              <EmptyState title="No shared accounts">
                Use Sharing &amp; members to share an account with this
                audience.
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Account</Th>
                    <Th>Owner</Th>
                    <Th className="text-right">Value</Th>
                    <Th>As of</Th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.data.map((a) => (
                    <Tr key={a.id}>
                      <Td>
                        <Link
                          className="font-semibold underline underline-offset-4"
                          href={`/workspaces/${w.id}/accounts/${a.id}`}
                        >
                          {a.name}
                        </Link>
                        <span className="text-ink-3 block text-[13px]">
                          {accountTypeLabels[a.type]}
                          {a.archivedAt ? " · archived" : ""}
                        </span>
                      </Td>
                      <Td>{a.ownerName}</Td>
                      <Td className="text-right">
                        <Amounts totals={a.totals} empty="Not recorded" />
                        {a.unpriced > 0 ? (
                          <span className="text-warn block text-[13px]">
                            {a.unpriced} unpriced
                          </span>
                        ) : null}
                      </Td>
                      <Td>{a.asOf ? formatDate(a.asOf) : "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>
          <WorkspaceSpending
            key={w.id}
            workspaceId={w.id}
            initialMonth={initialMonth}
            accounts={accounts.data}
          />
        </div>
      )}
    </>
  );
}
