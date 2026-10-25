import { expect, test } from "bun:test";

import {
  QuoteClient,
  yahooSymbol,
} from "../src/server/modules/portfolio/quotes";
import {
  plausibleQuote,
  statementUnitPrice,
} from "../src/server/modules/portfolio/valuation";

const listing: Parameters<typeof yahooSymbol>[0] = {
  symbol: "D05",
  exchange: "XSES",
  assetClass: "stock",
  currency: "SGD",
  providerSymbols: {},
};

test("maps listings to Yahoo symbols and declines to guess for funds and unknown exchanges", () => {
  const cases: [Partial<typeof listing>, string | null][] = [
    [{}, "D05.SI"],
    [{ exchange: "" }, "D05.SI"],
    [{ symbol: "700", exchange: "XHKG", currency: "HKD" }, "0700.HK"],
    [{ symbol: "00005", exchange: "", currency: "HKD" }, "0005.HK"],
    [{ symbol: "BRK.B", exchange: "XNYS", currency: "USD" }, "BRK-B"],
    [{ symbol: "VWRA", exchange: "XLON", assetClass: "etf" }, "VWRA.L"],
    [
      { symbol: "BTC", exchange: "", assetClass: "crypto", currency: "SGD" },
      "BTC-USD",
    ],
    [{ symbol: "ETH-EUR", exchange: "", assetClass: "crypto" }, "ETH-EUR"],
    [{ assetClass: "fund" }, null],
    [{ exchange: "XMARS" }, null],
    [{ exchange: "", currency: "XAU" }, null],
    [{ symbol: "../../x" }, null],
    [
      { assetClass: "fund", providerSymbols: { yahoo: "0p0000xyz.si" } },
      "0P0000XYZ.SI",
    ],
  ];
  for (const [overrides, expected] of cases)
    expect(yahooSymbol({ ...listing, ...overrides })).toBe(expected);
});

const now = Date.parse("2026-10-20T08:00:00Z");
const chart = (meta: Record<string, unknown>) => ({
  chart: {
    result: [
      {
        meta: {
          currency: "SGD",
          regularMarketPrice: 74.55,
          chartPreviousClose: 74.45,
          regularMarketTime: Math.floor(now / 1000) - 60,
          gmtoffset: 28800,
          ...meta,
        },
      },
    ],
    error: null,
  },
});

test("parses quotes, converts pence to pounds, and caches then keeps the last good quote", async () => {
  let requests = 0;
  let clock = now;
  let fail = false;
  const client = new QuoteClient(
    async (url, init) => {
      requests++;
      expect(url).toBe(
        "https://query1.finance.yahoo.com/v8/finance/chart/D05.SI?range=1d&interval=1d",
      );
      expect(init.signal).toBeInstanceOf(AbortSignal);
      if (fail) throw new Error("offline");
      return Response.json(chart({}));
    },
    () => clock,
  );
  const [first, concurrent] = await Promise.all([
    client.quote("D05.SI"),
    client.quote("D05.SI"),
  ]);
  expect(first).toEqual({
    price: "74.55",
    previousClose: "74.45",
    currency: "SGD",
    quotedAt: new Date(Math.floor(now / 1000) * 1000 - 60_000),
    date: "2026-10-20",
    source: "yahoo",
  });
  expect(concurrent).toBe(first);
  expect(requests).toBe(1);
  clock += 10 * 60 * 1000 + 1;
  fail = true;
  expect(await client.quote("D05.SI")).toBe(first);
  expect(requests).toBe(2);

  const pence = new QuoteClient(
    async () =>
      Response.json(
        chart({ currency: "GBp", regularMarketPrice: 120.6, gmtoffset: 0 }),
      ),
    () => now,
  );
  expect(await pence.quote("VOD.L")).toMatchObject({
    price: "1.206",
    previousClose: "0.7445",
    currency: "GBP",
  });
});

test("rejects missing, malformed, non-positive and future-dated quotes", async () => {
  for (const body of [
    { chart: { result: null, error: { code: "Not Found" } } },
    chart({ regularMarketPrice: 0 }),
    chart({ regularMarketPrice: "74" }),
    chart({ currency: "S$" }),
    chart({ regularMarketTime: Math.floor(now / 1000) + 3600 }),
  ]) {
    const client = new QuoteClient(
      async () => Response.json(body),
      () => now,
    );
    expect(await client.quote("D05.SI")).toBeNull();
  }
  const down = new QuoteClient(
    async () => new Response(null, { status: 429 }),
    () => now,
  );
  expect(await down.quote("D05.SI")).toBeNull();
});

test("market prices more than ten times away from the statement are implausible", () => {
  expect(plausibleQuote("36.14", "80000")).toBe(false);
  expect(plausibleQuote("1.206", "120.6")).toBe(false);
  expect(plausibleQuote("74.55", "39.2")).toBe(true);
  expect(plausibleQuote("5", null)).toBe(true);
  expect(plausibleQuote("5", "0")).toBe(true);
  expect(
    statementUnitPrice({
      quantity: "4",
      statementPrice: null,
      statementValue: "10",
    }),
  ).toBe("2.5");
  expect(
    statementUnitPrice({
      quantity: "0",
      statementPrice: null,
      statementValue: "10",
    }),
  ).toBeNull();
});

test("parses daily closes in the exchange's time zone, skipping gaps, and caches failures", async () => {
  const day = (date: string) => Date.parse(`${date}T01:30:00Z`) / 1000;
  let requests = 0;
  const client = new QuoteClient(
    async (url) => {
      requests++;
      expect(url).toBe(
        `https://query1.finance.yahoo.com/v8/finance/chart/VOD.L?period1=${Date.parse("2025-10-20T00:00:00Z") / 1000}&period2=${now / 1000}&interval=1d`,
      );
      return Response.json({
        chart: {
          result: [
            {
              meta: { currency: "GBp", gmtoffset: 28800 },
              timestamp: [
                day("2026-10-15"),
                day("2026-10-16"),
                day("2026-10-19"),
              ],
              indicators: { quote: [{ close: [120.6, null, 118] }] },
            },
          ],
          error: null,
        },
      });
    },
    () => now,
  );
  expect(await client.closes("VOD.L", "2025-10-20")).toEqual({
    currency: "GBP",
    source: "yahoo",
    closes: [
      { date: "2026-10-15", close: "1.206" },
      { date: "2026-10-19", close: "1.18" },
    ],
  });
  await client.closes("VOD.L", "2025-10-20");
  expect(requests).toBe(1);

  const down = new QuoteClient(
    async () => {
      requests++;
      return new Response(null, { status: 503 });
    },
    () => now,
  );
  expect(await down.closes("VOD.L", "2025-10-20")).toBeNull();
  expect(await down.closes("VOD.L", "2025-10-20")).toBeNull();
  expect(requests).toBe(2);
});
