import Link from "next/link";

import { Notice } from "~/components/ui/panel";
import { formatDate, formatMoney } from "~/lib/format";
import type { TransferFreshnessWarning } from "~/server/modules/transfers/freshness";

export function TransferFreshnessNotices({
  warnings,
  workspaceId,
}: {
  warnings: TransferFreshnessWarning[];
  workspaceId?: string;
}) {
  return warnings.map((warning) => {
    const { outgoing, incoming } = warning;
    const stale =
      warning.staleAccountId === outgoing.accountId ? outgoing : incoming;
    const fresh = stale === outgoing ? incoming : outgoing;
    return (
      <Notice key={warning.id} tone="warn" className="mt-4">
        Transfer from {outgoing.accountName} (
        <span className="sensitive">
          {formatMoney(outgoing.amount, outgoing.currency)}
        </span>{" "}
        on {formatDate(outgoing.date)}) to {incoming.accountName} (
        <span className="sensitive">
          {formatMoney(incoming.amount, incoming.currency)}
        </span>{" "}
        on {formatDate(incoming.date)}) is temporarily{" "}
        {warning.kind === "missing"
          ? "missing from net worth"
          : "counted twice in net worth"}
        : {fresh.accountName}&apos;s balance from {formatDate(fresh.asOf)}{" "}
        includes it, but {stale.accountName}&apos;s is from{" "}
        {formatDate(stale.asOf)}, before the transfer{" "}
        {stale === outgoing ? "left" : "reached"} it.{" "}
        <Link
          className="font-semibold underline underline-offset-4"
          href={
            workspaceId
              ? `/workspaces/${workspaceId}/accounts/${stale.accountId}`
              : `/accounts/${stale.accountId}`
          }
        >
          {workspaceId
            ? `Ask the owner to update ${stale.accountName}`
            : `Update ${stale.accountName}`}{" "}
          to fix
        </Link>
        .
      </Notice>
    );
  });
}
