import Decimal from "decimal.js";
import Link from "next/link";

import { InstitutionMark } from "~/components/accounts/institution-mark";
import { BalanceDate } from "~/components/finance/balance-date";
import { accountTypeLabels } from "~/lib/accounts";
import { cn } from "~/lib/cn";
import { formatMoney } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

type WorthAccount = RouterOutputs["portfolio"]["netWorth"]["accounts"][number];

export function AccountRow({
  account,
  currency,
}: {
  account: WorthAccount;
  currency: string;
}) {
  const owed = account.total && new Decimal(account.total).isNegative();
  return (
    <li>
      <Link
        href={`/accounts/${account.id}`}
        className="group hover:bg-wash -mx-2 flex items-center gap-3.5 rounded-[8px] px-2 py-2.5 transition-colors"
      >
        <InstitutionMark
          institutionKey={account.institutionKey}
          name={account.institutionName ?? account.name}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold group-hover:underline group-hover:underline-offset-4">
            {account.name}
            {account.last4 ? (
              <span className="figures text-ink-3 ml-1.5 font-normal">
                ··{account.last4}
              </span>
            ) : null}
          </span>
          <span className="text-ink-3 block truncate text-[12px]">
            {[account.institutionName, accountTypeLabels[account.type]]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {account.asOf ? (
            <span className="text-ink-2 mt-1 block text-[12px]">
              <BalanceDate asOf={account.asOf} />
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          {!account.asOf ? (
            <span className="text-ink-3 text-[13px]">Not recorded</span>
          ) : account.unpriced > 0 && account.totals.length === 0 ? (
            <span className="text-warn text-[13px]">Awaiting prices</span>
          ) : account.unconverted.length > 0 ? (
            <span className="text-warn block text-[13px]">
              {account.total === null ? (
                "Rate unavailable"
              ) : (
                <span className="sensitive">
                  {formatMoney(account.total, currency)}
                </span>
              )}
              <span className="block text-[11px]">
                Partial · FX unavailable
              </span>
            </span>
          ) : (
            <span
              className={cn(
                "figures font-mono text-[14px] font-semibold",
                owed && "text-loss",
              )}
            >
              <span className="sensitive">
                {formatMoney(account.total ?? 0, currency)}
              </span>
            </span>
          )}
          {account.unpriced > 0 && account.totals.length > 0 ? (
            <span className="text-warn block text-[11px]">
              {account.unpriced} unpriced holding
              {account.unpriced === 1 ? "" : "s"}
            </span>
          ) : null}
          {owed ? (
            <span className="text-ink-3 block text-[11px]">owed</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
