import { expect, test } from "bun:test";

import { isBalanceStale } from "../src/lib/balance-freshness";
import {
  type ConfirmedBalanceTransfer,
  transferFreshnessWarnings,
} from "../src/server/modules/transfers/freshness";

const transfer: ConfirmedBalanceTransfer = {
  id: "confirmed",
  outgoing: {
    accountId: "sender",
    accountName: "DBS",
    date: "2026-09-18",
    amount: "-2000.1234",
    currency: "SGD",
  },
  incoming: {
    accountId: "receiver",
    accountName: "OCBC",
    date: "2026-09-20",
    amount: "1490.5678",
    currency: "USD",
  },
};

test("balance freshness allows 45 calendar days, including across month and year boundaries", () => {
  expect(isBalanceStale("2026-08-31", "2026-10-15")).toBe(false);
  expect(isBalanceStale("2026-08-31", "2026-10-16")).toBe(true);
  expect(isBalanceStale("2025-12-01", "2026-01-15")).toBe(false);
  expect(isBalanceStale("2026-10-16", "2026-10-15")).toBe(false);
});

test("confirmed transfers compare each side's own posting date inclusively and retain precise native amounts", () => {
  const detect = (sender: string, receiver: string) =>
    transferFreshnessWarnings(
      [transfer],
      new Map([
        ["sender", { asOf: sender }],
        ["receiver", { asOf: receiver }],
      ]),
    );
  expect(detect("2026-09-18", "2026-09-19")).toEqual([
    {
      id: "confirmed",
      kind: "missing",
      outgoing: {
        ...transfer.outgoing,
        amount: "2000.1234",
        asOf: "2026-09-18",
      },
      incoming: { ...transfer.incoming, asOf: "2026-09-19" },
      staleAccountId: "receiver",
    },
  ]);
  expect(detect("2026-09-17", "2026-09-20")[0]).toMatchObject({
    kind: "double_counted",
    staleAccountId: "sender",
  });
  expect(detect("2026-09-18", "2026-09-20")).toEqual([]);
  expect(detect("2026-08-31", "2026-08-01")).toEqual([]);
  // The accounts can be equally dated and still straddle a transfer's settlement period.
  expect(detect("2026-09-19", "2026-09-19")[0]?.kind).toBe("missing");
});

test("transfers without both included snapshots cannot establish a freshness mismatch", () => {
  expect(transferFreshnessWarnings([transfer], new Map())).toEqual([]);
  expect(
    transferFreshnessWarnings(
      [transfer],
      new Map([["sender", { asOf: "2026-09-30" }]]),
    ),
  ).toEqual([]);
  expect(
    transferFreshnessWarnings(
      [
        {
          ...transfer,
          incoming: { ...transfer.incoming, accountId: "sender" },
        },
      ],
      new Map([["sender", { asOf: "2026-09-19" }]]),
    ),
  ).toEqual([]);
});
