import Decimal from "decimal.js";

import { currencies } from "~/presets/common/currencies";

/**
 * Explicit symbols (S$, US$, HK$…) so a multi-currency portfolio never shows an ambiguous "$".
 * Falls back to the ISO code for currencies outside the preset list.
 */
const symbols = new Map(currencies.map((c) => [c.code, c.symbol]));
const integerFormatter = new Intl.NumberFormat("en-SG", {
  maximumFractionDigits: 0,
});

function fractionDigits(currency: string) {
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

export function currencySymbol(currency: string) {
  return symbols.get(currency) ?? currency;
}

export function formatMoney(
  amount: number | string,
  currency: string,
  options: { signed?: boolean } = {},
) {
  const value = new Decimal(amount);
  if (!value.isFinite()) throw new RangeError("Money amounts must be finite");
  const digits = fractionDigits(currency);
  const [integer, fraction] = value.abs().toFixed(digits).split(".");
  const formatted =
    integerFormatter.format(BigInt(integer!)) +
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

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(value: Date | string) {
  return dateFormatter.format(
    typeof value === "string" ? new Date(value) : value,
  );
}
