"use client";

import { Tag } from "~/components/ui/panel";
import { useLocale, useT } from "~/i18n/client";
import { isBalanceStale, STALE_BALANCE_DAYS } from "~/lib/balance-freshness";
import { formatDate } from "~/lib/format";

export function BalanceDate({ asOf }: { asOf: string | null }) {
  const t = useT();
  const locale = useLocale();
  if (!asOf) return <span>{t.common.balanceDate.notRecorded}</span>;
  const stale = isBalanceStale(asOf);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="figures">
        {t.common.balanceDate.asOf}{" "}
        <time dateTime={asOf}>{formatDate(asOf, locale)}</time>
      </span>
      {stale ? (
        <span title={t.common.balanceDate.staleTitle(STALE_BALANCE_DAYS)}>
          <Tag tone="warn">{t.common.balanceDate.stale}</Tag>
        </span>
      ) : null}
    </span>
  );
}
