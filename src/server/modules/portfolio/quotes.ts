import Decimal from "decimal.js";
import { z } from "zod";

import type { security } from "~/server/db/schema";

export type Quote = {
  price: string;
  previousClose: string | null;
  currency: string;
  /** When the market last traded, not when it was fetched. */
  quotedAt: Date;
  /** Trading day in the exchange's own time zone. */
  date: string;
  source: string;
};

type Listing = Pick<
  typeof security.$inferSelect,
  "symbol" | "exchange" | "assetClass" | "currency" | "providerSymbols"
>;

/** Yahoo listing suffix per exchange, by MIC and by the short names statements print. */
const suffixByExchange: Record<string, string> = {
  ...Object.fromEntries(
    [
      "XNAS",
      "XNGS",
      "XNMS",
      "XNCM",
      "XNYS",
      "XASE",
      "ARCX",
      "BATS",
      "NASDAQ",
      "NYSE",
      "AMEX",
      "US",
    ].map((code) => [code, ""]),
  ),
  XSES: ".SI",
  SGX: ".SI",
  SES: ".SI",
  XHKG: ".HK",
  HKEX: ".HK",
  SEHK: ".HK",
  HK: ".HK",
  XSHG: ".SS",
  SSE: ".SS",
  XSHE: ".SZ",
  SZSE: ".SZ",
  XLON: ".L",
  LSE: ".L",
  XTKS: ".T",
  TSE: ".T",
  XASX: ".AX",
  ASX: ".AX",
  XTSE: ".TO",
  TSX: ".TO",
  XKLS: ".KL",
  BURSA: ".KL",
  XKRX: ".KS",
  XNSE: ".NS",
  XBOM: ".BO",
  XETR: ".DE",
  XFRA: ".F",
  XPAR: ".PA",
  XAMS: ".AS",
  XSWX: ".SW",
  XIDX: ".JK",
  XBKK: ".BK",
};

/** Where a listing most likely trades when the statement left out the exchange. */
const suffixByCurrency: Record<string, string> = {
  USD: "",
  SGD: ".SI",
  HKD: ".HK",
  GBP: ".L",
  JPY: ".T",
  AUD: ".AX",
  CAD: ".TO",
  MYR: ".KL",
};

/**
 * The Yahoo symbol for a listing, or null when there is no safe guess. Funds, bonds and options
 * rarely have an exchange ticker, so they are only priced once an admin sets the symbol by hand.
 */
export function yahooSymbol(listing: Listing): string | null {
  const explicit = listing.providerSymbols.yahoo?.trim().toUpperCase();
  if (explicit)
    return /^[A-Z0-9^][A-Z0-9.^=-]{0,31}$/.test(explicit) ? explicit : null;
  const symbol = listing.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9./-]{0,19}$/.test(symbol)) return null;
  // Coins are the same asset everywhere and Yahoo lists few non-USD pairs (no SGD at all), so
  // they are priced in USD and converted like any other foreign amount.
  if (listing.assetClass === "crypto") {
    return symbol.includes("-") ? symbol : `${symbol}-USD`;
  }
  if (listing.assetClass !== "stock" && listing.assetClass !== "etf")
    return null;
  const suffix = listing.exchange
    ? suffixByExchange[listing.exchange]
    : suffixByCurrency[listing.currency];
  if (suffix === undefined) return null;
  if (suffix === ".HK" && /^\d+$/.test(symbol)) {
    return `${String(Number(symbol)).padStart(4, "0")}.HK`;
  }
  // Share classes: BRK.B and BRK/B are BRK-B on Yahoo.
  const base = suffix === "" ? symbol.replace(/[./]/g, "-") : symbol;
  return `${base}${suffix}`;
}

/** Some exchanges quote in a minor unit; Yahoo marks those with these codes. */
const minorUnits: Record<string, string> = {
  GBp: "GBP",
  GBX: "GBP",
  ZAc: "ZAR",
  ZAX: "ZAR",
  ILA: "ILS",
};

const positive = z.number().positive().finite();
const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string().regex(/^[A-Za-z]{3}$/),
            regularMarketPrice: positive,
            chartPreviousClose: positive.optional(),
            regularMarketTime: z.number().int().positive(),
            gmtoffset: z.number().int().default(0),
          }),
        }),
      )
      .length(1),
  }),
});

const toPrice = (value: Decimal) => value.toDecimalPlaces(8).toFixed();

/** Latest prices from Yahoo's public chart endpoint. Only ticker symbols are sent. */
export class QuoteClient {
  private cache = new Map<
    string,
    { expires: number; quote: Quote | null; pending?: Promise<Quote | null> }
  >();

  constructor(
    private request: (
      url: string,
      init: RequestInit,
    ) => Promise<Response> = fetch,
    private now: () => number = Date.now,
  ) {}

  /** `force` skips the ten-minute cache, e.g. for an admin's "refresh now". */
  async quote(
    symbol: string,
    options: { force?: boolean } = {},
  ): Promise<Quote | null> {
    const cached = this.cache.get(symbol);
    if (cached?.pending) return cached.pending;
    if (cached && !options.force && cached.expires > this.now())
      return cached.quote;

    const entry: {
      expires: number;
      quote: Quote | null;
      pending?: Promise<Quote | null>;
    } = { expires: 0, quote: cached?.quote ?? null };
    this.cache.set(symbol, entry);
    entry.pending = (async () => {
      try {
        const response = await this.request(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
          { signal: AbortSignal.timeout(6000), cache: "no-store" },
        );
        if (!response.ok) throw new Error("Quote unavailable");
        const [result] = chartSchema.parse(await response.json()).chart.result;
        const meta = result!.meta;
        const quotedAt = new Date(meta.regularMarketTime * 1000);
        if (quotedAt.getTime() > this.now() + 5 * 60 * 1000) {
          throw new Error("Quote is dated in the future");
        }
        const major = minorUnits[meta.currency];
        const scale = major ? 100 : 1;
        const convert = (value: number) =>
          toPrice(new Decimal(value).dividedBy(scale));
        entry.quote = {
          price: convert(meta.regularMarketPrice),
          previousClose:
            meta.chartPreviousClose === undefined
              ? null
              : convert(meta.chartPreviousClose),
          currency: major ?? meta.currency.toUpperCase(),
          quotedAt,
          date: new Date(quotedAt.getTime() + meta.gmtoffset * 1000)
            .toISOString()
            .slice(0, 10),
          source: "yahoo",
        };
        entry.expires = this.now() + 10 * 60 * 1000;
      } catch {
        // Keep the last good quote in memory; the stored quote is the durable fallback.
        entry.expires = this.now() + 60 * 1000;
      } finally {
        delete entry.pending;
      }
      return entry.quote;
    })();
    return entry.pending;
  }
}

export const quotes = new QuoteClient();
