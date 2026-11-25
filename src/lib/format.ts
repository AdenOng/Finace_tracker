import Decimal from "decimal.js";

import { defaultLocale, intlLocale, type Locale } from "~/i18n/config";

export {
  currencySymbol,
  formatMoney,
  fractionDigits,
  normalizeDecimal,
} from "./money";

const integerFormatter = new Intl.NumberFormat("en-SG", {
  maximumFractionDigits: 0,
});

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

/** One formatter per language, built on first use. */
function perLocale<T>(make: (tag: string) => T) {
  const made = new Map<Locale, T>();
  return (locale: Locale) => {
    let formatter = made.get(locale);
    if (!formatter) made.set(locale, (formatter = make(intlLocale[locale])));
    return formatter;
  };
}

const dateFormatter = perLocale(
  (tag) =>
    new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
);

const calendarDateFormatter = perLocale(
  (tag) =>
    new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
);

/**
 * Dates and timestamps; a bare YYYY-MM-DD is a calendar day and never shifts with the time zone.
 * Pass the reader's locale (`useLocale()` or `getLocale()`) for "2026年10月29日" in Chinese.
 */
export function formatDate(
  value: Date | string,
  locale: Locale = defaultLocale,
) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return calendarDateFormatter(locale).format(new Date(`${value}T00:00:00Z`));
  }
  return dateFormatter(locale).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

const dateTimeFormatter = perLocale(
  (tag) =>
    new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
);

/** Timestamps where the time of day matters, e.g. audit entries and sessions. */
export function formatDateTime(
  value: Date | string,
  locale: Locale = defaultLocale,
) {
  return dateTimeFormatter(locale).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

const monthFormatter = perLocale(
  (tag) =>
    new Intl.DateTimeFormat(tag, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
);

/** "2026-10" → "October 2026" (or "2026年10月") */
export function formatMonth(month: string, locale: Locale = defaultLocale) {
  return monthFormatter(locale).format(new Date(`${month}-01T00:00:00Z`));
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

const relativeFormatter = perLocale(
  (tag) => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }),
);

/** "5 minutes ago", "yesterday", "in 3 days" (or "5分钟前", "昨天", "3天后"). */
export function formatRelative(
  value: Date | string,
  now: Date | number = Date.now(),
  locale: Locale = defaultLocale,
) {
  const seconds = Math.round(
    ((typeof value === "string" ? new Date(value) : value).getTime() -
      Number(now)) /
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
    if (Math.abs(amount) < size)
      return relativeFormatter(locale).format(amount, unit);
    amount = Math.round(amount / size);
  }
  return relativeFormatter(locale).format(amount, "year");
}
