import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "~/server/db";
import {
  financialAccount,
  investmentTransaction,
  transaction,
  transferLink,
} from "~/server/db/schema";
import { readableAccount, type AccessScope } from "~/server/lib/access";
import type { ConfirmedBalanceTransfer } from "./freshness";

/** Both complete sides must be visible and included; a private counterpart reveals nothing. */
export async function confirmedBalanceTransfers(
  db: Database,
  scope: AccessScope,
  accountIds: string[],
): Promise<ConfirmedBalanceTransfer[]> {
  if (accountIds.length < 2) return [];
  const outgoing = alias(transaction, "balance_outgoing");
  const incoming = alias(transaction, "balance_incoming");
  const outInvestment = alias(investmentTransaction, "balance_out_investment");
  const inInvestment = alias(investmentTransaction, "balance_in_investment");
  const sender = alias(financialAccount, "balance_sender");
  const receiver = alias(financialAccount, "balance_receiver");
  return db
    .select({
      id: transferLink.id,
      outgoing: {
        accountId: sender.id,
        accountName: sender.name,
        date: sql<string>`coalesce(${outgoing.postedDate}, ${outInvestment.tradeDate})::text`,
        amount: sql<string>`coalesce(${outgoing.amount}, ${outInvestment.amount})::text`,
        currency: sql<string>`coalesce(${outgoing.currency}, ${outInvestment.currency})`,
      },
      incoming: {
        accountId: receiver.id,
        accountName: receiver.name,
        date: sql<string>`coalesce(${incoming.postedDate}, ${inInvestment.tradeDate})::text`,
        amount: sql<string>`coalesce(${incoming.amount}, ${inInvestment.amount})::text`,
        currency: sql<string>`coalesce(${incoming.currency}, ${inInvestment.currency})`,
      },
    })
    .from(transferLink)
    .leftJoin(
      outgoing,
      and(
        eq(outgoing.id, transferLink.outgoingTransactionId),
        eq(outgoing.ownerId, transferLink.ownerId),
      ),
    )
    .leftJoin(
      incoming,
      and(
        eq(incoming.id, transferLink.incomingTransactionId),
        eq(incoming.ownerId, transferLink.ownerId),
      ),
    )
    .leftJoin(
      outInvestment,
      and(
        eq(outInvestment.id, transferLink.outgoingInvestmentId),
        eq(outInvestment.ownerId, transferLink.ownerId),
      ),
    )
    .leftJoin(
      inInvestment,
      and(
        eq(inInvestment.id, transferLink.incomingInvestmentId),
        eq(inInvestment.ownerId, transferLink.ownerId),
      ),
    )
    .innerJoin(
      sender,
      and(
        sql`${sender.id} = coalesce(${outgoing.accountId}, ${outInvestment.accountId})`,
        eq(sender.ownerId, transferLink.ownerId),
      ),
    )
    .innerJoin(
      receiver,
      and(
        sql`${receiver.id} = coalesce(${incoming.accountId}, ${inInvestment.accountId})`,
        eq(receiver.ownerId, transferLink.ownerId),
      ),
    )
    .where(
      and(
        readableAccount(scope, sender.ownerId, sender.id),
        readableAccount(scope, receiver.ownerId, receiver.id),
        inArray(sender.id, accountIds),
        inArray(receiver.id, accountIds),
      ),
    )
    .orderBy(transferLink.id);
}
