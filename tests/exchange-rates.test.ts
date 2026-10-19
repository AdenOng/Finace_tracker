import { expect, test } from "bun:test";

import { ExchangeRateClient } from "../src/server/modules/portfolio/exchange-rates";
import {
  convertAmounts,
  ratesFromRows,
} from "../src/server/modules/portfolio/valuation";

const row = { date: "2026-10-16", base: "SGD", quote: "USD", rate: 0.8 };
const initialTime = Date.parse("2026-10-19T00:00:00Z");

test("coalesces and caches FX requests, then keeps the last good rates during outages", async () => {
  let requests = 0;
  let now = initialTime;
  let fail = false;
  const client = new ExchangeRateClient(
    async (url, init) => {
      requests++;
      expect(url).toBe("https://api.frankfurter.dev/v2/rates?base=SGD");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      if (fail) throw new Error("offline");
      return Response.json([row]);
    },
    () => now,
  );
  const [first, concurrent] = await Promise.all([
    client.latest("SGD"),
    client.latest("SGD"),
  ]);
  expect(first).toEqual([{ ...row, rate: "0.8", source: "frankfurter" }]);
  expect(concurrent).toEqual(first);
  expect(await client.latest("SGD")).toEqual(first);
  expect(requests).toBe(1);
  now += 60 * 60 * 1000 + 1;
  fail = true;
  expect(await client.latest("SGD")).toEqual(first);
  expect(await client.latest("SGD")).toEqual(first);
  expect(requests).toBe(2);
  now += 60 * 1000 + 1;
  fail = false;
  expect(await client.latest("SGD")).toEqual(first);
  expect(requests).toBe(3);
});

test("rejects failed, malformed, negative, wrong-base and future-dated rate responses", async () => {
  for (const data of [
    [{ ...row, rate: 0 }],
    [{ ...row, rate: -1 }],
    [{ ...row, rate: "not a rate" }],
    [{ ...row, date: "2026-02-30" }],
    [{ ...row, date: "2026-10-20" }],
    [{ ...row, base: "USD" }],
    { error: "unavailable" },
  ]) {
    const client = new ExchangeRateClient(
      async () => Response.json(data),
      () => initialTime,
    );
    expect(await client.latest("SGD")).toEqual([]);
  }
  const client = new ExchangeRateClient(
    async () => new Response(null, { status: 503 }),
  );
  expect(await client.latest("SGD")).toEqual([]);
  expect(await client.latest("../../private")).toEqual([]);
});

test("zero foreign balances need no rate and invalid stored rates cannot reduce totals", () => {
  expect(
    convertAmounts(
      [
        { currency: "HKD", amount: "0" },
        { currency: "SGD", amount: "12.63" },
      ],
      "SGD",
      new Map(),
    ),
  ).toEqual({ total: "12.63", unconverted: [] });
  expect(
    ratesFromRows(
      [
        { ...row, base: "USD", quote: "SGD", rate: "-1" },
        { ...row, base: "USD", quote: "SGD", rate: "0" },
      ],
      "SGD",
    ).size,
  ).toBe(0);
});
