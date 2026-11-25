import Decimal from "decimal.js";

import { currencies } from "../presets/common/currencies";

/**
 * Explicit symbols (S$, US$, HK$…) so a multi-currency portfolio never shows an ambiguous "$".
 * Falls back to the ISO code for currencies outside the preset list.
 */
const symbols = new Map(currencies.map((c) => [c.code, c.symbol]));
const presetMinorUnits = new Map(
  currencies.flatMap((c) =>
    c.minorUnits !== undefined ? [[c.code, c.minorUnits]] : [],
  ),
);

export function fractionDigits(currency: string) {
  const configured = presetMinorUnits.get(currency);
  if (configured !== undefined) return configured;
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Accept amounts as phones and keyboards type them: "12,50" (decimal comma) and "1,234.50"
 * (grouped). Anything else is returned trimmed for the caller's own validation.
 */
export function normalizeDecimal(input: string) {
  const s = input.trim().replace(/\s/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return s.replaceAll(",", "");
  if (/^-?\d+,\d{1,4}$/.test(s)) return s.replace(",", ".");
  return s;
}

export function currencySymbol(currency: string) {
  return symbols.get(currency) ?? currency;
}

export function formatMoney(
  amount: Decimal.Value,
  currency = "",
  options: { signed?: boolean } = {},
) {
  const value = new Decimal(amount);
  if (!value.isFinite()) throw new RangeError("Money amounts must be finite");
  const digits = fractionDigits(currency);
  const [integer, fraction] = value.abs().toFixed(digits).split(".");
  const formatted =
    integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (fraction ? `.${fraction}` : "");
  const symbol = currencySymbol(currency);
  const separator = /[A-Za-z]$/.test(symbol) ? " " : "";
  const sign =
    value.isNegative() && !value.isZero()
      ? "−"
      : options.signed && value.isPositive() && !value.isZero()
        ? "+"
        : "";
  return `${sign}${symbol}${separator}${formatted}`;
}

/** The precision of NUMERIC(20, 4) ledger amounts. */
export const moneyPattern = /^-?\d{1,16}(\.\d{1,4})?$/;
