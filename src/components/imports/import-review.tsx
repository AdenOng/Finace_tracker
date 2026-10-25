"use client";

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
import {
  accountGroupOf,
  accountTypeLabels,
  assetClassLabels,
  cpfBucketLabels,
} from "~/lib/accounts";
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

const DOCUMENT_LABELS: Record<string, string> = {
  bank_statement: "Bank statement",
  card_statement: "Card statement",
  brokerage_statement: "Brokerage statement",
  trade_confirmation: "Trade confirmation",
  screenshot: "Screenshot",
  other: "Document",
};

const ACTIVITY_LABELS: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  tax: "Tax",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  split: "Split",
  fx: "FX",
  other: "Other",
};

/** "12 Sept" — the statement period already gives the year. */
const shortDate = (iso: string) => formatDate(iso).replace(/ \d{4}$/, "");

const money = (
  amount: string | number | Decimal,
  currency: string,
  signed = false,
) => formatMoney(new Decimal(amount).toFixed(2), currency, { signed });

export function ImportReview({ id }: { id: string }) {
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
      const parts = [
        counts.transactions && `${counts.transactions} transactions`,
        counts.holdings && `${counts.holdings} holdings`,
        counts.activity && `${counts.activity} trades and payments`,
        counts.balances && `the balance`,
      ].filter(Boolean);
      setFlash(
        `Saved ${parts.join(", ") || "nothing"}.${counts.duplicates ? ` ${counts.duplicates} already recorded were left out.` : ""}`,
      );
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
      setFlash(
        "Original account restored. Its imports and saved records remain attached.",
      );
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
        Imports
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
                  {accountTypeLabels[job.accountType!]}
                </span>
              </>
            ) : (
              "The account was removed"
            )}
          </p>
        </div>
        <ImportStatus status={job.status} stale={job.stale} />
      </header>

      {job.accountArchivedAt && job.accountId ? (
        <Notice tone="warn" className="mb-4">
          <p>
            This import belongs to the archived account{" "}
            <strong>{job.accountName}</strong>. Its saved records are still
            there. Adding this broker again creates a separate account; it does
            not move older imports.
          </p>
          <p className="mt-2">
            Restore the original account to manage these rows and include its
            holdings in your totals again.
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
              Restore original account
            </Button>
            <Link
              className="font-semibold underline underline-offset-4"
              href={`/accounts/${job.accountId}`}
            >
              View original account
            </Link>
          </div>
          {restore.error ? (
            <p className="text-loss mt-2">{errorMessage(restore.error)}</p>
          ) : null}
        </Notice>
      ) : !job.accountId ? (
        <Notice tone="warn" className="mb-4">
          The original account was deleted. This upload is kept for reference.
          Adding the broker again creates a separate account and does not
          transfer this import or restore deleted records.
        </Notice>
      ) : null}

      {job.status === "completed" && job.accountId && !job.accountArchivedAt ? (
        <p className="text-ink-2 mb-4 text-sm">
          Use the trash button beside a saved row to review its removal. The
          original upload and extracted rows stay available.
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
            {group === "banking" ? "See them in Spending" : "Open the account"}
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
            Reading your statement
          </p>
          <p className="text-ink-2 mt-1 max-w-md text-sm">
            Every line is being read and sorted. A few pages usually take under
            a minute; you can leave this page and come back.
          </p>
        </section>
      ) : failed ? (
        <section className="card p-6 sm:p-8">
          <p className="font-poster text-[24px] font-bold">
            This one couldn&apos;t be read
          </p>
          <p className="text-ink-2 mt-2 text-sm">
            {job.stale
              ? job.status === "queued"
                ? "Reading never started, probably because the server restarted."
                : "Reading stopped part-way, probably because the server restarted."
              : (job.error ?? "Something went wrong reading the file.")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => retry.mutate({ jobId: id })}
              loading={retry.isPending}
            >
              <RotateCcw className="size-4" />
              Try again
            </Button>
            <Button
              variant="ghost"
              onClick={() => discard.mutate({ jobId: id })}
              loading={discard.isPending}
            >
              <Trash2 className="size-4" />
              Remove upload
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
              <p>
                Compare the rows with your statement. Correct the difference or
                confirm you have checked it.
              </p>
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
                I&apos;ve checked this — save anyway
              </label>
            </Notice>
          ) : null}
          {job.status === "needs_review" && undecided.length > 0 ? (
            <Notice tone="warn">
              {undecided.length} possible{" "}
              {undecided.length === 1 ? "duplicate needs" : "duplicates need"} a
              decision. Choose Keep or Skip on each highlighted row before
              saving.
            </Notice>
          ) : null}
          {job.status === "completed" && job.importedHoldingsAdjusted ? (
            <Notice>
              The holdings from this import have been adjusted in the account.
              The rows below show the original extraction.{" "}
              {job.accountId ? (
                <Link
                  className="font-semibold underline underline-offset-4"
                  href={`/accounts/${job.accountId}`}
                >
                  View adjusted holdings
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
              The holdings or balance entry from this import has been removed or
              replaced. The upload and any imported trades remain saved.
            </Notice>
          ) : null}
          {isHistorical ? (
            <Notice tone="warn">
              {job.status === "completed"
                ? "Saved"
                : "This statement will be saved"}{" "}
              for {formatDate(holdingsDate)}. Your account has a newer{" "}
              {group === "banking" ? "balance" : "holdings entry"} dated{" "}
              {formatDate(job.latestHoldingsAsOf!)}. The newer entry remains the
              current account value.
              {job.accountId ? (
                <>
                  {" "}
                  <Link
                    className="font-semibold underline underline-offset-4"
                    href={`/accounts/${job.accountId}`}
                  >
                    View account
                  </Link>
                </>
              ) : null}
            </Notice>
          ) : null}
          {job.status === "needs_review" && needsDate && !asOf ? (
            <Notice tone="warn">
              Choose the statement date before saving. Enter the date these
              holdings, balances or trades belong to in &ldquo;As of&rdquo;
              below.
            </Notice>
          ) : null}
          {job.status === "needs_review" &&
          hasHoldings &&
          job.statementDates.includes(asOf) ? (
            <Notice tone="warn">
              Saving replaces the statement holdings or balance already saved
              for {formatDate(asOf)}. The selected rows become the complete
              entry for that date; existing transactions and trades stay saved.
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
                <span className="text-ink font-semibold">
                  {accepted.length}
                </span>{" "}
                of {rows.length} selected
                {undecided.length > 0 ? ` · ${undecided.length} undecided` : ""}
                {mismatches.length > 0 ? (
                  <span className="text-warn">{` · ${mismatches.length} amount/direction warnings (saving allowed)`}</span>
                ) : null}
              </p>
              {needsDate ? (
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="text-ink-2">As of</span>
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
                Discard
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
                Save {accepted.length} to {job.accountName}
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
          setFlash(
            "Row removed from the account. The original extraction is retained below.",
          );
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
  const s = job.summary;
  if (!s) return null;
  const currency = check.currency;
  const facts = [
    { label: "Document", value: DOCUMENT_LABELS[s.documentType] ?? "Document" },
    {
      label: "Period",
      value:
        s.periodStart && s.periodEnd
          ? s.periodStart === s.periodEnd
            ? formatDate(s.periodEnd)
            : `${s.periodStart.slice(0, 4) === s.periodEnd.slice(0, 4) ? shortDate(s.periodStart) : formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}`
          : s.periodEnd
            ? formatDate(s.periodEnd)
            : "Not shown",
    },
    ...(check.openingBalance !== null
      ? [{ label: "Opening", value: money(check.openingBalance, currency) }]
      : []),
    ...(check.closingBalance !== null
      ? [{ label: "Closing", value: money(check.closingBalance, currency) }]
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
            <Tag tone="warn">Provisional — decide possible duplicates</Tag>
          ) : null}
          {!check.complete ? (
            <p className="text-ink-2">
              Unverified — no opening/closing balance to check against
              {check.openingBalance !== null && check.closingBalance !== null
                ? " for a complete statement"
                : ""}
              .
            </p>
          ) : null}
          {check.currencies.map((c) =>
            c.extraction.difference === null ? (
              c.lineCount > 0 ? (
                <p key={c.currency} className="text-ink-2">
                  {c.lineCount} {c.lineCount === 1 ? "line" : "lines"} in{" "}
                  {c.currency} not included — no opening/closing balances.
                </p>
              ) : null
            ) : (
              <div key={c.currency} className="space-y-1">
                <p className="font-semibold">Balance check · {c.currency}</p>
                {(
                  [
                    ["Extraction balances", c.extraction],
                    ["Saved records will balance", c.saved],
                  ] as const
                ).map(([label, result]) => (
                  <p
                    key={label}
                    className={result.balances ? "text-gain" : "text-warn"}
                  >
                    {label}:{" "}
                    {result.balances
                      ? "matches"
                      : `${money(new Decimal(result.difference!).abs(), c.currency)} ${new Decimal(result.difference!).isPositive() ? "over" : "short of"} closing`}
                    .
                  </p>
                ))}
                {c.skippedRows.length > 0 ? (
                  <div className="text-ink-2">
                    <p>
                      {c.skippedExplainDifference
                        ? "Skipped rows explain the difference"
                        : "Skipped rows not being saved"}
                      : {money(c.skippedTotal, c.currency, true)}. Already
                      recorded rows are included.
                    </p>
                    <ul className="mt-1 space-y-1">
                      {c.skippedRows.map((r) => (
                        <li key={r.id}>
                          {r.postedDate ? `${shortDate(r.postedDate)} · ` : ""}
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
            <Tag tone="warn">Saved with an acknowledged balance mismatch</Tag>
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
            READ BY {job.model.toUpperCase()}
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
  const controls = useContext(RowControls);
  if (!controls.completed)
    return (
      <Toggle {...props} disabled={props.disabled || !controls.canRemove} />
    );
  if (row.removed) return <Tag>Removed</Tag>;
  if (!row.committedRecordId) return <Tag>Excluded</Tag>;
  return (
    <button
      type="button"
      aria-label={`Remove ${props.label.replace(/^Save /, "")}`}
      title={
        controls.canRemove
          ? "Review removal"
          : "Restore the original account to manage this row"
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
        All
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
        None
      </Button>
    </div>
  );
}

function MatchTag({ status }: { status: Row["matchStatus"] }) {
  if (status === "duplicate") return <Tag tone="outline">Already recorded</Tag>;
  if (status === "possible_duplicate")
    return <Tag tone="warn">Similar one recorded</Tag>;
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
  if (disabled || row.matchStatus !== "possible_duplicate") return null;
  return (
    <span className="mt-2 flex items-center gap-2">
      {row.decision === "pending" ? (
        <Tag tone="warn">Needs decision</Tag>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={row.decision === "accept"}
        onClick={() => onDecision([row.id], "accept")}
      >
        Keep
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={row.decision === "skip"}
        onClick={() => onDecision([row.id], "skip")}
      >
        Skip
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
  const [categories] = api.catalog.categories.useSuspenseQuery();
  const ordered = orderCategories(categories);
  const currency = rows[0]?.data.currency ?? "SGD";
  const sum = (sign: 1 | -1) =>
    rows
      .filter(
        (r) =>
          r.decision === "accept" &&
          !r.data.isTransfer &&
          new Decimal(r.data.amount).isPositive() === sign > 0,
      )
      .reduce((t, r) => t.plus(r.data.amount), new Decimal(0))
      .abs();

  return (
    <Section
      title={`Transactions · ${rows.length}`}
      description={
        !disabled && rows.length > 0
          ? `Selected: ${money(sum(1), currency)} in, ${money(sum(-1), currency)} out. Uncheck anything you don't want saved.`
          : undefined
      }
      actions={
        <SelectAll rows={rows} disabled={disabled} onDecision={onDecision} />
      }
    >
      {rows.length === 0 ? (
        <p className="text-ink-2 text-sm">No transactions were found.</p>
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
                    label={`Save ${r.data.description}`}
                    onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
                  />
                </span>
                <span className="figures text-ink-3 hidden font-mono text-[12px] sm:block">
                  {shortDate(r.data.postedDate)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">
                    {r.data.merchant ?? r.data.description}
                  </span>
                  <span className="text-ink-3 block truncate text-[12px]">
                    <span className="sm:hidden">
                      {shortDate(r.data.postedDate)}
                      {r.data.merchant ? " · " : ""}
                    </span>
                    {r.data.merchant ? r.data.description : null}
                    {r.data.reference ? ` · Ref ${r.data.reference}` : null}
                    {r.data.originalAmount && r.data.originalCurrency
                      ? ` · ${money(r.data.originalAmount, r.data.originalCurrency)}`
                      : null}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.data.isTransfer ? <Tag>Transfer</Tag> : null}
                    <MatchTag status={r.matchStatus} />
                    {r.data.signMismatch ? (
                      <Tag tone="warn">Check amount/direction</Tag>
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
      Statement shows {direction}
      {data.printedAmount ?? new Decimal(data.amount).abs().toFixed()}.
      {!disabled ? (
        <span className="mt-1 flex flex-wrap gap-1">
          {data.suggestedAmount !== null ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => controls.onAmount(row.id, data.suggestedAmount!)}
            >
              Use {money(data.suggestedAmount, data.currency, true)}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => controls.onConfirmAmount(row.id)}
          >
            Confirm current amount
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
  const controls = useContext(RowControls);
  const [draft, setDraft] = useState(row.data.amount);
  const editing = controls.editingAmount === row.id;
  const valid = moneyInput.safeParse(draft).success;
  const label =
    row.kind === "transaction"
      ? row.data.description
      : row.kind === "cash_balance"
        ? `${row.data.currency} ${row.data.bucket ?? "closing/cash"} balance`
        : `${row.data.type} ${row.data.symbol ?? "activity"}`;
  return (
    <span className="inline-grid gap-1">
      {money(row.data.amount, row.data.currency, row.kind !== "cash_balance")}
      {!disabled && !editing ? (
        <button
          type="button"
          className="text-ink-3 text-right font-sans text-[12px] font-normal underline"
          aria-label={`Edit amount for ${label}`}
          onClick={() => {
            setDraft(row.data.amount);
            controls.setEditingAmount(row.id);
          }}
        >
          Edit amount
        </button>
      ) : null}
      {!disabled && editing ? (
        <span className="grid max-w-52 gap-1 font-sans font-normal">
          <Input
            aria-label={`Amount for ${label}`}
            inputMode="decimal"
            value={draft}
            aria-invalid={!valid}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8"
          />
          <span className="text-ink-3 text-[11px]">
            {row.kind === "cash_balance"
              ? "Negative = debt/overdraft; positive = cash/credit"
              : "Negative = money out; positive = money in"}
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
            Flip direction
          </Button>
          <span className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => controls.setEditingAmount(null)}
            >
              Cancel
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
              Apply amount
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
        aria-label="Category"
        value={row.data.categoryId ?? ""}
        disabled={disabled}
        onChange={(e) => onCategory(row.id, e.target.value || null)}
        className={cn("h-8 text-[12px]", !row.data.categoryId && "text-ink-3")}
      >
        <option value="">Uncategorised</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.parentId ? `— ${c.name}` : c.name}
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
  if (rows.length === 0) return null;
  return (
    <Section
      title="Closing balance"
      description="Saved as the account's balance, so your net worth matches the statement."
    >
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
          <RowControl
            row={r}
            checked={r.decision === "accept"}
            disabled={disabled}
            label={
              r.data.bucket
                ? `Save the ${cpfBucketLabels[r.data.bucket]} balance`
                : "Save the closing balance"
            }
            onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
          />
          <span>
            Record{" "}
            <span className="figures font-mono font-semibold">
              <RowAmount row={r} disabled={disabled} />
            </span>{" "}
            as the {r.data.bucket ? `${cpfBucketLabels[r.data.bucket]} ` : ""}
            balance on {asOf ? formatDate(asOf) : "the statement date"}
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
  const all = [...positions, ...cash];
  return (
    <Section
      title={`Holdings · ${positions.length}`}
      description="Saved together as what the account held on the date below. A later statement replaces it."
      actions={
        <SelectAll rows={all} disabled={disabled} onDecision={onDecision} />
      }
    >
      {all.length === 0 ? (
        <p className="text-ink-2 text-sm">No holdings or cash were found.</p>
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
                label={`Save ${r.data.symbol}`}
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
                    assetClassLabels[r.data.assetClass],
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
                    : "No price"}
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
                label={`Save ${r.data.currency} cash`}
                onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
              />
              <span className="text-[14px] font-semibold">
                Cash · {r.data.currency}
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
  if (rows.length === 0) return null;
  return (
    <Section
      title={`Trades and payments · ${rows.length}`}
      description="Buys, sells, dividends, fees and deposits listed on the statement."
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
              label={`Save ${r.data.type} ${r.data.symbol ?? ""}`}
              onChange={(c) => onDecision([r.id], c ? "accept" : "skip")}
            />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold">
                {ACTIVITY_LABELS[r.data.type]}
                {r.data.symbol ? ` · ${r.data.symbol}` : ""}
              </span>
              <span className="text-ink-3 block truncate text-[12px]">
                {[
                  formatDate(r.data.tradeDate),
                  r.data.quantity && r.data.price
                    ? `${formatQuantity(r.data.quantity)} × ${money(r.data.price, r.data.currency)}`
                    : null,
                  r.data.description,
                  r.data.reference ? `Ref ${r.data.reference}` : null,
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
