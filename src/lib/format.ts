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

/** Share counts and other quantities: grouped, with as many decimals as recorded. */
export function formatQuantity(quantity: string) {
  const value = new Decimal(quantity);
  const [integer, fraction] = value.abs().toFixed().split(".");
  return (
    (value.isNegative() && !value.isZero() ? "−" : "") +
    integerFormatter.format(BigInt(integer!)) +
    (fraction ? `.${fraction}` : "")
  );
}

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const calendarDateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Dates and timestamps; a bare YYYY-MM-DD is a calendar day and never shifts with the time zone. */
export function formatDate(value: Date | string) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return calendarDateFormatter.format(new Date(`${value}T00:00:00Z`));
  }
  return dateFormatter.format(
    typeof value === "string" ? new Date(value) : value,
  );
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Timestamps where the time of day matters, e.g. audit entries and sessions. */
export function formatDateTime(value: Date | string) {
  return dateTimeFormatter.format(
    typeof value === "string" ? new Date(value) : value,
  );
}

const monthFormatter = new Intl.DateTimeFormat("en-SG", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-10" → "October 2026" */
export function formatMonth(month: string) {
  return monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
}

const byteUnits = ["B", "KB", "MB", "GB", "TB"];

/** File and database sizes: "12.4 MB". */
export function formatBytes(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${byteUnits[unit]}`;
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

/** "5 minutes ago", "yesterday", "in 3 days". */
export function formatRelative(value: Date | string, now = Date.now()) {
  const seconds = Math.round(
    ((typeof value === "string" ? new Date(value) : value).getTime() - now) /
      1000,
  );
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
  ];
  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return relativeFormatter.format(amount, unit);
    amount = Math.round(amount / size);
  }
  return relativeFormatter.format(amount, "year");
}
