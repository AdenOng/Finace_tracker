"use client";

import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { InstitutionMark } from "~/components/accounts/institution-mark";
import { ImportStatus, isReading } from "~/components/imports/import-status";
import { ImportLineRemoval } from "~/components/imports/line-removal";
import { ReviewCommitBar } from "~/components/imports/review/commit-bar";
import { RowControls } from "~/components/imports/review/row-controls";
import { ActivitySection } from "./review/activity-section";
import { BalanceSection, HoldingsSection } from "./review/holdings-section";
import { TransactionsSection } from "./review/transactions-section";
import { Summary } from "~/components/imports/review/summary";
import type { Job, Row, RowOf } from "~/components/imports/review/types";
import { ReadGlyph } from "~/components/landing/glyphs";
import { Button } from "~/components/ui/button";
import { ConfirmButton } from "~/components/ui/confirm-button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Notice } from "~/components/ui/panel";
import { useFlash } from "~/components/ui/use-flash";
import { useLocale, useT } from "~/i18n/client";
import { accountGroupOf } from "~/lib/accounts";
import { cn } from "~/lib/cn";
import { todayIso } from "~/lib/dates";
import { errorMessage } from "~/lib/errors";
import { formatDate } from "~/lib/format";
import { checkImportBalance } from "~/lib/import-balance-check";
import { api } from "~/trpc/react";

export function ImportReview({
  id,
  initialJob,
}: {
  id: string;
  initialJob?: Job;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const utils = api.useUtils();
  const [job] = api.imports.get.useSuspenseQuery(
    { id },
    {
      ...(initialJob ? { initialData: initialJob } : {}),
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
  const flash = useFlash();
  const [removing, setRemoving] = useState<Row | null>(null);
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [acknowledgedCheck, setAcknowledgedCheck] = useState<string | null>(
    null,
  );
  const [commitBarHeight, setCommitBarHeight] = useState(0);
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
      const targetGroup = job.accountType
        ? accountGroupOf(job.accountType)
        : null;
      flash.success(
        t.imports.importReview.saved(counts),
        <Link
          href={
            targetGroup === "banking"
              ? `/spending?account=${job.accountId}`
              : `/accounts/${job.accountId}`
          }
          className="font-semibold underline underline-offset-4"
        >
          {targetGroup === "banking"
            ? t.imports.importReview.seeThemInSpending
            : t.imports.importReview.openTheAccount}
        </Link>,
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
      flash.success(t.imports.importReview.originalAccountRestoredItsImports);
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

  // Reserve enough bottom scroll space on mobile for the fixed commit bar (even when an error wraps)
  // above the fixed mobile bottom tab bar so the final section's controls are always reachable.
  const reviewBottomPadding =
    job.status === "needs_review" && commitBarHeight > 0
      ? commitBarHeight + 40
      : undefined;

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

      <FlashNotice
        flash={flash.flash}
        onDismiss={flash.clear}
        className="mb-4"
      />
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
            <ConfirmButton
              variant="ghost"
              onConfirm={() => discard.mutate({ jobId: id })}
              loading={discard.isPending}
            >
              <Trash2 className="size-4" />
              {t.imports.importReview.removeUpload}
            </ConfirmButton>
          </div>
          {retry.error ? (
            <Notice tone="error" className="mt-4">
              {errorMessage(retry.error)}
            </Notice>
          ) : null}
        </section>
      ) : (
        <div
          // On phones the commit bar is fixed above the tab bar, so leave room for its measured
          // height; on desktop it is sticky and in flow, so the usual gap is enough.
          className={cn(
            "space-y-4 lg:pb-24",
            reviewBottomPadding ? "pb-(--review-bar-space)" : "pb-44",
          )}
          style={
            reviewBottomPadding
              ? ({
                  "--review-bar-space": `${reviewBottomPadding}px`,
                } as CSSProperties)
              : undefined
          }
        >
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
            <ReviewCommitBar
              acceptedCount={accepted.length}
              totalCount={rows.length}
              undecidedCount={undecided.length}
              mismatchCount={mismatches.length}
              needsDate={needsDate}
              asOf={asOf}
              onAsOfChange={setAsOf}
              accountName={job.accountName}
              onDiscard={() => discard.mutate({ jobId: id })}
              discardPending={discard.isPending}
              onCommit={() =>
                commit.mutate({
                  jobId: id,
                  asOf,
                  acknowledgeBalanceMismatch: acknowledged,
                })
              }
              commitPending={commit.isPending}
              commitDisabled={
                accepted.length === 0 ||
                (balanceCheck.requiresAcknowledgment && !acknowledged) ||
                undecided.length > 0 ||
                !asOf ||
                update.isPending ||
                editingAmount !== null ||
                !job.accountId ||
                !!job.accountArchivedAt
              }
              commitError={commit.error}
              onHeightChange={setCommitBarHeight}
            />
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
          flash.success(t.imports.importReview.rowRemovedFromTheAccount);
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
