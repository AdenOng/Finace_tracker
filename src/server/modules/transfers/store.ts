import Decimal from "decimal.js";
import { and, eq, inArray, ne, or } from "drizzle-orm";

import {
  financialAccount,
  investmentTransaction,
  transaction,
  transferExclusion,
  transferLink,
} from "~/server/db/schema";
import { readableBy, writableBy, type AccessScope } from "~/server/lib/access";
import type { FinanceDatabase } from "~/server/modules/spending/guards";
import { sideKey, type SideRef, type TransferSide } from "./matching";

export async function loadTransferSides(
  db: FinanceDatabase,
  scope: AccessScope,
  refs?: SideRef[],
): Promise<TransferSide[]> {
  const transactionIds = refs
    ?.filter((s) => s.kind === "transaction")
    .map((s) => s.id);
  const investmentIds = refs
    ?.filter((s) => s.kind === "investment")
    .map((s) => s.id);
  const [bank, investments] = await Promise.all([
    db
      .select({
        id: transaction.id,
        accountId: transaction.accountId,
        accountName: financialAccount.name,
        date: transaction.postedDate,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description,
      })
      .from(transaction)
      .innerJoin(
        financialAccount,
        eq(financialAccount.id, transaction.accountId),
      )
      .where(
        and(
          writableBy(scope, transaction.ownerId),
          writableBy(scope, financialAccount.ownerId),
          eq(transaction.isTransfer, true),
          ne(transaction.amount, "0"),
          transactionIds ? inArray(transaction.id, transactionIds) : undefined,
        ),
      ),
    db
      .select({
        id: investmentTransaction.id,
        accountId: investmentTransaction.accountId,
        accountName: financialAccount.name,
        date: investmentTransaction.tradeDate,
        amount: investmentTransaction.amount,
        currency: investmentTransaction.currency,
        description: investmentTransaction.description,
        type: investmentTransaction.type,
      })
      .from(investmentTransaction)
      .innerJoin(
        financialAccount,
        eq(financialAccount.id, investmentTransaction.accountId),
      )
      .where(
        and(
          writableBy(scope, investmentTransaction.ownerId),
          writableBy(scope, financialAccount.ownerId),
          inArray(investmentTransaction.type, [
            "deposit",
            "withdrawal",
            "transfer_in",
            "transfer_out",
          ]),
          ne(investmentTransaction.amount, "0"),
          investmentIds
            ? inArray(investmentTransaction.id, investmentIds)
            : undefined,
        ),
      ),
  ]);
  return [
    ...bank.map((s): TransferSide => ({
      ...s,
      kind: "transaction",
      direction: new Decimal(s.amount).isNegative() ? "out" : "in",
    })),
    ...investments.map(({ type, ...s }): TransferSide => ({
      ...s,
      kind: "investment",
      description: s.description ?? type,
      direction:
        type === "withdrawal" || type === "transfer_out" ? "out" : "in",
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || sideKey(a).localeCompare(sideKey(b)),
  );
}

export function linkSides(link: typeof transferLink.$inferSelect): SideRef[] {
  return [
    link.outgoingTransactionId
      ? { kind: "transaction", id: link.outgoingTransactionId }
      : { kind: "investment", id: link.outgoingInvestmentId! },
    link.incomingTransactionId
      ? { kind: "transaction", id: link.incomingTransactionId }
      : { kind: "investment", id: link.incomingInvestmentId! },
  ];
}

export async function transferDecisions(
  db: FinanceDatabase,
  scope: AccessScope,
) {
  const [links, exclusions] = await Promise.all([
    db
      .select()
      .from(transferLink)
      .where(readableBy(scope, transferLink.ownerId)),
    db
      .select()
      .from(transferExclusion)
      .where(readableBy(scope, transferExclusion.ownerId)),
  ]);
  const linked = new Set(links.flatMap((link) => linkSides(link).map(sideKey)));
  const excluded = new Set(
    exclusions.map((s) =>
      sideKey(
        s.transactionId
          ? { kind: "transaction", id: s.transactionId }
          : { kind: "investment", id: s.investmentTransactionId! },
      ),
    ),
  );
  return { links, linked, excluded };
}

/** Financial edits invalidate a prior review; deletions cascade through the foreign keys. */
export async function clearTransactionTransferReview(
  db: FinanceDatabase,
  scope: AccessScope,
  id: string,
) {
  await db
    .delete(transferLink)
    .where(
      and(
        writableBy(scope, transferLink.ownerId),
        or(
          eq(transferLink.outgoingTransactionId, id),
          eq(transferLink.incomingTransactionId, id),
        ),
      ),
    );
  await db
    .delete(transferExclusion)
    .where(
      and(
        writableBy(scope, transferExclusion.ownerId),
        eq(transferExclusion.transactionId, id),
      ),
    );
}
