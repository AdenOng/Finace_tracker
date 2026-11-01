import Decimal from "decimal.js";

export type SideRef = { kind: "transaction" | "investment"; id: string };
export type TransferSide = SideRef & {
  accountId: string;
  accountName: string;
  date: string;
  amount: string;
  currency: string;
  description: string;
  direction: "out" | "in";
};
export type TransferSuggestion = {
  outgoing: TransferSide;
  incoming: TransferSide;
  feeAmount: string | null;
  feeCurrency: string | null;
  fxRate: string | null;
  differenceRatio: string;
  days: number;
};

export function sideKey(side: SideRef) {
  return `${side.kind}:${side.id}`;
}

const DAY_MS = 86_400_000;
const MIN_MATCH_DAYS = -1;
const MAX_MATCH_DAYS = 5;

/** Latest FX is only an approximation for review, never evidence of a booked fee. */
export function candidateMatch(
  outgoing: TransferSide,
  incoming: TransferSide,
  rate?: string,
): TransferSuggestion | null {
  if (
    outgoing.direction !== "out" ||
    incoming.direction !== "in" ||
    outgoing.accountId === incoming.accountId
  )
    return null;
  const days = (Date.parse(incoming.date) - Date.parse(outgoing.date)) / DAY_MS;
  if (days < MIN_MATCH_DAYS || days > MAX_MATCH_DAYS) return null;
  const sent = new Decimal(outgoing.amount).abs();
  const received = new Decimal(incoming.amount).abs();
  if (sent.isZero() || received.isZero()) return null;
  const sameCurrency = outgoing.currency === incoming.currency;
  if (!sameCurrency && (!rate || !new Decimal(rate).gt(0))) return null;
  const expected = sameCurrency ? sent : sent.mul(rate!);
  const difference = expected.minus(received);
  const ratio = difference.abs().div(expected);
  if (sameCurrency) {
    if (
      difference.isNegative() ||
      difference.greaterThan(Decimal.min(sent.mul("0.01"), "10"))
    )
      return null;
  } else if (ratio.greaterThan("0.03")) return null;
  return {
    outgoing,
    incoming,
    feeAmount: sameCurrency && difference.gt(0) ? difference.toFixed(4) : null,
    feeCurrency: sameCurrency && difference.gt(0) ? outgoing.currency : null,
    fxRate: sameCurrency ? null : rate!,
    differenceRatio: ratio.toString(),
    days,
  };
}

/** Above these, a request stops matching rather than grow unboundedly with adversarial data. */
export const MAX_MATCH_SIDES = 10_000;
export const MAX_MATCH_WORK = 100_000;

/** Best amount fit wins globally before date distance, with stable IDs breaking ties. */
export function suggestTransfers(
  sides: TransferSide[],
  rates: ReadonlyMap<string, string> = new Map(),
) {
  return boundedTransferSuggestions(sides, rates, Infinity).suggestions;
}

/**
 * `suggestTransfers` with a budget on pairs examined. Over budget there are no suggestions at
 * all (`limited`), never a partial set: greedy one-to-one assignment over a subset of pairs
 * would quietly differ from the full result.
 */
export function boundedTransferSuggestions(
  sides: TransferSide[],
  rates: ReadonlyMap<string, string> = new Map(),
  maxWork = MAX_MATCH_WORK,
): { suggestions: TransferSuggestion[]; limited: boolean } {
  const limited = { suggestions: [], limited: true };
  if (Number.isFinite(maxWork) && sides.length > MAX_MATCH_SIDES)
    return limited;
  let work = 0;
  const charge = () => ++work > maxWork;
  const candidates: TransferSuggestion[] = [];
  // Partition once by currency and account so ineligible accounts never enter
  // the date search. Parse dates once, then binary-search each eligible bucket.
  const incomingByCurrency = new Map<
    string,
    Map<string, { side: TransferSide; date: number }[]>
  >();
  for (const side of sides) {
    if (side.direction !== "in") continue;
    let accounts = incomingByCurrency.get(side.currency);
    if (!accounts) {
      accounts = new Map<string, { side: TransferSide; date: number }[]>();
      incomingByCurrency.set(side.currency, accounts);
    }
    let bucket = accounts.get(side.accountId);
    if (!bucket) accounts.set(side.accountId, (bucket = []));
    bucket.push({ side, date: Date.parse(side.date) });
  }
  for (const accounts of incomingByCurrency.values())
    for (const bucket of accounts.values())
      bucket.sort((a, b) => a.date - b.date);

  for (const outgoing of sides) {
    if (outgoing.direction !== "out") continue;
    const date = Date.parse(outgoing.date);
    const from = date + MIN_MATCH_DAYS * DAY_MS;
    const through = date + MAX_MATCH_DAYS * DAY_MS;
    for (const [currency, accounts] of incomingByCurrency) {
      if (charge()) return limited;
      const rate = rates.get(`${outgoing.currency}:${currency}`);
      if (currency !== outgoing.currency && (!rate || !new Decimal(rate).gt(0)))
        continue;
      for (const [accountId, bucket] of accounts) {
        if (accountId === outgoing.accountId) continue;
        if (charge()) return limited;
        let low = 0;
        let high = bucket.length;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (bucket[mid]!.date < from) low = mid + 1;
          else high = mid;
        }
        for (let i = low; i < bucket.length; i++) {
          const incoming = bucket[i]!;
          if (incoming.date > through) break;
          if (charge()) return limited;
          const match = candidateMatch(outgoing, incoming.side, rate);
          if (match) candidates.push(match);
        }
      }
    }
  }
  candidates.sort(
    (a, b) =>
      new Decimal(a.differenceRatio).comparedTo(b.differenceRatio) ||
      Math.abs(a.days) - Math.abs(b.days) ||
      sideKey(a.outgoing).localeCompare(sideKey(b.outgoing)) ||
      sideKey(a.incoming).localeCompare(sideKey(b.incoming)),
  );
  const used = new Set<string>();
  const suggestions = candidates.filter((match) => {
    const keys = [sideKey(match.outgoing), sideKey(match.incoming)];
    if (keys.some((key) => used.has(key))) return false;
    keys.forEach((key) => used.add(key));
    return true;
  });
  return { suggestions, limited: false };
}
