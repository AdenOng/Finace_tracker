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
import { todayIso } from "~/lib/dates";
import { errorMessage } from "~/lib/errors";
import { formatDate, formatMoney, formatQuantity } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Job = RouterOutputs["imports"]["get"];
type Row = Job["rows"][number];
type RowOf<K extends Row["kind"]> = Extract<Row, { kind: K }>;

const RowControls = createContext<{
  completed: boolean;
  canRemove: boolean;
  onRemove: (row: Row) => void;
}>({ completed: false, canRemove: false, onRemove: () => undefined });

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
  // Defaults to the statement's last day once it has been read; today is only known in the browser.
  const [today, setToday] = useState("");
  useEffect(() => setToday(todayIso()), []);
  const [asOfChoice, setAsOf] = useState<string | null>(null);
  const asOf = asOfChoice ?? job.summary?.periodEnd ?? today;
  const [flash, setFlash] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);

  const update = api.imports.updateRows.useMutation({
    onMutate: ({ ids, decision, patch }) => {
      utils.imports.get.setData({ id }, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((r) =>
                !ids.includes(r.id)
                  ? r
                  : ({
                      ...r,
                      decision: decision ?? r.decision,
                      data:
                        patch && r.kind === "transaction"
                          ? { ...r.data, ...patch }
                          : r.data,
                    } as Row),
              ),
            }
          : old,
      );
    },
    onError: () => utils.imports.get.invalidate({ id }),
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
          <Summary job={job} />
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

          {group === "banking" ? (
            <>
              <TransactionsSection
                rows={of("transaction")}
                disabled={job.status !== "needs_review"}
                onDecision={setDecision}
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
                asOf={asOf}
                disabled={job.status !== "needs_review"}
                onDecision={setDecision}
              />
            </>
          ) : (
            <>
              <HoldingsSection
                positions={of("position")}
                cash={of("cash_balance")}
                disabled={job.status !== "needs_review"}
                onDecision={setDecision}
              />
              <ActivitySection
                rows={of("investment_transaction")}
                disabled={job.status !== "needs_review"}
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
              </p>
              {of("cash_balance").some((r) => r.decision === "accept") ||
              of("position").some((r) => r.decision === "accept") ? (
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
                onClick={() => commit.mutate({ jobId: id, asOf })}
                loading={commit.isPending}
                disabled={
                  accepted.length === 0 ||
                  !asOf ||
                  update.isPending ||
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

function Summary({ job }: { job: Job }) {
  const s = job.summary;
  if (!s) return null;
  const currency = s.currency ?? job.accountCurrency ?? "SGD";
  const lines = job.rows.filter(
    (r): r is RowOf<"transaction"> => r.kind === "transaction",
  );
  // Opening balance plus every line should land on the closing balance printed on the statement.
  const check =
    s.openingBalance !== null && s.closingBalance !== null && lines.length > 0
      ? lines
          .reduce(
            (sum, r) => sum.plus(r.data.amount),
            new Decimal(s.openingBalance),
          )
          .minus(s.closingBalance)
      : null;
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
    ...(s.openingBalance !== null
      ? [{ label: "Opening", value: money(s.openingBalance, currency) }]
      : []),
    ...(s.closingBalance !== null
      ? [{ label: "Closing", value: money(s.closingBalance, currency) }]
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
        {check ? (
          <p
            className={cn(
              "rounded-ctl mt-5 flex items-center gap-2 px-3 py-2 text-[13px]",
              check.isZero()
                ? "bg-art-green/10 text-gain"
                : "bg-warn-wash text-warn",
            )}
          >
            {check.isZero() ? (
              <Check className="size-4 shrink-0" />
            ) : (
              <AlertTriangle className="size-4 shrink-0" />
            )}
            {check.isZero()
              ? `All ${lines.length} lines add up from the opening to the closing balance.`
              : `The lines are ${money(check.abs(), currency)} ${check.isPositive() ? "over" : "short of"} the closing balance. A line may have been missed or misread; compare with the statement.`}
          </p>
        ) : null}
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

function TransactionsSection({
  rows,
  disabled,
  onDecision,
  onCategory,
}: {
  rows: RowOf<"transaction">[];
  disabled: boolean;
  onDecision: (ids: string[], decision: "accept" | "skip") => void;
  onCategory: (rowId: string, categoryId: string | null) => void;
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
            const skipped = r.decision !== "accept";
            return (
              <li
                key={r.id}
                className={cn(
                  "border-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border-b px-1 py-3 last:border-b-0 sm:grid-cols-[auto_4.5rem_minmax(0,1fr)_12rem_auto] sm:items-center",
                  skipped && "opacity-50",
                )}
              >
                <span className="pt-0.5 sm:pt-0">
                  <RowControl
                    row={r}
                    checked={!skipped}
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
                    {r.data.originalAmount && r.data.originalCurrency
                      ? ` · ${money(r.data.originalAmount, r.data.originalCurrency)}`
                      : null}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.data.isTransfer ? <Tag>Transfer</Tag> : null}
                    <MatchTag status={r.matchStatus} />
                  </span>
                  <span className="mt-2 block sm:hidden">
                    <CategoryPicker
                      row={r}
                      categories={ordered}
                      disabled={disabled}
                      onCategory={onCategory}
                    />
                  </span>
                </span>
                <span className="hidden sm:block">
                  <CategoryPicker
                    row={r}
                    categories={ordered}
                    disabled={disabled}
                    onCategory={onCategory}
                  />
                </span>
                <span
                  className={cn(
                    "figures text-right font-mono text-[13px] font-semibold",
                    amount.isPositive() && "text-gain",
                  )}
                >
                  {money(r.data.amount, r.data.currency, true)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function CategoryPicker({
  row,
  categories,
  disabled,
  onCategory,
}: {
  row: RowOf<"transaction">;
  categories: RouterOutputs["catalog"]["categories"];
  disabled: boolean;
  onCategory: (rowId: string, categoryId: string | null) => void;
}) {
  if (row.data.isTransfer) return null;
  return (
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
              {money(r.data.amount, r.data.currency)}
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
                {money(r.data.amount, r.data.currency)}
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
              r.decision !== "accept" && "opacity-50",
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
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="mt-1 flex gap-1">
                <MatchTag status={r.matchStatus} />
              </span>
            </span>
            <span
              className={cn(
                "figures text-right font-mono text-[13px] font-semibold",
                new Decimal(r.data.amount).isPositive() && "text-gain",
              )}
            >
              {money(r.data.amount, r.data.currency, true)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
