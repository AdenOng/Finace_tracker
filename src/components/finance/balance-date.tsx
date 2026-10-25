import { Tag } from "~/components/ui/panel";
import { isBalanceStale, STALE_BALANCE_DAYS } from "~/lib/balance-freshness";
import { formatDate } from "~/lib/format";

export function BalanceDate({ asOf }: { asOf: string | null }) {
  if (!asOf) return <span>Not recorded</span>;
  const stale = isBalanceStale(asOf);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="figures">
        As of <time dateTime={asOf}>{formatDate(asOf)}</time>
      </span>
      {stale ? (
        <span title={`Balance is more than ${STALE_BALANCE_DAYS} days old`}>
          <Tag tone="warn">Stale balance</Tag>
        </span>
      ) : null}
    </span>
  );
}
