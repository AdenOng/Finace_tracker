"use client";

import type { Locale } from "~/i18n/config";
import type { Messages } from "~/i18n/messages";
import { useT, useLocale, categoryLabel } from "~/i18n/client";
import Decimal from "decimal.js";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { InstitutionMark } from "~/components/accounts/institution-mark";
import { ImportLineRemoval } from "~/components/imports/line-removal";
import { ImportStatus, isReading } from "~/components/imports/import-status";
import { ReadGlyph } from "~/components/landing/glyphs";
import { TransactionTypeSelect } from "~/components/spending/transaction-type-select";
import { transactionType } from "~/lib/transaction-classification";
import { Button } from "~/components/ui/button";
import { Input, Select } from "~/components/ui/field";
import { Notice, Section, Tag } from "~/components/ui/panel";
import { accountGroupOf } from "~/lib/accounts";
import { orderCategories } from "~/lib/categories";
import { cn } from "~/lib/cn";
import { checkImportBalance } from "~/lib/import-balance-check";
import { todayIso } from "~/lib/dates";
import { errorMessage } from "~/lib/errors";
import { formatDate, formatMoney, formatQuantity } from "~/lib/format";
import { moneyInput } from "~/server/api/inputs";
import { api, type RouterOutputs } from "~/trpc/react";

type Job = RouterOutputs["imports"]["get"];
type Row = Job["rows"][number];
type RowOf<K extends Row["kind"]> = Extract<Row, { kind: K }>;

const RowControls = createContext<{
  completed: boolean;
  canRemove: boolean;
  onRemove: (row: Row) => void;
  editingAmount: string | null;
  setEditingAmount: (id: string | null) => void;
  onAmount: (id: string, amount: string) => void;
  onConfirmAmount: (id: string) => void;
}>({
  completed: false,
  canRemove: false,
  onRemove: () => undefined,
  editingAmount: null,
  setEditingAmount: () => undefined,
  onAmount: () => undefined,
  onConfirmAmount: () => undefined,
});

const documentLabels = (t: Messages): Record<string, string> => ({
  bank_statement: t.imports.importReview.bankStatement,
  card_statement: t.imports.importReview.cardStatement,
  brokerage_statement: t.imports.importReview.brokerageStatement,
  trade_confirmation: t.imports.importReview.tradeConfirmation,
  screenshot: t.imports.importReview.screenshot,
  other: t.imports.importReview.document,
});

const activityLabels = (t: Messages): Record<string, string> => ({
  buy: t.imports.importReview.buy,
  sell: t.imports.importReview.sell,
  dividend: t.imports.importReview.dividend,
  interest: t.imports.importReview.interest,
  fee: t.imports.importReview.fee,
  tax: t.imports.importReview.tax,
  deposit: t.imports.importReview.deposit,
  withdrawal: t.imports.importReview.withdrawal,
  transfer_in: t.imports.importReview.transferIn,
  transfer_out: t.imports.importReview.transferOut,
  split: t.imports.importReview.split,
  fx: t.imports.importReview.fx,
  other: t.imports.importReview.other,
});

/** "12 Sept" — the statement period already gives the year. */
const shortDate = (iso: string, locale: Locale) =>
  formatDate(iso, locale).replace(locale === "zh" ? /^\d{4}年/ : / \d{4}$/, "");

const money = (
  amount: string | number | Decimal,
  currency: string,
  signed = false,
) => formatMoney(new Decimal(amount).toFixed(2), currency, { signed });

