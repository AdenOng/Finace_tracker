import Decimal from "decimal.js";

import {
  formatMoney,
  moneyPattern,
  normalizeDecimal,
} from "../../../src/lib/money";

export { fractionDigits, normalizeDecimal } from "../../../src/lib/money";

export function money(
  value: string | Decimal | null | undefined,
  currency = "",
  {
    hidden = false,
    signed = false,
  }: { hidden?: boolean; signed?: boolean } = {},
) {
  if (hidden) return "••••";
  if (value === null || value === undefined) return "—";
  return formatMoney(value, currency, { signed });
}

export function signedAmount(input: string, expense: boolean) {
  const cleaned = normalizeDecimal(input);
  if (cleaned.startsWith("-") || !moneyPattern.test(cleaned))
    throw new Error("Use a positive amount with up to four decimal places.");
  const amount = new Decimal(cleaned);
  if (!amount.gt(0)) throw new Error("Amount must be greater than zero.");
  return (expense ? amount.negated() : amount).toFixed();
}
