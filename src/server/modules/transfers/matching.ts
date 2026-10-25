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
  const days =
    (Date.parse(incoming.date) - Date.parse(outgoing.date)) / 86_400_000;
  if (days < -1 || days > 5) return null;
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

/** Best amount fit wins globally before date distance, with stable IDs breaking ties. */
export function suggestTransfers(
  sides: TransferSide[],
  rates: ReadonlyMap<string, string> = new Map(),
) {
  const candidates: TransferSuggestion[] = [];
  for (const outgoing of sides.filter((s) => s.direction === "out")) {
    for (const incoming of sides.filter((s) => s.direction === "in")) {
      const match = candidateMatch(
        outgoing,
        incoming,
        rates.get(`${outgoing.currency}:${incoming.currency}`),
      );
      if (match) candidates.push(match);
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
  return candidates.filter((match) => {
    const keys = [sideKey(match.outgoing), sideKey(match.incoming)];
    if (keys.some((key) => used.has(key))) return false;
    keys.forEach((key) => used.add(key));
    return true;
  });
}
