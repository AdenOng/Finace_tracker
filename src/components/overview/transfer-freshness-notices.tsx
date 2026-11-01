"use client";
import { useT, useLocale } from "~/i18n/client";
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
  const t = useT();
  const locale = useLocale();
  return warnings.map((warning) => {
    const { outgoing, incoming } = warning;
    const stale =
      warning.staleAccountId === outgoing.accountId ? outgoing : incoming;
    const fresh = stale === outgoing ? incoming : outgoing;
    return (
      <Notice key={warning.id} tone="warn" className="mt-4">
        {t.overview.transferFreshnessNotices.from(outgoing.accountName)}
        <span className="sensitive">
          {formatMoney(outgoing.amount, outgoing.currency)}
        </span>{" "}
        {t.overview.transferFreshnessNotices.to(
          formatDate(outgoing.date, locale),
          incoming.accountName,
        )}
        <span className="sensitive">
          {formatMoney(incoming.amount, incoming.currency)}
        </span>{" "}
        {t.overview.transferFreshnessNotices.explanation(
          formatDate(incoming.date, locale),
          warning.kind === "missing",
          fresh.accountName,
          formatDate(fresh.asOf, locale),
          stale.accountName,
          formatDate(stale.asOf, locale),
          stale === outgoing,
        )}{" "}
        <Link
          className="font-semibold underline underline-offset-4"
          href={
            workspaceId
              ? `/workspaces/${workspaceId}/accounts/${stale.accountId}`
              : `/accounts/${stale.accountId}`
          }
        >
          {t.overview.transferFreshnessNotices.update(
            stale.accountName,
            !!workspaceId,
          )}
        </Link>
        {t.overview.sentenceEnd}
      </Notice>
    );
  });
}
