import Decimal from "decimal.js";

import type { ExtractedTransaction } from "~/server/modules/extraction/schemas";
import { decimalString } from "./rows";

export function transactionEvidence(t: ExtractedTransaction) {
  const amount = new Decimal(decimalString(t.amount, 4));
  const printedAmount =
    t.printedAmount == null ? null : decimalString(t.printedAmount, 4);
  const magnitude = new Decimal(printedAmount ?? amount.abs());
  // Bank withdrawals and card charges are both outflows; CR includes card payments/refunds.
  const suggested =
    t.printedDirection === "debit"
      ? magnitude.negated()
      : t.printedDirection === "credit"
        ? magnitude
        : amount.isNegative()
          ? magnitude.negated()
          : magnitude;
  const signMismatch = !amount.equals(suggested);
  // Keep the extraction unchanged until the user chooses the suggestion or confirms an edit.
  return {
    printedDirection: t.printedDirection ?? null,
    printedAmount,
    signMismatch,
    suggestedAmount: signMismatch ? suggested.toFixed() : null,
  };
}

export { statementBalance } from "~/lib/import-balance-check";
