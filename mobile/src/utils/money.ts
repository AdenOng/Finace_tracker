import Decimal from "decimal.js";
export function formatMoney(
  value: string | null | undefined,
  currency = "",
  hidden = false,
) {
  if (hidden) return "••••";
  if (value === null || value === undefined) return "Not valued";
  const fixed = new Decimal(value).toFixed(2);
  const [whole, fraction] = fixed.split(".");
  return `${currency} ${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`.trim();
}

/** Same explicit symbols as the web app, so a multi-currency view never shows a bare "$". */
const SYMBOLS: Record<string, string> = {
  SGD: "S$",
  USD: "US$",
  HKD: "HK$",
  CNY: "CN¥",
  MYR: "RM",
  JPY: "¥",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  NZD: "NZ$",
  CHF: "CHF",
  KRW: "₩",
  TWD: "NT$",
  INR: "₹",
  IDR: "Rp",
  THB: "฿",
  PHP: "₱",
};
const NO_MINOR_UNITS = new Set(["JPY", "KRW", "IDR"]);
/** Decimal places a currency is normally written with. */
export const fractionDigits = (currency: string) =>
  NO_MINOR_UNITS.has(currency) ? 0 : 2;

/**
 * Accept amounts as phones type them: "12,50" (decimal comma) and "1,234.50" (grouped).
 * Anything else is returned trimmed, for the caller's own validation to reject.
 */
export function normalizeDecimal(input: string) {
  const s = input.trim().replace(/[\s ]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return s.replaceAll(",", "");
  if (/^\d+,\d{1,4}$/.test(s)) return s.replace(",", ".");
  return s;
}

/**
 * Display money the way the web app does: "S$1,234.56", a true minus sign and an optional
 * "+" for gains. Works on decimal strings so large balances stay exact.
 */
export function money(
  value: string | Decimal | null | undefined,
  currency = "",
  { hidden = false, signed = false }: { hidden?: boolean; signed?: boolean } = {},
) {
  if (hidden) return "••••";
  if (value === null || value === undefined) return "—";
  const amount = new Decimal(value);
  const [whole, fraction] = amount
    .abs()
    .toFixed(NO_MINOR_UNITS.has(currency) ? 0 : 2)
    .split(".");
  const symbol = SYMBOLS[currency] ?? currency;
  const separator = /[A-Za-z]$/.test(symbol) ? " " : "";
  const sign =
    amount.isNegative() && !amount.isZero()
      ? "−"
      : signed && amount.isPositive() && !amount.isZero()
        ? "+"
        : "";
  return `${sign}${symbol}${separator}${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? "." + fraction : ""}`;
}

export function signedAmount(input: string, expense: boolean) {
  const cleaned = normalizeDecimal(input);
  if (!/^\d{1,16}(\.\d{1,4})?$/.test(cleaned))
    throw new Error("Use a positive amount with up to four decimal places.");
  const amount = new Decimal(cleaned);
  if (!amount.gt(0)) throw new Error("Amount must be greater than zero.");
  return (expense ? amount.negated() : amount).toFixed();
}
