import Decimal from "decimal.js";

import type { Locale } from "~/i18n/config";
import type { Messages } from "~/i18n/messages";
import { formatDate, formatMoney } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

export type Job = RouterOutputs["imports"]["get"];
export type Row = Job["rows"][number];
export type RowOf<K extends Row["kind"]> = Extract<Row, { kind: K }>;

export const documentLabels = (t: Messages): Record<string, string> => ({
  bank_statement: t.imports.importReview.bankStatement,
  card_statement: t.imports.importReview.cardStatement,
  brokerage_statement: t.imports.importReview.brokerageStatement,
  trade_confirmation: t.imports.importReview.tradeConfirmation,
  screenshot: t.imports.importReview.screenshot,
  other: t.imports.importReview.document,
});

export const activityLabels = (t: Messages): Record<string, string> => ({
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
export const shortDate = (iso: string, locale: Locale) =>
  formatDate(iso, locale).replace(locale === "zh" ? /^\d{4}年/ : / \d{4}$/, "");

export const money = (
  amount: string | number | Decimal,
  currency: string,
  signed = false,
) => formatMoney(new Decimal(amount).toFixed(2), currency, { signed });