export function ImportReview({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const utils = api.useUtils();
  const [job] = api.imports.get.useSuspenseQuery(
    { id },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        return data && isReading(data.status, data.stale) ? 2500 : false;
      },
    },
  );
  // Balances, holdings and trade listings need an explicit date if extraction did not find one.
  // Transaction-only imports keep their own row dates; the unused snapshot date can be today.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayIso()), []);
  const [asOfChoice, setAsOf] = useState<string | null>(null);
  const needsDate = job.rows.some(
    (r) => r.decision === "accept" && r.kind !== "transaction",
  );
  const asOf = needsDate
    ? (asOfChoice ?? job.summary?.periodEnd ?? "")
    : (job.summary?.periodEnd ?? today);
  const [flash, setFlash] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [acknowledgedCheck, setAcknowledgedCheck] = useState<string | null>(
    null,
  );
  const balanceCheck = checkImportBalance({
    summary: job.summary,
    accountType: job.accountType,
    accountCurrency: job.accountCurrency,
    rows: job.rows,
  });
  const balanceKey = JSON.stringify({ id, balanceCheck });
  const acknowledged = acknowledgedCheck === balanceKey;

  const update = api.imports.updateRows.useMutation({
    onMutate: ({ ids, decision }) => {
      utils.imports.get.setData({ id }, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((r) =>
                !ids.includes(r.id)
                  ? r
                  : {
                      ...r,
                      decision: decision ?? r.decision,
                    },
              ),
            }
          : old,
      );
    },
    onError: () => utils.imports.get.invalidate({ id }),
    onSuccess: () => utils.imports.get.invalidate({ id }),
  });
  const commit = api.imports.commit.useMutation({
    onSuccess: async (counts) => {
      setFlash(t.imports.importReview.saved(counts));
      await Promise.all([
        utils.imports.invalidate(),
        utils.accounts.invalidate(),
        utils.spending.invalidate(),
        utils.portfolio.invalidate(),
      ]);
      router.refresh();
    },
  });
  const retry = api.imports.retry.useMutation({
    onSuccess: () => utils.imports.get.invalidate({ id }),
  });
  const discard = api.imports.discard.useMutation({
    onSuccess: async () => {
      await utils.imports.list.invalidate();
      router.push("/imports");
    },
  });
  const restore = api.accounts.restore.useMutation({
    onSuccess: async () => {
      setFlash(t.imports.importReview.originalAccountRestoredItsImports);
      await Promise.all([
        utils.accounts.invalidate(),
        utils.imports.invalidate(),
        utils.portfolio.invalidate(),
      ]);
      router.refresh();
    },
  });

  const reading = isReading(job.status, job.stale);
  const failed = job.status === "failed" || job.stale;
  const group = job.accountType ? accountGroupOf(job.accountType) : null;
  const rows = job.rows;
  const of = <K extends Row["kind"]>(kind: K) =>
    rows.filter((r): r is RowOf<K> => r.kind === kind);
  const accepted = rows.filter((r) => r.decision === "accept");
  const mismatches = accepted.filter(
    (r) => r.kind === "transaction" && r.data.signMismatch,
  );
  const undecided = rows.filter(
    (r) => r.matchStatus === "possible_duplicate" && r.decision === "pending",
  );
  const holdingsDate =
    job.status === "completed" ? job.importedHoldingsAsOf : asOf;
  const hasHoldings =
    job.status === "completed"
      ? !!job.importedHoldingsAsOf
      : accepted.some(
          (r) => r.kind === "position" || r.kind === "cash_balance",
        );
  const isHistorical =
    hasHoldings &&
    holdingsDate &&
    job.latestHoldingsAsOf &&
    holdingsDate < job.latestHoldingsAsOf;
  const setDecision = (ids: string[], decision: "accept" | "skip") =>
    ids.length > 0 && update.mutate({ jobId: id, ids, decision });

  return (
    <RowControls.Provider
      value={{
        completed: job.status === "completed",
        canRemove: !!job.accountId && !job.accountArchivedAt,
        onRemove: setRemoving,
        editingAmount,
        setEditingAmount,
        onAmount: (rowId, amount) =>
          update.mutate({ jobId: id, ids: [rowId], patch: { amount } }),
        onConfirmAmount: (rowId) =>
          update.mutate({
            jobId: id,
            ids: [rowId],
            patch: { confirmAmount: true },
          }),
      }}
    >
      <Link
        href="/imports"
        className="text-ink-2 hover:text-ink mb-4 inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" />
        {t.imports.importReview.imports}
      </Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-poster truncate text-[32px] leading-tight font-extrabold sm:text-[44px]">
            {job.fileName}
          </h1>
          <p className="text-ink-2 mt-2 flex flex-wrap items-center gap-2 text-sm">
            {job.accountName ? (
              <>
                <InstitutionMark
                  institutionKey={job.institutionKey}
                  name={job.institutionName ?? job.accountName}
                  className="size-6 rounded-[5px]"
                />
                <Link
                  href={`/accounts/${job.accountId}`}
                  className="font-semibold hover:underline hover:underline-offset-4"
                >
                  {job.accountName}
                </Link>
                <span className="text-ink-3">
                  {t.common.accountTypes[job.accountType!]}
                </span>
              </>
            ) : (
              t.imports.importReview.theAccountWasRemoved
            )}
          </p>
        </div>
        <ImportStatus status={job.status} stale={job.stale} />
      </header>

      {job.accountArchivedAt && job.accountId ? (
        <Notice tone="warn" className="mb-4">
          <p>
            {t.imports.importReview.thisImportBelongsToThe}{" "}
            <strong>{job.accountName}</strong>
            {t.imports.importReview.itsSavedRecordsAreStill}
          </p>
          <p className="mt-2">
            {t.imports.importReview.restoreTheOriginalAccountTo}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              loading={restore.isPending}
              onClick={() => {
                if (job.accountId) restore.mutate({ id: job.accountId });
              }}
            >
              {t.imports.importReview.restoreOriginalAccount}
            </Button>
            <Link
              className="font-semibold underline underline-offset-4"
              href={`/accounts/${job.accountId}`}
            >
              {t.imports.importReview.viewOriginalAccount}
            </Link>
          </div>
          {restore.error ? (
            <p className="text-loss mt-2">{errorMessage(restore.error)}</p>
          ) : null}
        </Notice>
      ) : !job.accountId ? (
        <Notice tone="warn" className="mb-4">
          {t.imports.importReview.theOriginalAccountWasDeleted}
        </Notice>
      ) : null}

      {job.status === "completed" && job.accountId && !job.accountArchivedAt ? (
        <p className="text-ink-2 mb-4 text-sm">
          {t.imports.importReview.useTheTrashButtonBeside}
        </p>
      ) : null}

      {flash ? (
        <Notice tone="success" className="mb-4">
          {flash}{" "}
          <Link
            href={
              group === "banking"
                ? `/spending?account=${job.accountId}`
                : `/accounts/${job.accountId}`
            }
            className="font-semibold underline underline-offset-4"
          >
            {group === "banking"
              ? t.imports.importReview.seeThemInSpending
              : t.imports.importReview.openTheAccount}
          </Link>
        </Notice>
      ) : null}
      {update.error ? (
        <Notice tone="error" className="mb-4">
          {errorMessage(update.error)}
        </Notice>
      ) : null}

      {reading ? (
        <section className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="size-40">
            <ReadGlyph />
          </div>
          <p className="font-poster mt-4 text-[26px] font-bold">
            {t.imports.importReview.readingYourStatement}
          </p>
          <p className="text-ink-2 mt-1 max-w-md text-sm">
            {t.imports.importReview.everyLineIsBeingRead}
          </p>
        </section>
      ) : failed ? (
        <section className="card p-6 sm:p-8">
          <p className="font-poster text-[24px] font-bold">
            {t.imports.importReview.thisOneCouldntBeRead}
          </p>
          <p className="text-ink-2 mt-2 text-sm">
            {job.stale
              ? job.status === "queued"
                ? t.imports.importReview.readingNeverStartedProbablyBecause
                : t.imports.importReview.readingStoppedPartwayProbablyBecause
              : (job.error ??
                t.imports.importReview.somethingWentWrongReadingThe)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => retry.mutate({ jobId: id })}
              loading={retry.isPending}
            >
              <RotateCcw className="size-4" />
              {t.imports.importReview.tryAgain}
            </Button>
            <Button
              variant="ghost"
              onClick={() => discard.mutate({ jobId: id })}
              loading={discard.isPending}
            >
              <Trash2 className="size-4" />
              {t.imports.importReview.removeUpload}
            </Button>
          </div>
          {retry.error ? (
            <Notice tone="error" className="mt-4">
              {errorMessage(retry.error)}
            </Notice>
          ) : null}
        </section>
      ) : (
        <div className="space-y-4 pb-24">
          <Summary job={job} check={balanceCheck} />
          {job.status === "needs_review" &&
          balanceCheck.requiresAcknowledgment ? (
            <Notice tone="warn">
              <p>{t.imports.importReview.compareTheRowsWithYour}</p>
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={
                    update.isPending ||
                    balanceCheck.provisional ||
                    editingAmount !== null
                  }
                  onChange={(e) =>
                    setAcknowledgedCheck(e.target.checked ? balanceKey : null)
                  }
                  className="accent-ink size-4"
                />
                {t.imports.importReview.iveCheckedThisSaveAnyway}
              </label>
            </Notice>
          ) : null}
          {job.status === "needs_review" && undecided.length > 0 ? (
            <Notice tone="warn">
              {t.imports.importReview.duplicates(undecided.length)}
            </Notice>
          ) : null}
          {job.status === "completed" && job.importedHoldingsAdjusted ? (
            <Notice>
              {t.imports.importReview.theHoldingsFromThisImport}{" "}
              {job.accountId ? (
                <Link
                  className="font-semibold underline underline-offset-4"
                  href={`/accounts/${job.accountId}`}
                >
                  {t.imports.importReview.viewAdjustedHoldings}
                </Link>
              ) : null}
            </Notice>
          ) : null}
          {job.status === "completed" &&
          !job.importedHoldingsAsOf &&
          rows.some(
            (r) =>
              (r.kind === "position" || r.kind === "cash_balance") &&
              r.committedRecordId,
          ) ? (
            <Notice tone="warn">
              {t.imports.importReview.theHoldingsOrBalanceEntry}
            </Notice>
          ) : null}
          {isHistorical ? (
            <Notice tone="warn">
              {t.imports.importReview.historical(
                job.status === "completed",
                formatDate(holdingsDate, locale),
                group === "banking",
                formatDate(job.latestHoldingsAsOf!, locale),
              )}
              {job.accountId ? (
                <>
                  {" "}
                  <Link
                    className="font-semibold underline underline-offset-4"
                    href={`/accounts/${job.accountId}`}
                  >
                    {t.imports.importReview.viewAccount}
                  </Link>
                </>
              ) : null}
            </Notice>
          ) : null}
          {job.status === "needs_review" && needsDate && !asOf ? (
            <Notice tone="warn">
              {t.imports.importReview.chooseTheStatementDateBefore}
            </Notice>
          ) : null}
          {job.status === "needs_review" &&
          hasHoldings &&
          job.statementDates.includes(asOf) ? (
            <Notice tone="warn">
              {t.imports.importReview.replaceDate(formatDate(asOf, locale))}
            </Notice>
          ) : null}

          {group === "banking" ? (
            <>
              <TransactionsSection
                rows={of("transaction")}
                disabled={job.status !== "needs_review" || update.isPending}
                onDecision={setDecision}
                onTransfer={(rowId, isTransfer) =>
                  update.mutate({
                    jobId: id,
                    ids: [rowId],
                    patch: { isTransfer },
                  })
                }
                onCategory={(rowId, categoryId) =>
                  update.mutate({
                    jobId: id,
                    ids: [rowId],
                    patch: { categoryId },
                  })
                }
              />
              <BalanceSection
                rows={of("cash_balance")}
                asOf={holdingsDate ?? asOf}
                disabled={job.status !== "needs_review" || update.isPending}
                onDecision={setDecision}
              />
            </>
          ) : (
            <>
              <HoldingsSection
                positions={of("position")}
                cash={of("cash_balance")}
                disabled={job.status !== "needs_review" || update.isPending}
                onDecision={setDecision}
              />
              <ActivitySection
                rows={of("investment_transaction")}
                disabled={job.status !== "needs_review" || update.isPending}
                onDecision={setDecision}
              />
            </>
          )}

          {job.status === "needs_review" ? (
            <div className="card fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 px-4 py-3 lg:sticky lg:inset-x-auto lg:bottom-4">
              <p className="text-ink-2 mr-auto text-[13px]">
                {t.imports.importReview.selected(
                  accepted.length,
                  rows.length,
                  undecided.length,
                )}
                {mismatches.length > 0 ? (
                  <span className="text-warn">
                    {t.imports.importReview.warnings(mismatches.length)}
                  </span>
                ) : null}
              </p>
              {needsDate ? (
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="text-ink-2">
                    {t.imports.importReview.asOf}
                  </span>
                  <Input
                    type="date"
                    value={asOf}
                    onChange={(e) => setAsOf(e.target.value)}
                    className="h-8 w-40"
                  />
                </label>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => discard.mutate({ jobId: id })}
                loading={discard.isPending}
              >
                {t.imports.importReview.discard}
              </Button>
              <Button
                onClick={() =>
                  commit.mutate({
                    jobId: id,
                    asOf,
                    acknowledgeBalanceMismatch: acknowledged,
                  })
                }
                loading={commit.isPending}
                disabled={
                  accepted.length === 0 ||
                  (balanceCheck.requiresAcknowledgment && !acknowledged) ||
                  undecided.length > 0 ||
                  !asOf ||
                  update.isPending ||
                  editingAmount !== null ||
                  !job.accountId ||
                  !!job.accountArchivedAt
                }
              >
                <Check className="size-4" />
                {t.imports.importReview.saveTo(
                  accepted.length,
                  job.accountName,
                )}
              </Button>
              {commit.error ? (
                <Notice tone="error" className="w-full">
                  {errorMessage(commit.error)}
                </Notice>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <ImportLineRemoval
        jobId={id}
        rowId={removing?.id ?? null}
        accountId={job.accountId}
        onClose={() => setRemoving(null)}
        onRemoved={async () => {
          setRemoving(null);
          setFlash(t.imports.importReview.rowRemovedFromTheAccount);
          await Promise.all([
            utils.imports.invalidate(),
            utils.accounts.invalidate(),
            utils.spending.invalidate(),
            utils.portfolio.invalidate(),
          ]);
          router.refresh();
        }}
      />
    </RowControls.Provider>
  );
}

function Summary({
  job,
  check,
}: {
  job: Job;
  check: ReturnType<typeof checkImportBalance>;
}) {
  const t = useT();
  const locale = useLocale();
  const s = job.summary;
  if (!s) return null;
  const currency = check.currency;
  const facts = [
    {
      label: t.imports.importReview.document,
      value:
        documentLabels(t)[s.documentType] ?? t.imports.importReview.document,
    },
    {
      label: t.imports.importReview.period,
      value:
        s.periodStart && s.periodEnd
          ? s.periodStart === s.periodEnd
            ? formatDate(s.periodEnd, locale)
            : `${s.periodStart.slice(0, 4) === s.periodEnd.slice(0, 4) ? shortDate(s.periodStart, locale) : formatDate(s.periodStart, locale)} – ${formatDate(s.periodEnd, locale)}`
          : s.periodEnd
            ? formatDate(s.periodEnd, locale)
            : t.imports.importReview.notShown,
    },
    ...(check.openingBalance !== null
      ? [
          {
            label: t.imports.importReview.opening,
            value: money(check.openingBalance, currency),
          },
        ]
      : []),
    ...(check.closingBalance !== null
      ? [
          {
            label: t.imports.importReview.closing,
            value: money(check.closingBalance, currency),
          },
        ]
      : []),
  ];
  return (
    <section className="card overflow-hidden">
      <div className="ink-strip h-1.5" />
      <div className="p-5 sm:p-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="eyebrow">{f.label}</dt>
              <dd className="figures mt-1 text-[15px] font-semibold">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 space-y-3 text-[13px]">
          {check.provisional ? (
            <Tag tone="warn">
              {t.imports.importReview.provisionalDecidePossibleDuplicates}
            </Tag>
          ) : null}
          {!check.complete ? (
            <p className="text-ink-2">
              {t.imports.summary.unverified(
                check.openingBalance !== null && check.closingBalance !== null,
              )}
            </p>
          ) : null}
          {check.currencies.map((c) =>
            c.extraction.difference === null ? (
              c.lineCount > 0 ? (
                <p key={c.currency} className="text-ink-2">
                  {t.imports.summary.excluded(c.lineCount, c.currency)}
                </p>
              ) : null
            ) : (
              <div key={c.currency} className="space-y-1">
                <p className="font-semibold">
                  {t.imports.summary.balanceCheck(c.currency)}
                </p>
                {(
                  [
                    [t.imports.importReview.extractionBalances, c.extraction],
                    [t.imports.importReview.savedRecordsWillBalance, c.saved],
                  ] as const
                ).map(([label, result]) => (
                  <p
                    key={label}
                    className={result.balances ? "text-gain" : "text-warn"}
                  >
                    {t.imports.summary.result(
                      label,
                      result.balances,
                      money(new Decimal(result.difference!).abs(), c.currency),
                      new Decimal(result.difference!).isPositive(),
                    )}
                  </p>
                ))}
                {c.skippedRows.length > 0 ? (
                  <div className="text-ink-2">
                    <p>
                      {t.imports.summary.skipped(
                        c.skippedExplainDifference,
                        money(c.skippedTotal, c.currency, true),
                      )}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {c.skippedRows.map((r) => (
                        <li key={r.id}>
                          {r.postedDate
                            ? `${shortDate(r.postedDate, locale)} · `
                            : ""}
                          {r.description} · {money(r.amount, c.currency, true)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ),
          )}
          {s.balanceAcknowledgment ? (
            <Tag tone="warn">
              {t.imports.importReview.savedWithAnAcknowledgedBalance}
            </Tag>
          ) : null}
        </div>
        {s.warnings.length > 0 ? (
          <ul className="mt-4 space-y-1">
            {s.warnings.map((w) => (
              <li key={w} className="text-warn flex gap-2 text-[13px]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        {job.model ? (
          <p className="text-ink-3 mt-4 font-mono text-[11px] tracking-wide">
            {t.imports.summary.readBy(job.model.toUpperCase())}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function RowControl({
  row,
  ...props
}: {
  row: Row;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const t = useT();
  const controls = useContext(RowControls);
  if (!controls.completed)
    return (
      <Toggle {...props} disabled={props.disabled || !controls.canRemove} />
    );
  if (row.removed) return <Tag>{t.imports.importReview.removed}</Tag>;
  if (!row.committedRecordId)
    return <Tag>{t.imports.importReview.excluded}</Tag>;
  return (
    <button
      type="button"
      aria-label={t.imports.importReview.remove(props.label)}
      title={
        controls.canRemove
          ? t.imports.importReview.reviewRemoval
          : t.imports.importReview.restoreTheOriginalAccountToText
      }
      disabled={!controls.canRemove}
      onClick={() => controls.onRemove(row)}
      className="text-loss hover:bg-wash rounded-ctl grid size-10 shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-ink size-4 shrink-0 cursor-pointer disabled:cursor-default"
    />
  );
}

function SelectAll({
  rows,
  disabled,
  onDecision,
}: {
  rows: Row[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  if (disabled || rows.length < 2) return null;
  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          onDecision(
            rows.filter((r) => r.decision !== "accept").map((r) => r.id),
            "accept",
          )
        }
      >
        {t.imports.importReview.all}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          onDecision(
            rows.filter((r) => r.decision !== "skip").map((r) => r.id),
            "skip",
          )
        }
      >
        {t.imports.importReview.none}
      </Button>
    </div>
  );
}

function MatchTag({ status }: { status: Row["matchStatus"] }) {
  const t = useT();
  if (status === "duplicate")
    return <Tag tone="outline">{t.imports.importReview.alreadyRecorded}</Tag>;
  if (status === "possible_duplicate")
    return <Tag tone="warn">{t.imports.importReview.similarOneRecorded}</Tag>;
  return null;
}

function DuplicateDecision({
  row,
  disabled,
  onDecision,
}: {
  row: Row;
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  if (disabled || row.matchStatus !== "possible_duplicate") return null;
  return (
    <span className="mt-2 flex items-center gap-2">
      {row.decision === "pending" ? (
        <Tag tone="warn">{t.imports.importReview.needsDecision}</Tag>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={row.decision === "accept"}
        onClick={() => onDecision([row.id], "accept")}
      >
        {t.imports.importReview.keep}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={row.decision === "skip"}
        onClick={() => onDecision([row.id], "skip")}
      >
        {t.imports.importReview.skip}
      </Button>
    </span>
  );
}

function TransactionsSection({
  rows,
  disabled,
  onDecision,
  onCategory,
  onTransfer,
}: {
  rows: RowOf<"transaction">[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
  onCategory: (rowId: string, categoryId: string | null) => void;
  onTransfer: (rowId: string, isTransfer: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const ordered = orderCategories(categories);
  const currencies = [...new Set(rows.map((r) => r.data.currency))];
  const sum = (currency: string, sign: 1 | -1) =>
    rows
      .filter(
        (r) =>
          r.decision === "accept" &&
          r.data.currency === currency &&
          !r.data.isTransfer &&
          new Decimal(r.data.amount).isPositive() === sign > 0,
      )
      .reduce((t, r) => t.plus(r.data.amount), new Decimal(0))
      .abs();

  return (
    <Section
      title={t.imports.importReview.transactions(rows.length)}
      description={
        !disabled && rows.length > 0
          ? t.imports.importReview.totals(
              currencies
                .map((currency) => money(sum(currency, 1), currency))
                .join(" · "),
              currencies
                .map((currency) => money(sum(currency, -1), currency))
                .join(" · "),
            )
          : undefined
      }
      actions={
        <SelectAll rows={rows} disabled={disabled} onDecision={onDecision} />
      }
    >
      {rows.length === 0 ? (
        <p className="text-ink-2 text-sm">
          {t.imports.importReview.noTransactionsWereFound}
        </p>
      ) : (
        <ul className="-mx-1">
          {rows.map((r) => {
            const amount = new Decimal(r.data.amount);
            const skipped = r.decision === "skip";
            return (
              <li
                key={r.id}
                className={cn(
                  "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border-b px-1 py-3 last:border-b-0 sm:grid-cols-[auto_4.5rem_minmax(0,1fr)_12rem_auto] sm:items-center",
                  skipped && "opacity-50",
                  r.decision === "pending" && "bg-warn-wash",
                )}
              >
                <span className="pt-0.5 sm:pt-0">
                  <RowControl
                    row={r}
                    checked={r.decision === "accept"}
                    disabled={disabled}
                    label={t.imports.importReview.saveRow(r.data.description)}
                    onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
                  />
                </span>
                <span className="figures text-ink-3 hidden font-mono text-[12px] sm:block">
                  {shortDate(r.data.postedDate, locale)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">
                    {r.data.merchant ?? r.data.description}
                  </span>
                  <span className="text-ink-3 block truncate text-[12px]">
                    <span className="sm:hidden">
                      {shortDate(r.data.postedDate, locale)}
                      {r.data.merchant ? " · " : ""}
                    </span>
                    {r.data.merchant ? r.data.description : null}
                    {r.data.reference
                      ? t.imports.importReview.reference(r.data.reference)
                      : null}
                    {r.data.originalAmount && r.data.originalCurrency
                      ? ` · ${money(r.data.originalAmount, r.data.originalCurrency)}`
                      : null}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.data.isTransfer ? (
                      <Tag>{t.imports.importReview.transfer}</Tag>
                    ) : null}
                    <MatchTag status={r.matchStatus} />
                    {r.data.signMismatch ? (
                      <Tag tone="warn">
                        {t.imports.importReview.checkAmountdirection}
                      </Tag>
                    ) : null}
                  </span>
                  <AmountWarning row={r} disabled={disabled} />
                  <DuplicateDecision
                    row={r}
                    disabled={disabled}
                    onDecision={onDecision}
                  />
                  <span className="mt-2 block sm:hidden">
                    <CategoryPicker
                      row={r}
                      categories={ordered}
                      disabled={disabled}
                      onCategory={onCategory}
                      onTransfer={onTransfer}
                    />
                  </span>
                </span>
                <span className="hidden sm:block">
                  <CategoryPicker
                    row={r}
                    categories={ordered}
                    disabled={disabled}
                    onCategory={onCategory}
                    onTransfer={onTransfer}
                  />
                </span>
                <span
                  className={cn(
                    "figures text-right font-mono text-[13px] font-semibold",
                    amount.isPositive() && "text-gain",
                  )}
                >
                  <RowAmount row={r} disabled={disabled} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function AmountWarning({
  row,
  disabled,
}: {
  row: RowOf<"transaction">;
  disabled: boolean;
}) {
  const t = useT();
  const controls = useContext(RowControls);
  const data = row.data;
  if (!data.signMismatch) return null;
  const direction =
    data.printedDirection === "credit"
      ? "CR "
      : data.printedDirection === "debit"
        ? "DR "
        : "";
  return (
    <span className="text-warn mt-1 block text-[12px]">
      {t.imports.importReview.printed(
        direction,
        data.printedAmount ?? new Decimal(data.amount).abs().toFixed(),
      )}
      {!disabled ? (
        <span className="mt-1 flex flex-wrap gap-1">
          {data.suggestedAmount !== null ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => controls.onAmount(row.id, data.suggestedAmount!)}
            >
              {t.imports.importReview.useAmount(
                money(data.suggestedAmount, data.currency, true),
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => controls.onConfirmAmount(row.id)}
          >
            {t.imports.importReview.confirmCurrentAmount}
          </Button>
        </span>
      ) : null}
    </span>
  );
}

function RowAmount({
  row,
  disabled,
}: {
  row:
    | RowOf<"transaction">
    | RowOf<"cash_balance">
    | RowOf<"investment_transaction">;
  disabled: boolean;
}) {
  const t = useT();
  const controls = useContext(RowControls);
  const [draft, setDraft] = useState(row.data.amount);
  const editing = controls.editingAmount === row.id;
  const valid = moneyInput.safeParse(draft).success;
  const label =
    row.kind === "transaction"
      ? row.data.description
      : row.kind === "cash_balance"
        ? t.imports.importReview.balanceLabel(
            row.data.currency,
            row.data.bucket ? t.common.cpfBuckets[row.data.bucket] : null,
          )
        : t.imports.importReview.activityLabel(
            activityLabels(t)[row.data.type] ?? row.data.type,
            row.data.symbol,
          );
  return (
    <span className="inline-grid gap-1">
      {money(row.data.amount, row.data.currency, row.kind !== "cash_balance")}
      {!disabled && !editing ? (
        <button
          type="button"
          className="text-ink-3 text-right font-sans text-[12px] font-normal underline"
          aria-label={t.imports.importReview.editAmountFor(label)}
          onClick={() => {
            setDraft(row.data.amount);
            controls.setEditingAmount(row.id);
          }}
        >
          {t.imports.importReview.editAmount}
        </button>
      ) : null}
      {!disabled && editing ? (
        <span className="grid max-w-52 gap-1 font-sans font-normal">
          <Input
            aria-label={t.imports.importReview.amountFor(label)}
            inputMode="decimal"
            value={draft}
            aria-invalid={!valid}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8"
          />
          <span className="text-ink-3 text-[11px]">
            {row.kind === "cash_balance"
              ? t.imports.importReview.negativeDebtoverdraftPositiveCashcredit
              : t.imports.importReview.negativeMoneyOutPositiveMoney}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!valid}
            onClick={() =>
              setDraft(new Decimal(draft.trim()).negated().toFixed())
            }
          >
            {t.imports.importReview.flipDirection}
          </Button>
          <span className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => controls.setEditingAmount(null)}
            >
              {t.imports.importReview.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!valid}
              onClick={() => {
                controls.onAmount(row.id, draft.trim());
                controls.setEditingAmount(null);
              }}
            >
              {t.imports.importReview.applyAmount}
            </Button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

function CategoryPicker({
  row,
  categories,
  disabled,
  onCategory,
  onTransfer,
}: {
  row: RowOf<"transaction">;
  categories: RouterOutputs["catalog"]["categories"];
  disabled: boolean;
  onCategory: (rowId: string, categoryId: string | null) => void;
  onTransfer: (rowId: string, isTransfer: boolean) => void;
}) {
  const t = useT();
  return (
    <span className="grid gap-1">
      <TransactionTypeSelect
        value={transactionType(row.data.amount, row.data.isTransfer)}
        disabled={disabled}
        expenseDisabled={new Decimal(row.data.amount).isPositive()}
        incomeDisabled={!new Decimal(row.data.amount).isPositive()}
        onChange={(value) => onTransfer(row.id, value === "transfer")}
      />
      <Select
        aria-label={t.imports.importReview.category}
        value={row.data.categoryId ?? ""}
        disabled={disabled}
        onChange={(e) => onCategory(row.id, e.target.value || null)}
        className={cn("h-8 text-[12px]", !row.data.categoryId && "text-ink-3")}
      >
        <option value="">{t.imports.importReview.uncategorised}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parentId
              ? `— ${categoryLabel(t, c.name)}`
              : categoryLabel(t, c.name)}
          </option>
        ))}
      </Select>
    </span>
  );
}

function BalanceSection({
  rows,
  asOf,
  disabled,
  onDecision,
}: {
  rows: RowOf<"cash_balance">[];
  asOf: string;
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  const locale = useLocale();
  if (rows.length === 0) return null;
  return (
    <Section
      title={t.imports.importReview.closingBalance}
      description={t.imports.importReview.savedAsTheAccountsBalance}
    >
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
          <RowControl
            row={r}
            checked={r.decision === "accept"}
            disabled={disabled}
            label={
              r.data.bucket
                ? t.imports.importReview.saveBucket(
                    t.common.cpfBuckets[r.data.bucket],
                  )
                : t.imports.importReview.saveTheClosingBalance
            }
            onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
          />
          <span>
            {t.imports.importReview.recordBefore}{" "}
            <span className="figures font-mono font-semibold">
              <RowAmount row={r} disabled={disabled} />
            </span>{" "}
            {t.imports.importReview.recordAfter(
              r.data.bucket ? t.common.cpfBuckets[r.data.bucket] : null,
              asOf
                ? formatDate(asOf, locale)
                : t.imports.importReview.statementDate,
            )}
          </span>
        </div>
      ))}
    </Section>
  );
}

function HoldingsSection({
  positions,
  cash,
  disabled,
  onDecision,
}: {
  positions: RowOf<"position">[];
  cash: RowOf<"cash_balance">[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  const all = [...positions, ...cash];
  return (
    <Section
      title={t.imports.importReview.holdings(positions.length)}
      description={t.imports.importReview.savedTogetherAsWhatThe}
      actions={
        <SelectAll rows={all} disabled={disabled} onDecision={onDecision} />
      }
    >
      {all.length === 0 ? (
        <p className="text-ink-2 text-sm">
          {t.imports.importReview.noHoldingsOrCashWere}
        </p>
      ) : (
        <ul className="-mx-1">
          {positions.map((r) => (
            <li
              key={r.id}
              className={cn(
                "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-1 py-3",
                r.decision !== "accept" && "opacity-50",
              )}
            >
              <RowControl
                row={r}
                checked={r.decision === "accept"}
                disabled={disabled}
                label={t.imports.importReview.saveSymbol(r.data.symbol)}
                onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
              />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">
                  {r.data.symbol}
                  {r.data.exchange ? (
                    <span className="text-ink-3 ml-1.5 text-[12px] font-normal">
                      {r.data.exchange}
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-3 block truncate text-[12px]">
                  {[
                    t.common.assetClasses[r.data.assetClass],
                    r.data.name,
                    `${formatQuantity(r.data.quantity)}${r.data.price ? ` × ${money(r.data.price, r.data.currency)}` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="figures text-right font-mono text-[13px] font-semibold">
                {r.data.value
                  ? money(r.data.value, r.data.currency)
                  : r.data.price
                    ? money(
                        new Decimal(r.data.quantity).times(r.data.price),
                        r.data.currency,
                      )
                    : t.imports.importReview.noPrice}
              </span>
            </li>
          ))}
          {cash.map((r) => (
            <li
              key={r.id}
              className={cn(
                "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-1 py-3 last:border-b-0",
                r.decision !== "accept" && "opacity-50",
              )}
            >
              <RowControl
                row={r}
                checked={r.decision === "accept"}
                disabled={disabled}
                label={t.imports.importReview.saveCash(r.data.currency)}
                onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
              />
              <span className="text-[14px] font-semibold">
                {t.imports.importReview.cash(r.data.currency)}
              </span>
              <span className="figures text-right font-mono text-[13px] font-semibold">
                <RowAmount row={r} disabled={disabled} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ActivitySection({
  rows,
  disabled,
  onDecision,
}: {
  rows: RowOf<"investment_transaction">[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
}) {
  const t = useT();
  const locale = useLocale();
  if (rows.length === 0) return null;
  return (
    <Section
      title={t.imports.importReview.activity(rows.length)}
      description={t.imports.importReview.buysSellsDividendsFeesAnd}
      actions={
        <SelectAll rows={rows} disabled={disabled} onDecision={onDecision} />
      }
    >
      <ul className="-mx-1">
        {rows.map((r) => (
          <li
            key={r.id}
            className={cn(
              "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-1 py-3 last:border-b-0",
              r.decision === "skip" && "opacity-50",
              r.decision === "pending" && "bg-warn-wash",
            )}
          >
            <RowControl
              row={r}
              checked={r.decision === "accept"}
              disabled={disabled}
              label={t.imports.importReview.saveActivity(
                activityLabels(t)[r.data.type] ?? r.data.type,
                r.data.symbol,
              )}
              onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
            />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold">
                {activityLabels(t)[r.data.type]}
                {r.data.symbol ? ` · ${r.data.symbol}` : ""}
              </span>
              <span className="text-ink-3 block truncate text-[12px]">
                {[
                  formatDate(r.data.tradeDate, locale),
                  r.data.quantity && r.data.price
                    ? `${formatQuantity(r.data.quantity)} × ${money(r.data.price, r.data.currency)}`
                    : null,
                  r.data.description,
                  r.data.reference
                    ? t.imports.importReview.ref(r.data.reference)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="mt-1 flex gap-1">
                <MatchTag status={r.matchStatus} />
              </span>
              <DuplicateDecision
                row={r}
                disabled={disabled}
                onDecision={onDecision}
              />
            </span>
            <span
              className={cn(
                "figures text-right font-mono text-[13px] font-semibold",
                new Decimal(r.data.amount).isPositive() && "text-gain",
              )}
            >
              <RowAmount row={r} disabled={disabled} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
