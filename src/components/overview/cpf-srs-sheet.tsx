import Decimal from "decimal.js";
import { Lock } from "lucide-react";
import Link from "next/link";

import { AccountRow } from "~/components/overview/account-row";
import { PortfolioSettings } from "~/components/overview/portfolio-settings";
import { SheetHeader } from "~/components/overview/sheet-header";
import { type CpfBucket, cpfBucketLabels } from "~/lib/accounts";
import { formatMoney } from "~/lib/format";
import { cpfRates, srsCap, yearlyCpfInterest } from "~/lib/sg-retirement";
import type { RouterOutputs } from "~/trpc/react";

type Worth = RouterOutputs["portfolio"]["netWorth"];

/** One ink per sub-account; a balance not split by sub-account is hatched. */
const FILLS: Record<CpfBucket | "unsplit", string> = {
  oa: "var(--color-art-red)",
  sa: "var(--color-art-pink)",
  ma: "var(--color-art-mustard)",
  ra: "var(--color-art-cobalt)",
  unsplit:
    "repeating-linear-gradient(135deg, #2b261f 0 1.5px, transparent 1.5px 5px)",
};

/** Round S$ figures for caps and estimates, where cents would be false precision. */
const sgd = (value: Decimal | number) =>
  formatMoney(new Decimal(value).toFixed(0), "SGD").replace(/\.\d+$/, "");

const link =
  "font-semibold underline decoration-current/30 underline-offset-4 hover:decoration-current";

function ColumnHeader({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-ink/80 flex items-baseline justify-between border-b-2 pb-2">
      <p className="eyebrow">{label}</p>
      <p className="figures font-mono text-[13px] font-semibold">{value}</p>
    </div>
  );
}

