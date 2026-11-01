import { describe, expect, test } from "bun:test";
import {
  forecastBalance,
  matchesOccurrence,
  occurrenceDates,
  statementPaymentStatus,
} from "../src/lib/cash-flow";

describe("cash-flow calendar", () => {
  test("stops safely at the end of the supported ISO year range", () => {
    expect(
      occurrenceDates(
        { startDate: "9999-12-01", endDate: null, frequency: "monthly" },
        "9999-12-01",
        "9999-12-31",
      ),
    ).toEqual(["9999-12-01"]);
    expect(
      occurrenceDates(
        { startDate: "9999-12-01", endDate: null, frequency: "weekly" },
        "9999-12-29",
        "9999-12-31",
      ),
    ).toEqual(["9999-12-29"]);
  });
  test("anchors month ends and leap dates instead of drifting", () => {
    expect(
      occurrenceDates(
        { startDate: "2024-01-31", endDate: null, frequency: "monthly" },
        "2024-01-01",
        "2024-04-30",
      ),
    ).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);
    expect(
      occurrenceDates(
        { startDate: "2024-02-29", endDate: null, frequency: "yearly" },
        "2025-01-01",
        "2028-12-31",
      ),
    ).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
  test("bounds weekly dates and old schedules without iterating their full history", () => {
    expect(
      occurrenceDates(
        { startDate: "2000-01-01", endDate: "2026-01-17", frequency: "weekly" },
        "2026-01-01",
        "2026-02-01",
      ),
    ).toEqual(["2026-01-03", "2026-01-10", "2026-01-17"]);
    expect(
      occurrenceDates(
        { startDate: "2026-03-31", endDate: null, frequency: "monthly" },
        "2026-01-01",
        "2026-03-30",
      ),
    ).toEqual([]);
  });
  test("matching requires signed amount, account, currency and inclusive seven-day window", () => {
    const schedule = { accountId: "bank", amount: "-0.1", currency: "SGD" };
    const row = {
      id: "txn",
      accountId: "bank",
      amount: "-0.1000",
      currency: "SGD",
      description: "Bill",
      postedDate: "2026-01-08",
      isTransfer: false,
    };
    expect(matchesOccurrence(schedule, "2026-01-01", row)).toBe(true);
    for (const changes of [
      { amount: "0.1" },
      { currency: "USD" },
      { accountId: "other" },
      { isTransfer: true },
      { postedDate: "2026-01-09" },
    ])
      expect(
        matchesOccurrence(schedule, "2026-01-01", { ...row, ...changes }),
      ).toBe(false);
  });
});

describe("card statement payment status", () => {
  const bill = {
    bankAccountId: "bank",
    cardAccountId: "card",
    statementDate: "2026-01-01",
    dueDate: "2026-01-20",
    amountDue: "0.3",
    currency: "SGD",
  };
  const payment = {
    id: "one",
    bankAccountId: "bank",
    cardAccountId: "card",
    date: "2026-01-10",
    amount: "0.1",
    currency: "SGD",
  };
  test("tracks partial, overdue, exact decimal settlement and the actual payoff date", () => {
    expect(statementPaymentStatus(bill, [], "2026-01-20")).toMatchObject({
      status: "unpaid",
      remaining: "0.3",
    });
    expect(statementPaymentStatus(bill, [payment], "2026-01-20")).toMatchObject(
      { status: "partial", remaining: "0.2" },
    );
    expect(statementPaymentStatus(bill, [payment], "2026-01-21")).toMatchObject(
      { status: "overdue", remaining: "0.2" },
    );
    expect(
      statementPaymentStatus(
        bill,
        [
          payment,
          { ...payment, id: "two", amount: "0.2", date: "2026-01-21" },
          { ...payment, id: "three", amount: "5", date: "2026-01-22" },
        ],
        "2026-01-25",
      ),
    ).toMatchObject({
      status: "paid",
      remaining: "0",
      paidOn: "2026-01-21",
      paidLate: true,
    });
  });
  test("excludes other banks/cards, currencies, nonpositive amounts, future and closing-day credits", () => {
    expect(
      statementPaymentStatus(
        bill,
        [
          { ...payment, amount: "1" },
          { ...payment, id: "later", date: "2026-01-11" },
        ],
        "2026-01-20",
      ),
    ).toMatchObject({
      paid: "0.3",
      remaining: "0",
      paidOn: "2026-01-10",
      payments: [expect.objectContaining({ id: "one" })],
    });
    const ineligible = [
      { bankAccountId: "other" },
      { cardAccountId: "other" },
      { currency: "USD" },
      { amount: "-0.1" },
      { date: "2026-01-01" },
      { date: "2026-02-01" },
    ].map((changes, i) => ({ ...payment, ...changes, id: String(i) }));
    expect(
      statementPaymentStatus(bill, ineligible, "2026-01-20"),
    ).toMatchObject({ status: "unpaid", paid: "0", payments: [] });
    expect(
      statementPaymentStatus({ ...bill, amountDue: "0" }, [], "2026-01-20")
        .status,
    ).toBe("paid");
  });
});

test("forecast reserves overdue amounts today, retains exact money, and never invents a missing balance", () => {
  expect(
    forecastBalance(
      "9999999999999999.9999",
      [{ date: "2026-01-01", amount: "0.0002", name: "Precise income" }],
      "2026-01-01",
      0,
    )[0]?.balance,
  ).toBe("10000000000000000.0001");
  const events = [
    { date: "2025-12-31", name: "Overdue bill", amount: "-0.1" },
    { date: "2026-01-02", name: "Pay", amount: "0.2" },
    { date: "2026-01-04", name: "Outside", amount: "100" },
  ];
  expect(forecastBalance("0.3", events, "2026-01-01", 2)).toEqual([
    { date: "2026-01-01", change: "-0.1", balance: "0.2" },
    { date: "2026-01-02", change: "0.2", balance: "0.4" },
    { date: "2026-01-03", change: "0", balance: "0.4" },
  ]);
  expect(
    forecastBalance(null, events, "2026-01-01", 2).every(
      (p) => p.balance === null,
    ),
  ).toBe(true);
});
