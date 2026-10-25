import { describe, expect, test } from "bun:test";

import {
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