/** CPF and SRS: money that counts toward the future but can't be spent today. */
export function CpfSrsSheet({ worth }: { worth: Worth }) {
  const currency = worth.currency;
  const cpfAccounts = worth.accounts.filter((a) => a.type === "cpf");
  const srsAccounts = worth.accounts.filter((a) => a.type === "srs");
  // Without CPF and SRS in the preset, only accounts that already exist are shown.
  const enabled = worth.cpfSrsEnabled;
  const sum = (accounts: typeof cpfAccounts) =>
    accounts.reduce(
      (total, a) => (a.total ? total.plus(a.total) : total),
      new Decimal(0),
    );
  const cpfTotal = sum(cpfAccounts);
  const srsTotal = sum(srsAccounts);
  const incomplete =
    worth.cpfSrs.unconverted.length > 0 ||
    [...cpfAccounts, ...srsAccounts].some((a) => a.unpriced > 0);

  const buckets = worth.cpf
    .filter((b) => b.total && new Decimal(b.total).isPositive())
    .map((b) => ({
      key: b.bucket ?? ("unsplit" as const),
      total: new Decimal(b.total!),
    }));
  const bucketSum = buckets.reduce((s, b) => s.plus(b.total), new Decimal(0));
  const split = buckets.some((b) => b.key !== "unsplit");
  const interest =
    split && currency === "SGD" && worth.cpf.every((b) => b.bucket)
      ? yearlyCpfInterest(
          new Map(buckets.map((b) => [b.key as CpfBucket, b.total])),
        )
      : null;

  const toppedUp = worth.srs ? new Decimal(worth.srs.toppedUp) : null;
  const room = toppedUp
    ? Decimal.max(new Decimal(srsCap).minus(toppedUp), 0)
    : null;

  return (
    <section id="cpf-srs" className="card min-w-0 scroll-mt-6 p-5 sm:p-8">
      <SheetHeader
        eyebrow="CPF & SRS · for later"
        title={formatMoney(worth.cpfSrs.total ?? 0, currency)}
        href="/accounts"
        linkLabel="Accounts"
        settings={
          <PortfolioSettings
            currency={currency}
            id="cpf-srs-currency"
            iconOnly
          />
        }
      />
      {incomplete ? (
        <p className="text-warn mt-4 text-sm">
          Partial total. Some holdings are missing a price or exchange rate.
        </p>
      ) : null}

      <div className="mt-6 grid items-start gap-x-10 gap-y-8 lg:grid-cols-2">
        {/* CPF */}
        {enabled || cpfAccounts.length > 0 ? (
          <div className="min-w-0">
            <ColumnHeader
              label="CPF"
              value={formatMoney(cpfTotal.toFixed(2), currency)}
            />
            {cpfAccounts.length === 0 ? (
              <p className="text-ink-2 mt-4 text-sm">
                Copy your Ordinary, Special and MediSave balances from the CPF
                app.{" "}
                <Link href="/accounts?add=cpf_srs" className={link}>
                  Add CPF
                </Link>
                .
              </p>
            ) : (
              <>
                {split ? (
                  <div className="mt-4">
                    <div
                      role="img"
                      aria-label={buckets
                        .map(
                          (b) =>
                            `${b.key === "unsplit" ? "Not split" : cpfBucketLabels[b.key]} ${b.total.div(bucketSum).times(100).toFixed(1)}%`,
                        )
                        .join(", ")}
                      className="flex h-4 gap-[2px]"
                    >
                      {buckets.map((b) => (
                        <span
                          key={b.key}
                          className="border-ink/25 min-w-[3px] border first:rounded-l-[4px] last:rounded-r-[4px]"
                          style={{
                            width: `${b.total.div(bucketSum).times(100).toFixed(2)}%`,
                            background: FILLS[b.key],
                          }}
                        />
                      ))}
                    </div>
                    <ul className="mt-3">
                      {buckets.map((b) => (
                        <li
                          key={b.key}
                          className="border-line flex items-center gap-2.5 border-b py-2 text-[13px]"
                        >
                          <span
                            className="border-ink/25 size-3 shrink-0 rounded-[3px] border"
                            style={{ background: FILLS[b.key] }}
                          />
                          <span className="flex-1">
                            {b.key === "unsplit" ? (
                              "Not split by account"
                            ) : (
                              <>
                                {cpfBucketLabels[b.key]}
                                <span className="text-ink-3">
                                  {" "}
                                  · {cpfRates[b.key] * 100}%
                                </span>
                              </>
                            )}
                          </span>
                          <span className="figures font-mono text-[12px]">
                            {formatMoney(b.total.toFixed(2), currency)}
                          </span>
                          <span className="figures text-ink-3 w-12 text-right font-mono text-[12px]">
                            {b.total.div(bucketSum).times(100).toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                    {interest ? (
                      <p className="text-ink-3 mt-2 text-[12px]">
                        About{" "}
                        <span className="text-gain figures font-mono">
                          {sgd(interest)}
                        </span>{" "}
                        a year in interest at today&apos;s rates, paid in
                        January.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <ul className="mt-2">
                  {cpfAccounts.map((a) => (
                    <AccountRow key={a.id} account={a} currency={currency} />
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {/* SRS */}
        {enabled || srsAccounts.length > 0 ? (
          <div className="min-w-0">
            <ColumnHeader
              label="SRS"
              value={formatMoney(srsTotal.toFixed(2), currency)}
            />
            {srsAccounts.length === 0 ? (
              <p className="text-ink-2 mt-4 text-sm">
                What you put into SRS comes off your taxable income, up to{" "}
                {sgd(srsCap)} a year.{" "}
                <Link href="/accounts?add=cpf_srs" className={link}>
                  Add an SRS account
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-2">
                {srsAccounts.map((a) => (
                  <AccountRow key={a.id} account={a} currency={currency} />
                ))}
              </ul>
            )}
            {worth.srs && toppedUp && room ? (
              <div className="border-line-2 rounded-card mt-5 border border-dashed px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="eyebrow">Put in {worth.srs.year}</p>
                  <p className="figures font-mono text-[13px] font-semibold">
                    {sgd(toppedUp)}{" "}
                    <span className="text-ink-3 font-normal">
                      / {sgd(srsCap)}
                    </span>
                  </p>
                </div>
                <span className="bg-wash mt-2.5 mb-2 block h-2.5 overflow-hidden rounded-r-[4px]">
                  <span
                    className="bg-ink/80 block h-full rounded-r-[4px]"
                    style={{
                      width: `${Decimal.min(toppedUp.div(srsCap).times(100), 100).toFixed(1)}%`,
                    }}
                  />
                </span>
                <p className="text-ink-3 text-[12px]">
                  {room.isZero()
                    ? `You've reached the ${sgd(srsCap)} cap for ${worth.srs.year}.`
                    : toppedUp.isZero()
                      ? `No top-ups recorded yet. Anything in by 31 Dec comes off next year's tax bill. Deposits show up here when you import an SRS statement.`
                      : `${sgd(room)} more by 31 Dec gets you the full tax relief.`}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-ink-3 mt-6 flex items-start gap-1.5 text-[12px]">
        <Lock aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          {worth.countCpfSrs
            ? "Counted in net worth."
            : "Not counted in net worth."}{" "}
          CPF opens up from 55; SRS can be withdrawn without penalty from your
          statutory retirement age.
          {enabled ? " Change this under the gear icon." : null}
        </span>
      </p>
    </section>
  );
}
