import Decimal from "decimal.js";
import { z } from "zod";

import { assetClasses, cpfBuckets } from "~/lib/accounts";
import {
  currencyInput,
  isoDateInput,
  moneyInput,
  priceInput,
  quantityInput,
} from "~/server/api/inputs";

/**
 * Shapes of `staged_row.data` per kind. The LLM's numbers are converted to decimal strings when
 * staged, so review and commit never handle floats.
 */
const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const stagedTransaction = z.object({
  postedDate: isoDateInput,
  transactionDate: isoDateInput.nullable(),
  description: z.string().trim().min(1).max(500),
  reference: nullableText(200).default(null),
  merchant: nullableText(200),
  amount: moneyInput,
  printedDirection: z.enum(["debit", "credit"]).nullable().default(null),
  printedAmount: moneyInput
    .refine((v) => !v.startsWith("-"))
    .nullable()
    .default(null),
  signMismatch: z.boolean().default(false),
  suggestedAmount: moneyInput.nullable().default(null),
  currency: currencyInput,
  originalAmount: moneyInput.nullable(),
  originalCurrency: currencyInput.nullable(),
  categoryId: z.uuid().nullable(),
  isTransfer: z.boolean(),
});

export const stagedPosition = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(32),
  exchange: z.string().trim().toUpperCase().max(16),
  name: nullableText(200),
  assetClass: z.enum(assetClasses),
  currency: currencyInput,
  quantity: quantityInput,
  averageCost: priceInput.nullable(),
  price: priceInput.nullable(),
  value: moneyInput.nullable(),
});

export const stagedCashBalance = z.object({
  currency: currencyInput,
  amount: moneyInput,
  balanceDirection: z.enum(["owed", "credit"]).nullable().default(null),
  openingBalance: moneyInput.nullable().default(null),
  openingBalanceDirection: z.enum(["owed", "credit"]).nullable().default(null),
  /** CPF sub-account; rows staged before sub-accounts existed have none. */
  bucket: z.enum(cpfBuckets).nullable().default(null),
});

export const investmentTxnTypes = [
  "buy",
  "sell",
  "dividend",
  "interest",
  "fee",
  "tax",
  "deposit",
  "withdrawal",
  "transfer_in",
  "transfer_out",
  "split",
  "fx",
  "other",
] as const;

export const stagedInvestmentTransaction = z.object({
  reference: nullableText(200).default(null),
  tradeDate: isoDateInput,
  settleDate: isoDateInput.nullable(),
  type: z.enum(investmentTxnTypes),
  symbol: nullableText(32),
  quantity: quantityInput.nullable(),
  price: priceInput.nullable(),
  amount: moneyInput,
  fees: moneyInput.nullable(),
  currency: currencyInput,
  description: nullableText(500),
});

export const stagedSchemas = {
  transaction: stagedTransaction,
  position: stagedPosition,
  cash_balance: stagedCashBalance,
  investment_transaction: stagedInvestmentTransaction,
} as const;

export type StagedKind = keyof typeof stagedSchemas;
export type StagedTransaction = z.infer<typeof stagedTransaction>;
export type StagedPosition = z.infer<typeof stagedPosition>;
export type StagedCashBalance = z.infer<typeof stagedCashBalance>;
export type StagedInvestmentTransaction = z.infer<
  typeof stagedInvestmentTransaction
>;

/** A number from the model as a plain decimal string with at most `places` decimals. */
export function decimalString(value: number, places: number) {
  return new Decimal(value).toDecimalPlaces(places).toFixed();
}

export function optionalDecimal(value: number | null, places: number) {
  return value === null ? null : decimalString(value, places);
}
