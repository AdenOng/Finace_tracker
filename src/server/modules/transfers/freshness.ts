import Decimal from "decimal.js";

type TransferBalanceSide = {
  accountId: string;
  accountName: string;
  date: string;
  amount: string;
  currency: string;
};

export type ConfirmedBalanceTransfer = {
  id: string;
  outgoing: TransferBalanceSide;
  incoming: TransferBalanceSide;
};

/** A dated snapshot is an end-of-day balance: transactions posted on D are included on D. */
export function transferFreshnessWarnings(
  links: ConfirmedBalanceTransfer[],
  snapshots: ReadonlyMap<string, { asOf: string }>,
) {
  return links.flatMap((link) => {
    const outgoing = snapshots.get(link.outgoing.accountId);
    const incoming = snapshots.get(link.incoming.accountId);
    if (
      !outgoing ||
      !incoming ||
      link.outgoing.accountId === link.incoming.accountId
    )
      return [];
    const sent = outgoing.asOf >= link.outgoing.date;
    const received = incoming.asOf >= link.incoming.date;
    if (sent === received) return [];
    return [
      {
        id: link.id,
        kind: sent ? ("missing" as const) : ("double_counted" as const),
        outgoing: {
          ...link.outgoing,
          asOf: outgoing.asOf,
          amount: new Decimal(link.outgoing.amount).abs().toString(),
        },
        incoming: {
          ...link.incoming,
          asOf: incoming.asOf,
          amount: new Decimal(link.incoming.amount).abs().toString(),
        },
        staleAccountId: sent
          ? link.incoming.accountId
          : link.outgoing.accountId,
      },
    ];
  });
}

export type TransferFreshnessWarning = ReturnType<
  typeof transferFreshnessWarnings
>[number];
