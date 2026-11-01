import { describe, expect, test } from "bun:test";

import {
  boundedTransferSuggestions,
  candidateMatch,
  suggestTransfers,
  type TransferSide,
} from "../src/server/modules/transfers/matching";

const out: TransferSide = {
  kind: "transaction",
  id: "out",
  accountId: "bank",
  accountName: "Bank",
  direction: "out",
  amount: "-1000",
  currency: "SGD",
  date: "2026-10-03",
  description: "Transfer out",
};
const incoming: TransferSide = {
  ...out,
  kind: "investment",
  id: "in",
  accountId: "broker",
  accountName: "Broker",
  direction: "in",
  amount: "1000",
  date: "2026-10-05",
};

describe("transfer suggestions", () => {
  test("pairs every one of many identical transfers, and over budget suggests none rather than a partial set", () => {
    const sides = Array.from({ length: 6 }, (_, i) => [
      { ...out, id: `out-${i}` },
      { ...incoming, id: `in-${i}` },
    ]).flat();
    const full = boundedTransferSuggestions(sides);
    expect(full.limited).toBe(false);
    expect(full.suggestions).toHaveLength(6);
    expect(full.suggestions).toEqual(suggestTransfers(sides));
    expect(boundedTransferSuggestions(sides, new Map(), 10)).toEqual({
      suggestions: [],
      limited: true,
    });
  });
  test("allows different posting dates at both boundaries and requires opposite directions and accounts", () => {
    expect(candidateMatch(out, { ...incoming, date: "2026-10-02" })?.days).toBe(
      -1,
    );
    expect(candidateMatch(out, { ...incoming, date: "2026-10-08" })?.days).toBe(
      5,
    );
    for (const date of ["2026-10-01", "2026-10-09"])
      expect(candidateMatch(out, { ...incoming, date })).toBeNull();
    expect(
      candidateMatch(out, { ...incoming, accountId: out.accountId }),
    ).toBeNull();
    expect(candidateMatch(out, { ...incoming, direction: "out" })).toBeNull();
    expect(candidateMatch({ ...out, amount: "0" }, incoming)).toBeNull();
  });
  test("records a nonnegative same-currency fee within 1% capped at 10, using exact decimals", () => {
    expect(candidateMatch(out, { ...incoming, amount: "990" })?.feeAmount).toBe(
      "10.0000",
    );
    expect(candidateMatch(out, { ...incoming, amount: "989.9999" })).toBeNull();
    expect(
      candidateMatch(out, { ...incoming, amount: "1000.0001" }),
    ).toBeNull();
    expect(
      candidateMatch(
        { ...out, amount: "-10000" },
        { ...incoming, amount: "9989" },
      ),
    ).toBeNull();
    expect(
      candidateMatch(
        { ...out, amount: "-0.1" },
        { ...incoming, amount: "0.099" },
      )?.feeAmount,
    ).toBe("0.0010");
    expect(candidateMatch(out, incoming)?.feeAmount).toBeNull();
  });
  test("cross-currency uses approximate FX within 3%, never inferring an FX difference as a fee", () => {
    const usd = { ...incoming, currency: "USD", amount: "750" };
    expect(candidateMatch(out, usd)).toBeNull();
    expect(candidateMatch(out, usd, "0")).toBeNull();
    expect(candidateMatch(out, usd, "0.75")).toMatchObject({
      fxRate: "0.75",
      feeAmount: null,
    });
    expect(
      candidateMatch(out, { ...usd, amount: "727.5" }, "0.75"),
    ).not.toBeNull();
    expect(
      candidateMatch(out, { ...usd, amount: "772.5" }, "0.75"),
    ).not.toBeNull();
    expect(
      candidateMatch(out, { ...usd, amount: "727.4999" }, "0.75"),
    ).toBeNull();
  });
  test("best global amount fit reserves counterparts once, then date distance and IDs break ties deterministically", () => {
    const sides = [
      out,
      { ...out, id: "better", amount: "-999" },
      { ...incoming, amount: "999" },
    ];
    expect(suggestTransfers(sides)[0]?.outgoing.id).toBe("better");
    expect(suggestTransfers([...sides].reverse())).toEqual(
      suggestTransfers(sides),
    );
    const dated = [
      out,
      incoming,
      { ...out, id: "nearer", date: incoming.date },
    ];
    expect(suggestTransfers(dated)[0]?.outgoing.id).toBe("nearer");
    const fx = suggestTransfers(
      [out, { ...incoming, currency: "USD", amount: "750" }],
      new Map([["SGD:USD", "0.75"]]),
    );
    expect(fx).toHaveLength(1);
  });
});

test("windowed matching agrees with brute force across FX, accounts, ties and date boundaries", async () => {
  const { default: Decimal } = await import("decimal.js");
  const { sideKey } = await import("../src/server/modules/transfers/matching");
  const rates = new Map([
    ["SGD:USD", "0.75"],
    ["USD:SGD", "1.3333333333"],
  ]);
  const sides: TransferSide[] = [
    out,
    { ...out, id: "better", amount: "-999" },
    { ...out, id: "tie", amount: "-999" },
    { ...out, id: "usd-out", currency: "USD", amount: "-750" },
    { ...out, id: "eur-out", currency: "EUR" },
    { ...out, id: "zero", amount: "0" },
    incoming,
    { ...incoming, id: "fee", amount: "999" },
    { ...incoming, id: "same-account", accountId: out.accountId },
    { ...incoming, id: "before-window", date: "2026-10-01" },
    { ...incoming, id: "lower-bound", date: "2026-10-02" },
    { ...incoming, id: "upper-bound", date: "2026-10-08" },
    { ...incoming, id: "after-window", date: "2026-10-09" },
    { ...incoming, id: "usd-in", currency: "USD", amount: "750" },
    { ...incoming, id: "fx-bound", currency: "USD", amount: "727.5" },
    { ...incoming, id: "no-rate", currency: "GBP" },
    { ...incoming, id: "too-much-fee", amount: "989" },
    { ...incoming, id: "too-much-fx", currency: "USD", amount: "727.4999" },
  ];
  const candidates = sides
    .flatMap((outgoing) =>
      sides.flatMap((incoming) => {
        const match = candidateMatch(
          outgoing,
          incoming,
          rates.get(`${outgoing.currency}:${incoming.currency}`),
        );
        return match ? [match] : [];
      }),
    )
    .sort(
      (a, b) =>
        new Decimal(a.differenceRatio).comparedTo(b.differenceRatio) ||
        Math.abs(a.days) - Math.abs(b.days) ||
        sideKey(a.outgoing).localeCompare(sideKey(b.outgoing)) ||
        sideKey(a.incoming).localeCompare(sideKey(b.incoming)),
    );
  const used = new Set<string>();
  const expected = candidates.filter((match) => {
    const keys = [sideKey(match.outgoing), sideKey(match.incoming)];
    if (keys.some((key) => used.has(key))) return false;
    keys.forEach((key) => used.add(key));
    return true;
  });
  expect(suggestTransfers(sides, rates)).toEqual(expected);
  expect(suggestTransfers([...sides].reverse(), rates)).toEqual(expected);
});
