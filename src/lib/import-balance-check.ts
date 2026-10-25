import Decimal from "decimal.js";

import type { AccountType } from "~/lib/accounts";

type BalanceDirection = "owed" | "credit" | null;

export function statementBalance(
  type: AccountType,
  amount: number | string | null,
  direction: BalanceDirection | undefined,
) {
  if (amount === null) return null;
  const balance = new Decimal(amount).toDecimalPlaces(4);
  // Unmarked card totals conventionally mean debt. Other account types retain signed cash.
  return (
    type === "credit_card"
      ? direction === "credit"
        ? balance.abs()
        : balance.abs().negated()
      : balance
  ).toFixed();
}

export type BalanceSummary = {
  documentType: string;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | string | null;
  closingBalance: number | string | null;
  openingBalanceDirection?: BalanceDirection;
  closingBalanceDirection?: BalanceDirection;
};

export type RecordedTransaction = {
  amount: string;
  currency: string;
  postedDate: string;
};

type BalanceRow = {
  id: string;
  kind: string;
  decision: string;
  matchStatus: string;
  recorded?: boolean;
  recordedTransaction?: RecordedTransaction | null;
  data: {
    currency: string;
    amount?: string;
    openingBalance?: string | null;
    bucket?: string | null;
    description?: string | null;
    postedDate?: string;
  };
};

/** Compare statement evidence and the records kept, without mixing currencies or using floats. */
export function checkImportBalance({
  summary,
  accountType,
  accountCurrency,
  rows,
}: {
  summary: BalanceSummary | null;
  accountType: AccountType | null;
  accountCurrency: string | null;
  rows: readonly BalanceRow[];
}) {
  const currency = summary?.currency ?? accountCurrency ?? "SGD";
  const transactions = rows.filter((r) => r.kind === "transaction");
  const balances = rows.filter(
    (r) => r.kind === "cash_balance" && !r.data.bucket,
  );
  const primary = balances.find((r) => r.data.currency === currency);
  // Staged balances are already signed and may have been corrected during review.
  const openingBalance =
    primary?.data.openingBalance ??
    statementBalance(
      accountType ?? "other",
      summary?.openingBalance ?? null,
      summary?.openingBalanceDirection,
    );
  const closingBalance =
    summary?.closingBalance != null
      ? (primary?.data.amount ??
        statementBalance(
          accountType ?? "other",
          summary.closingBalance,
          summary.closingBalanceDirection,
        ))
      : null;
  const complete = Boolean(
    summary &&
    (summary.documentType === "bank_statement" ||
      summary.documentType === "card_statement") &&
    summary.periodStart &&
    summary.periodEnd &&
    openingBalance !== null &&
    closingBalance !== null,
  );
  const savedTransactions = transactions
    .flatMap((r) => {
      if (
        (r.decision === "skip" ||
          (r.decision === "accept" && r.matchStatus === "duplicate")) &&
        (r.recorded ?? r.matchStatus !== "new")
      ) {
        // Skipping a match does not apply staged corrections to the existing transaction.
        return [{ ...r, data: r.recordedTransaction ?? r.data }];
      }
      return r.decision === "accept" ? [r] : [];
    })
    .filter(
      (r) =>
        !r.data.postedDate ||
        ((!summary?.periodStart || r.data.postedDate >= summary.periodStart) &&
          (!summary?.periodEnd || r.data.postedDate <= summary.periodEnd)),
    );
  const currencies = [
    ...new Set([
      currency,
      ...transactions.map((r) => r.data.currency),
      ...savedTransactions.map((r) => r.data.currency),
      ...balances
        .filter((r) => r.data.openingBalance != null)
        .map((r) => r.data.currency),
    ]),
  ].map((code) => {
    const lines = transactions.filter((r) => r.data.currency === code);
    const balance = balances.find((r) => r.data.currency === code);
    const opening =
      code === currency
        ? openingBalance
        : (balance?.data.openingBalance ?? null);
    const closing =
      code === currency
        ? closingBalance
        : balance?.data.openingBalance != null
          ? (balance.data.amount ?? null)
          : null;
    const skipped = lines.filter(
      (r) => r.decision === "skip" && !(r.recorded ?? r.matchStatus !== "new"),
    );
    const sum = (values: typeof lines) =>
      values.reduce((total, r) => total.plus(r.data.amount!), new Decimal(0));
    const result = (total: Decimal) => {
      const difference =
        opening !== null && closing !== null
          ? new Decimal(opening).plus(total).minus(closing)
          : null;
      return {
        total: total.toFixed(),
        difference: difference?.toFixed() ?? null,
        balances: difference?.isZero() ?? null,
      };
    };
    const extraction = result(sum(lines));
    const saved = result(
      sum(savedTransactions.filter((r) => r.data.currency === code)),
    );
    const skippedTotal = sum(skipped);
    return {
      currency: code,
      lineCount: lines.length,
      openingBalance: opening,
      closingBalance: closing,
      extraction,
      saved,
      skippedRows: skipped.map((r) => ({
        id: r.id,
        description: r.data.description ?? "Transaction",
        postedDate: r.data.postedDate,
        amount: r.data.amount!,
      })),
      skippedTotal: skippedTotal.toFixed(),
      skippedExplainDifference:
        saved.difference !== null &&
        !new Decimal(saved.difference).isZero() &&
        new Decimal(saved.difference).plus(skippedTotal).isZero(),
    };
  });
  return {
    currency,
    openingBalance,
    closingBalance,
    complete,
    provisional: rows.some(
      (r) => r.matchStatus === "possible_duplicate" && r.decision === "pending",
    ),
    currencies,
    requiresAcknowledgment:
      complete &&
      currencies.some(
        (c) => c.extraction.balances === false || c.saved.balances === false,
      ),
  };
}
