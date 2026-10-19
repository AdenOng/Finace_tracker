import Decimal from "decimal.js";
import { z } from "zod";

const rateSchema = z.object({
  date: z.iso.date(),
  base: z.string().regex(/^[A-Z]{3}$/),
  quote: z.string().regex(/^[A-Z]{3}$/),
  rate: z.number().positive().finite(),
});

export type ExchangeRate = {
  date: string;
  base: string;
  quote: string;
  rate: string;
  source: string;
};

/** Daily reference rates. Only the display currency is sent to the provider. */
export class ExchangeRateClient {
  private cache = new Map<
    string,
    { expires: number; rows: ExchangeRate[]; pending?: Promise<ExchangeRate[]> }
  >();

  constructor(
    private request: (
      url: string,
      init: RequestInit,
    ) => Promise<Response> = fetch,
    private now: () => number = Date.now,
  ) {}

  async latest(base: string): Promise<ExchangeRate[]> {
    if (!/^[A-Z]{3}$/.test(base)) return [];
    const cached = this.cache.get(base);
    if (cached?.pending) return cached.pending;
    if (cached && cached.expires > this.now()) return cached.rows;

    const entry = { expires: 0, rows: cached?.rows ?? [] } as {
      expires: number;
      rows: ExchangeRate[];
      pending?: Promise<ExchangeRate[]>;
    };
    this.cache.set(base, entry);
    entry.pending = (async () => {
      try {
        const response = await this.request(
          `https://api.frankfurter.dev/v2/rates?base=${base}`,
          { signal: AbortSignal.timeout(6000), cache: "no-store" },
        );
        if (!response.ok) throw new Error("Exchange rates unavailable");
        const rows = z
          .array(rateSchema)
          .max(1000)
          .parse(await response.json());
        const today = new Date(this.now()).toISOString().slice(0, 10);
        if (rows.some((r) => r.base !== base || r.date > today)) {
          throw new Error("Invalid exchange rates");
        }
        entry.rows = rows.map((r) => ({
          ...r,
          rate: new Decimal(r.rate).toDecimalPlaces(10).toFixed(),
          source: "frankfurter",
        }));
        entry.expires = this.now() + 60 * 60 * 1000;
      } catch {
        // Keep the last successful response; the database provides a durable fallback.
        entry.expires = this.now() + 60 * 1000;
      } finally {
        delete entry.pending;
      }
      return entry.rows;
    })();
    return entry.pending;
  }
}

export const exchangeRates = new ExchangeRateClient();
