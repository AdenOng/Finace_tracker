import Decimal from "decimal.js";

/**
 * Pure valuation helpers. Every amount stays a decimal string in its own currency; conversion to
 * the display currency happens last, and amounts without a known FX rate are reported separately
 * instead of being silently dropped or guessed.
 */

export type Amount = { amount: string; currency: string };

/** Money columns hold four decimal places. */
const toMoney = (value: Decimal) => value.toDecimalPlaces(4).toFixed();

export function valuePosition(input: {
  quantity: string;
  currency: string;
  statementPrice: string | null;
  statementValue: string | null;
  quote: { price: string; currency: string } | null;
}): Amount | null {
  const quantity = new Decimal(input.quantity);
  if (input.quote) {
    return {
      amount: toMoney(quantity.times(input.quote.price)),
      currency: input.quote.currency,
    };
  }
  if (input.statementValue !== null) {
    return { amount: input.statementValue, currency: input.currency };
  }
  if (input.statementPrice !== null) {
    return {
      amount: toMoney(quantity.times(input.statementPrice)),
      currency: input.currency,
    };
  }
  return null;
}

/** The per-unit price a statement recorded, from its price or its value. */
export function statementUnitPrice(input: {
  quantity: string;
  statementPrice: string | null;
  statementValue: string | null;
}): string | null {
  if (input.statementPrice !== null) return input.statementPrice;
  const quantity = new Decimal(input.quantity);
  if (input.statementValue === null || quantity.isZero()) return null;
  return new Decimal(input.statementValue).dividedBy(quantity).toFixed();
}

/**
 * Whether a market price is believable next to the recorded one. Ten times either way is far
 * beyond normal moves between statements; it nearly always means the symbol matched a different
 * instrument, such as Bitcoin entered as a stock picking up the "BTC" ETF.
 */
export function plausibleQuote(quote: string, recorded: string | null) {
  if (recorded === null) return true;
  const reference = new Decimal(recorded).abs();
  if (reference.isZero()) return true;
  const ratio = new Decimal(quote).dividedBy(reference);
  return ratio.lessThanOrEqualTo(10) && ratio.greaterThanOrEqualTo(0.1);
}

export function multiply(a: string, b: string) {
  return toMoney(new Decimal(a).times(b));
}

/** Sums amounts per currency, ordered by currency code. */
export function sumByCurrency(amounts: Amount[]): Amount[] {
  const totals = new Map<string, Decimal>();
  for (const { amount, currency } of amounts) {
    totals.set(currency, (totals.get(currency) ?? new Decimal(0)).plus(amount));
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: toMoney(amount) }));
}

/**
 * Converts to `target` using `rates` (currency → units of `target` per unit). Returns the converted
 * total, or null when nothing could be converted, plus whatever had no rate.
 */
export function convertAmounts(
  amounts: Amount[],
  target: string,
  rates: ReadonlyMap<string, string>,
): { total: string | null; unconverted: Amount[] } {
  let total: Decimal | null = null;
  const unconverted: Amount[] = [];
  for (const { amount, currency } of sumByCurrency(amounts)) {
    if (new Decimal(amount).isZero()) {
      total ??= new Decimal(0);
      continue;
    }
    const rate = currency === target ? "1" : rates.get(currency);
    if (rate === undefined) {
      unconverted.push({ amount, currency });
      continue;
    }
    total = (total ?? new Decimal(0)).plus(new Decimal(amount).times(rate));
  }
  return { total: total ? toMoney(total) : null, unconverted };
}

/**
 * Picks the most recent rate per currency from rows in either direction (X→target or target→X).
 */
export function ratesFromRows(
  rows: { date: string; base: string; quote: string; rate: string }[],
  target: string,
): Map<string, string> {
  const best = new Map<string, { date: string; rate: Decimal }>();
  for (const row of rows) {
    const direct = row.quote === target;
    if (!direct && row.base !== target) continue;
    const rate = new Decimal(row.rate);
    if (!rate.isFinite() || rate.lessThanOrEqualTo(0)) continue;
    const currency = direct ? row.base : row.quote;
    const current = best.get(currency);
    if (!current || row.date > current.date) {
      best.set(currency, {
        date: row.date,
        rate: direct ? rate : new Decimal(1).dividedBy(rate),
      });
    }
  }
  return new Map([...best].map(([c, { rate }]) => [c, rate.toFixed()]));
}
