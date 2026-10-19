import Decimal from "decimal.js";

import type { CpfBucket } from "~/lib/accounts";

/**
 * CPF interest rates per year. The CPF Board reviews them every quarter; the 4% floor on Special,
 * MediSave and Retirement and the 2.5% on Ordinary have held for years.
 */
export const cpfRates: Record<CpfBucket, number> = {
  oa: 0.025,
  sa: 0.04,
  ma: 0.04,
  ra: 0.04,
};

/**
 * A rough year of CPF interest on today's balances (SGD): base rates plus the extra 1% on the
 * first S$60,000 combined, of which at most S$20,000 can come from Ordinary. Leaves out the
 * further 1% paid from 55, and real interest is worked out on monthly balances.
 */
export function yearlyCpfInterest(balances: Map<CpfBucket, Decimal>) {
  const of = (b: CpfBucket) => Decimal.max(balances.get(b) ?? 0, 0);
  const base = (Object.keys(cpfRates) as CpfBucket[]).reduce(
    (sum, b) => sum.plus(of(b).times(cpfRates[b])),
    new Decimal(0),
  );
  const extra = Decimal.min(
    60_000,
    Decimal.min(of("oa"), 20_000).plus(of("sa")).plus(of("ma")).plus(of("ra")),
  ).times(0.01);
  return base.plus(extra);
}

/** Yearly SRS contribution cap for Singapore citizens and PRs (foreigners: S$35,700). */
export const srsCap = 15_300;
