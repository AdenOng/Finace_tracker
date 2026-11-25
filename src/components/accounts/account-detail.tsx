"use client";

import { useT } from "~/i18n/client";

import { ArrowLeft, FileUp, Pencil, RefreshCw } from "lucide-react";
import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountDrawer } from "~/components/accounts/account-drawer";
import { CardBillTracking } from "~/components/planning/card-bills";
import { EntryHistory } from "~/components/accounts/entry-history";
import { AccountReconciliation } from "~/components/accounts/account-reconciliation";
import { AccountTransactions } from "~/components/accounts/account-transactions";
import { InstitutionMark } from "~/components/accounts/institution-mark";
import { SnapshotDrawer } from "~/components/accounts/snapshot-drawer";
import { Amounts } from "~/components/finance/amounts";
import { BalanceDate } from "~/components/finance/balance-date";
import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import {
  EmptyState,
  Notice,
  PageHeader,
  Section,
  Tag,
} from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { useFlash } from "~/components/ui/use-flash";
import { accountGroupOf, holdsSecurities } from "~/lib/accounts";
import { formatMoney, formatQuantity } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

export function AccountDetail({
  id,
  initialAccount,
  workspaceId,
  startRecording = false,
}: {
  workspaceId?: string;
  id: string;
  initialAccount: RouterOutputs["accounts"]["get"];
  /** Open the holdings or balance form straight away, as after adding the account. */
  startRecording?: boolean;
}) {
  const t = useT();

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
  const [updating, setUpdating] = useState(startRecording);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const flash = useFlash();
  const invalidate = () =>
    Promise.all([
      utils.accounts.get.invalidate({ id }),
      utils.accounts.list.invalidate(),
      utils.portfolio.invalidate(),
      utils.imports.invalidate(),
    ]);
  const restore = api.accounts.restore.useMutation({ onSuccess: invalidate });

  const holdings = account.holdings;
  const investments = holdsSecurities(account.type);
  const banking = accountGroupOf(account.type) === "banking";
  const cpfSplit =
    account.type === "cpf" && holdings?.cash.some((c) => c.bucket)
      ? holdings.cash
      : null;
  const readOnly = !!workspaceId;
  // Weight of each holding, when every value is in one currency and can be added up.
  const valued = holdings?.positions.filter((p) => p.value) ?? [];
  const oneCurrency =
    valued.length > 0 &&
    valued.every((p) => p.value!.currency === valued[0]!.value!.currency);
  const positionsTotal = oneCurrency
    ? valued.reduce((sum, p) => sum.plus(p.value!.amount), new Decimal(0))
    : null;
  if (accountQuery.error)
    return <Notice tone="error">{accountQuery.error.message}</Notice>;

  return (
    <>
      <Link
        href={workspaceId ? `/workspaces/${workspaceId}` : "/accounts"}
        className="text-ink-2 hover:text-ink mb-4 inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" />
        {t.accounts.detail.accounts}
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <InstitutionMark
          institutionKey={account.institutionKey}
          name={account.institutionName ?? account.name}
          className="size-12"
        />
        <Tag tone="outline">
          {t.common.accountGroups[accountGroupOf(account.type)]}
        </Tag>
      </div>
      <PageHeader
        title={account.name}
        description={[
          t.common.accountTypes[account.type],
          account.institutionName,
          account.last4 ? `··${account.last4}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          readOnly ? (
            <Tag tone="outline">{t.accounts.detail.readOnly}</Tag>
          ) : account.archivedAt ? (
            <Button
              variant="secondary"
              onClick={() => restore.mutate({ id })}
              loading={restore.isPending}
            >
              {t.accounts.detail.restore}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                {t.common.actions.edit}
              </Button>
              <Link
                href={`/imports?account=${account.id}`}
                className="rounded-ctl border-line-2 bg-surface-2 hover:bg-wash inline-flex h-10 items-center gap-2 border px-4 text-sm font-semibold transition-colors"
              >
                <FileUp className="size-4" />
                {t.accounts.detail.importStatement}
              </Link>
              <Button
                onClick={() =>
                  holdings
                    ? setEditingEntry(holdings.snapshotId)
                    : setUpdating(true)
                }
              >
                <RefreshCw className="size-4" />
                {investments
                  ? t.accounts.detail.updateHoldings
                  : t.accounts.detail.updateBalance}
              </Button>
            </>
          )
        }
      />

      {readOnly ? (
        <Notice className="mb-8">
          {t.accounts.detail.sharedBy(account.ownerName ?? "")}
        </Notice>
      ) : null}
      {account.archivedAt ? (
        <Notice tone="warn" className="mb-8">
          {t.accounts.detail.thisAccountIsArchivedItIsLeftOutOfYour}
        </Notice>
      ) : null}
      <FlashNotice
        flash={flash.flash}
        onDismiss={flash.clear}
        className="mb-8"
      />

      <div className="space-y-4">
        {!readOnly && account.type === "credit_card" ? (
          <CardBillTracking accountId={account.id} />
        ) : null}
        <Section
          amounts="account-value"
          amountsFor={account.id}
          title={
            investments ? t.accounts.detail.value : t.accounts.detail.balance
          }
          description={
            holdings ? (
              <>
                <BalanceDate asOf={holdings.asOf} />
                {holdings.source === "manual"
                  ? readOnly
                    ? t.accounts.detail.enteredByTheOwner
                    : t.accounts.detail.enteredByYou
                  : ""}
                {t.accounts.detail.period}
              </>
            ) : undefined
          }
        >
          {holdings ? (
            <div className="space-y-2">
              <Amounts
                totals={holdings.totals}
                empty={t.accounts.detail.nothingHeld}
                className="font-poster text-[44px] leading-none font-extrabold"
              />
              {holdings.unpriced > 0 ? (
                <p className="text-warn text-sm">
                  {t.accounts.detail.unpriced(holdings.unpriced)}
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title={t.accounts.detail.nothingRecordedYet}
              action={
                readOnly || account.archivedAt ? undefined : (
                  <Button onClick={() => setUpdating(true)}>
                    {investments
                      ? t.accounts.detail.recordHoldings
                      : t.accounts.detail.recordBalance}
                  </Button>
                )
              }
            >
              {investments
                ? t.accounts.detail.enterWhatThisAccountHoldsAndItsCashToInclude
                : t.accounts.detail
                    .enterTheCurrentBalanceToIncludeThisAccountInYour}
            </EmptyState>
          )}
        </Section>

        {cpfSplit ? (
          <Section
            amounts="account-split"
            amountsFor={account.id}
            title={t.accounts.detail.byAccount}
          >
            <ul className="max-w-md">
              {cpfSplit.map((c) => (
                <li
                  key={`${c.bucket}-${c.currency}`}
                  className="border-line flex items-baseline justify-between border-b py-2.5 text-sm"
                >
                  <span>
                    {c.bucket
                      ? t.common.cpfBuckets[c.bucket]
                      : t.accounts.detail.notSplit}
                  </span>
                  <span className="figures sensitive font-mono">
                    {formatMoney(c.amount, c.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {investments && holdings ? (
          <Section
            amounts="account-holdings"
            amountsFor={account.id}
            title={t.accounts.detail.holdings}
          >
            {holdings.positions.length === 0 ? (
              <p className="text-ink-2 text-sm">
                {t.accounts.detail.onlyCashIsHeld}
              </p>
            ) : (
              <>
                <ul className="divide-line -mx-1 divide-y md:hidden">
                  {holdings.positions.map((p) => {
                    const share =
                      positionsTotal && p.value && !positionsTotal.isZero()
                        ? new Decimal(p.value.amount)
                            .div(positionsTotal)
                            .times(100)
                            .toNumber()
                        : null;
                    return (
                      <li key={p.id} className="space-y-1.5 px-1 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{p.symbol}</span>
                            {p.exchange ? (
                              <span className="text-ink-3 ml-1.5 text-[12px]">
                                {p.exchange}
                              </span>
                            ) : null}
                          </span>
                          <span className="figures shrink-0 font-mono text-[14px] font-semibold">
                            {p.value ? (
                              <span className="sensitive">
                                {formatMoney(p.value.amount, p.value.currency)}
                              </span>
                            ) : (
                              <Tag tone="warn">
                                {t.accounts.detail.noPrice}
                              </Tag>
                            )}
                          </span>
                        </div>
                        {p.name ? (
                          <p className="text-ink-2 truncate text-[12px]">
                            {p.name}
                          </p>
                        ) : null}
                        <div className="text-ink-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px]">
                          <span>
                            {t.common.assetClasses[p.assetClass]} ·{" "}
                            <span className="figures sensitive">
                              {formatQuantity(p.quantity)}
                            </span>
                            {p.statementPrice
                              ? ` × ${formatMoney(p.statementPrice, p.currency)}`
                              : ""}
                          </span>
                          {share !== null ? (
                            <span className="figures font-mono">
                              {share.toFixed(1)}%
                            </span>
                          ) : null}
                        </div>
                        {p.averageCost ? (
                          <p className="text-ink-3 text-[11px]">
                            {t.accounts.detail.averageCost}:{" "}
                            <span className="figures font-mono">
                              {formatMoney(p.averageCost, p.currency)}
                            </span>
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <Table className="hidden md:block">
                <thead>
                  <tr>
                    <Th>{t.accounts.detail.holding}</Th>
                    <Th>{t.common.fields.type}</Th>
                    <Th className="text-right">{t.accounts.detail.quantity}</Th>
                    <Th className="text-right">{t.accounts.detail.price}</Th>
                    <Th className="text-right">
                      {t.accounts.detail.averageCost}
                    </Th>
                    <Th className="text-right">{t.accounts.detail.value}</Th>
                    {positionsTotal ? (
                      <Th className="w-32 text-right">
                        {t.accounts.detail.weight}
                      </Th>
                    ) : null}
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
                        {t.common.assetClasses[p.assetClass]}
                      </Td>
                      <Td className="figures text-right">
                        <span className="sensitive">
                          {formatQuantity(p.quantity)}
                        </span>
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
                          <span className="sensitive">
                            {formatMoney(p.value.amount, p.value.currency)}
                          </span>
                        ) : (
                          <Tag tone="warn">{t.accounts.detail.noPrice}</Tag>
                        )}
                      </Td>
                      {positionsTotal ? (
                        <Td className="text-right">
                          {p.value && !positionsTotal.isZero() ? (
                            <Weight
                              share={new Decimal(p.value.amount)
                                .div(positionsTotal)
                                .times(100)
                                .toNumber()}
                            />
                          ) : null}
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
              </>
            )}
          </Section>
        ) : null}

        {investments && holdings && holdings.cash.length > 0 ? (
          <Section
            amounts="account-cash"
            amountsFor={account.id}
            title={t.accounts.detail.cash}
          >
            <Amounts totals={holdings.cash} className="text-lg" />
          </Section>
        ) : null}
        {!readOnly ? (
          <EntryHistory
            account={account}
            editId={editingEntry}
            onEdit={setEditingEntry}
            onAdd={() => setUpdating(true)}
            onChanged={async (message) => {
              flash.success(message);
              await invalidate();
              router.refresh();
            }}
          />
        ) : null}

        {banking ? (
          <AccountTransactions
            accountId={account.id}
            readOnly={readOnly || !!account.archivedAt}
            allHref={
              workspaceId
                ? `/workspaces/${workspaceId}`
                : `/spending?account=${account.id}`
            }
          />
        ) : null}
        {banking && !readOnly ? (
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
            flash.success(message);
            await invalidate();
            router.refresh();
          }}
        />
      ) : null}
      {!readOnly && updating ? (
        <SnapshotDrawer
          account={account}
          createOnly
          open
          onClose={() => setUpdating(false)}
          onSaved={async (message) => {
            setUpdating(false);
            flash.success(message);
            await invalidate();
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function Weight({ share }: { share: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="bg-wash h-1.5 w-14 overflow-hidden rounded-full">
        <span
          className="bg-ink/80 block h-full rounded-full"
          style={{ width: `${share}%` }}
        />
      </span>
      <span className="figures w-11 font-mono text-[12px]">
        {share.toFixed(1)}%
      </span>
    </span>
  );
}
