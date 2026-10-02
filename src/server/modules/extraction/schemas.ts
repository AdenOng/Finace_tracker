import { z } from "zod";

/**
 * Structured output contract for document extraction (the TypeScript equivalent of Pydantic
 * models). The same schema is sent to the LLM as JSON Schema and used to validate its answer.
 *
 * Built per request so `categoryKey` is an enum of the categories that are currently active in
 * the admin console — the model cannot invent categories.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("ISO date YYYY-MM-DD");

const currencyCode = z
  .string()
  .length(3)
  .describe("ISO 4217 currency code, e.g. SGD, USD, HKD");

export function buildStatementSchema(categoryKeys: [string, ...string[]]) {
  const transaction = z.object({
    date: isoDate.describe(
      "Transaction date (or posting date if only one is shown)",
    ),
    postedDate: isoDate.nullable(),
    description: z.string().describe("Line text exactly as printed"),
    merchant: z
      .string()
      .nullable()
      .describe("Clean merchant name, e.g. 'GRAB*A-12345 SINGAPORE' → 'Grab'"),
    amount: z
      .number()
      .describe(
        "Signed amount in the account currency: negative = money out, positive = money in",
      ),
    currency: currencyCode,
    originalAmount: z
      .number()
      .nullable()
      .describe("Foreign amount before conversion, if printed"),
    originalCurrency: currencyCode.nullable(),
    categoryKey: z.enum(categoryKeys).nullable(),
    isTransfer: z
      .boolean()
      .describe(
        "True for card bill payments and moves between the user's own accounts",
      ),
  });

  const position = z.object({
    symbol: z
      .string()
      .describe("Ticker or exchange code as printed, e.g. AAPL, 700, D05"),
    exchange: z
      .string()
      .nullable()
      .describe(
        "Exchange MIC if determinable: XNAS, XNYS, XHKG, XSES, XSHG, XSHE…",
      ),
    name: z.string().nullable(),
    assetClass: z.enum([
      "stock",
      "etf",
      "fund",
      "bond",
      "option",
      "crypto",
      "other",
    ]),
    quantity: z.number(),
    averageCost: z.number().nullable(),
    marketPrice: z.number().nullable(),
    marketValue: z.number().nullable(),
    currency: currencyCode,
  });

  const investmentTransaction = z.object({
    tradeDate: isoDate,
    settleDate: isoDate.nullable(),
    type: z.enum([
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
    ]),
    symbol: z.string().nullable(),
    quantity: z.number().nullable(),
    price: z.number().nullable(),
    amount: z.number().describe("Signed cash impact: negative = cash out"),
    fees: z.number().nullable(),
    currency: currencyCode,
    description: z.string().nullable(),
  });

  return z.object({
    documentType: z.enum([
      "bank_statement",
      "card_statement",
      "brokerage_statement",
      "trade_confirmation",
      "screenshot",
      "other",
    ]),
    institutionName: z.string().nullable(),
    accountName: z.string().nullable(),
    accountLast4: z
      .string()
      .nullable()
      .describe("Last 4 digits of the account/card number"),
    currency: currencyCode.describe("Main currency of the account"),
    periodStart: isoDate.nullable(),
    periodEnd: isoDate.nullable(),
    openingBalance: z.number().nullable(),
    closingBalance: z.number().nullable(),
    transactions: z.array(transaction),
    positions: z.array(position),
    cashBalances: z.array(
      z.object({ currency: currencyCode, amount: z.number() }),
    ),
    investmentTransactions: z.array(investmentTransaction),
    warnings: z
      .array(z.string())
      .describe("Anything unreadable, ambiguous or possibly missing"),
  });
}

export type StatementExtraction = z.infer<
  ReturnType<typeof buildStatementSchema>
>;
export type ExtractedTransaction = StatementExtraction["transactions"][number];
export type ExtractedPosition = StatementExtraction["positions"][number];
export type ExtractedInvestmentTransaction =
  StatementExtraction["investmentTransactions"][number];
