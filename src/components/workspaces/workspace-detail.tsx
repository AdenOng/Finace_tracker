"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT, useLocale } from "~/i18n/client";
import { Amounts } from "~/components/finance/amounts";
import { BalanceDate } from "~/components/finance/balance-date";
import { TransferFreshnessNotices } from "~/components/overview/transfer-freshness-notices";
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

import { formatDate, formatMoney } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

export function WorkspaceDetail({
  initialWorkspace,
  initialMonth,
}: {
  initialWorkspace: RouterOutputs["workspaces"]["get"];
  initialMonth: string;
}) {
  const t = useT();
  const locale = useLocale();
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
          {t.workspaces.workspaceDetail.backToWorkspaces}
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
          {t.workspaces.workspaceDetail.allWorkspaces}
        </Link>
        <Select
          aria-label={t.workspaces.workspaceDetail.switchWorkspace}
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
          <option value="personal">
            {t.workspaces.workspaceDetail.personal}
          </option>
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
              ? t.workspaces.workspaceDetail
                  .sharedPortfolioVisibilityValuesShowWholeShared
              : t.workspaces.workspaceDetail
                  .balancesAndActivityFromAccountsExplicitlyShared}{" "}
            <Tag>{t.workspaces.roles[w.role]}</Tag>
          </>
        }
      />
      <div className="mb-8">
        <FilterTabs
          label={t.workspaces.workspaceDetail.workspaceSections}
          value={tab}
          onChange={setTab}
          options={[
            {
              value: "dashboard",
              label: t.workspaces.workspaceDetail.dashboard,
            },
            {
              value: "manage",
              label: t.workspaces.workspaceDetail.sharingMembers,
            },
          ]}
        />
      </div>
      {accounts.error ? (
        <Notice tone="error">{accounts.error.message}</Notice>
      ) : !accounts.data ? (
        <p>{t.workspaces.workspaceDetail.loadingSharedAccounts}</p>
      ) : tab === "manage" ? (
        <WorkspaceManagement workspace={w} accounts={accounts.data} />
      ) : (
        <div className="space-y-12">
          {worth.error ? (
            <Notice tone="error">{worth.error.message}</Notice>
          ) : !worth.data ? (
            <p>{t.workspaces.workspaceDetail.loadingPortfolio}</p>
          ) : (
            <>
              <Section
                amounts="workspace-value"
                amountsFor={workspaceId}
                title={t.workspaces.workspaceDetail.sharedAccountValue}
                description={t.workspaces.workspaceDetail.balances(
                  worth.data.currency,
                )}
              >
                <p className="figures font-display text-5xl font-semibold">
                  <span className="sensitive">
                    {formatMoney(worth.data.total ?? "0", worth.data.currency)}
                  </span>
                </p>
                {worth.data.asOf ? (
                  <p className="text-ink-2 mt-3 text-sm">
                    {t.workspaces.workspaceDetail.snapshot(
                      formatDate(worth.data.asOf, locale),
                    )}
                  </p>
                ) : null}
                <TransferFreshnessNotices
                  warnings={worth.data.transferWarnings}
                  workspaceId={workspaceId}
                />
                {worth.data.unconverted.length > 0 ? (
                  <Notice tone="warn" className="mt-4">
                    {
                      t.workspaces.workspaceDetail
                        .excludedBecauseAnExchangeRateIsMissing
                    }{" "}
                    <Amounts totals={worth.data.unconverted} />
                  </Notice>
                ) : null}
                {worth.data.unpriced > 0 ? (
                  <Notice tone="warn" className="mt-4">
                    {t.workspaces.workspaceDetail.unpricedExcluded(
                      worth.data.unpriced,
                    )}
                  </Notice>
                ) : null}
              </Section>
              {worth.data.allocation.length > 0 ? (
                <Section
                  amounts="workspace-allocation"
                  amountsFor={workspaceId}
                  title={t.workspaces.workspaceDetail.assetAllocation}
                >
                  <Table>
                    <tbody>
                      {worth.data.allocation.map((a) => (
                        <Tr key={a.assetClass}>
                          <Td>{t.common.assetClasses[a.assetClass]}</Td>
                          <Td className="text-right">
                            <span className="sensitive">
                              {formatMoney(a.total ?? "0", worth.data.currency)}
                            </span>
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
            amounts="workspace-accounts"
            amountsFor={workspaceId}
            title={t.workspaces.workspaceDetail.sharedAccounts}
            description={
              t.workspaces.workspaceDetail
                .readonlyHereAccountOwnersEditTheirRecords
            }
          >
            {!accounts.data.length ? (
              <EmptyState title={t.workspaces.workspaceDetail.noSharedAccounts}>
                {t.workspaces.workspaceDetail.useSharingAndMembersToShareAn}
              </EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t.workspaces.workspaceDetail.account}</Th>
                    <Th>{t.workspaces.workspaceDetail.owner}</Th>
                    <Th className="text-right">
                      {t.workspaces.workspaceDetail.value}
                    </Th>
                    <Th>{t.workspaces.workspaceDetail.asOf}</Th>
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
                          {t.common.accountTypes[a.type]}
                          {a.archivedAt
                            ? t.workspaces.workspaceDetail.archived
                            : ""}
                        </span>
                      </Td>
                      <Td>{a.ownerName}</Td>
                      <Td className="text-right">
                        <Amounts
                          totals={a.totals}
                          empty={t.workspaces.workspaceDetail.notRecorded}
                        />
                        {a.unpriced > 0 ? (
                          <span className="text-warn block text-[13px]">
                            {t.workspaces.workspaceDetail.unpriced(a.unpriced)}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <BalanceDate asOf={a.asOf} />
                      </Td>
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
