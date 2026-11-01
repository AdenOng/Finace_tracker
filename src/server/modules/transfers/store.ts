import Decimal from "decimal.js";
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";

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
  unreviewedOnly = false,
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
          unreviewedOnly
            ? and(
                notExists(
                  db
                    .select({ id: transferLink.id })
                    .from(transferLink)
                    .where(
                      and(
                        readableBy(scope, transferLink.ownerId),
                        or(
                          eq(
                            transferLink.outgoingTransactionId,
                            transaction.id,
                          ),
                          eq(
                            transferLink.incomingTransactionId,
                            transaction.id,
                          ),
                        ),
                      ),
                    ),
                ),
                notExists(
                  db
                    .select({ id: transferExclusion.id })
                    .from(transferExclusion)
                    .where(
                      and(
                        readableBy(scope, transferExclusion.ownerId),
                        eq(transferExclusion.transactionId, transaction.id),
                      ),
                    ),
                ),
              )
            : undefined,
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
          unreviewedOnly
            ? and(
                notExists(
                  db
                    .select({ id: transferLink.id })
                    .from(transferLink)
                    .where(
                      and(
                        readableBy(scope, transferLink.ownerId),
                        or(
                          eq(
                            transferLink.outgoingInvestmentId,
                            investmentTransaction.id,
                          ),
                          eq(
                            transferLink.incomingInvestmentId,
                            investmentTransaction.id,
                          ),
                        ),
                      ),
                    ),
                ),
                notExists(
                  db
                    .select({ id: transferExclusion.id })
                    .from(transferExclusion)
                    .where(
                      and(
                        readableBy(scope, transferExclusion.ownerId),
                        eq(
                          transferExclusion.investmentTransactionId,
                          investmentTransaction.id,
                        ),
                      ),
                    ),
                ),
              )
            : undefined,
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

/** Where each history list stopped: its last row's `created_at::text` and id. */
export type HistoryPosition = { createdAt: string; id: string };
/** `null` for a list means it is exhausted; no cursor at all means the first page. */
export type TransferHistoryCursor = {
  links: HistoryPosition | null;
  excluded: HistoryPosition | null;
};

/**
 * Each history collection is paged by its own keyset, newest review first, so reviews added or
 * removed between pages never shift the other rows into duplicates or gaps.
 */
export async function loadTransferHistory(
  db: FinanceDatabase,
  scope: AccessScope,
  limit: number,
  cursor?: TransferHistoryCursor | null,
) {
  const [linkRows, exclusionRows] = await Promise.all([
    cursor?.links === null
      ? []
      : db
          .select({
            ...getTableColumns(transferLink),
            position: sql<string>`${transferLink.createdAt}::text`,
          })
          .from(transferLink)
          .where(
            and(
              readableBy(scope, transferLink.ownerId),
              cursor?.links
                ? sql`(${transferLink.createdAt}, ${transferLink.id}) < (${cursor.links.createdAt}::timestamptz, ${cursor.links.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(desc(transferLink.createdAt), desc(transferLink.id))
          .limit(limit + 1),
    cursor?.excluded === null
      ? []
      : db
          .select({
            ...getTableColumns(transferExclusion),
            position: sql<string>`${transferExclusion.createdAt}::text`,
          })
          .from(transferExclusion)
          .where(
            and(
              readableBy(scope, transferExclusion.ownerId),
              cursor?.excluded
                ? sql`(${transferExclusion.createdAt}, ${transferExclusion.id}) < (${cursor.excluded.createdAt}::timestamptz, ${cursor.excluded.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(
            desc(transferExclusion.createdAt),
            desc(transferExclusion.id),
          )
          .limit(limit + 1),
  ]);
  const links = linkRows.slice(0, limit);
  const exclusions = exclusionRows.slice(0, limit);
  const moreLinks = linkRows.length > limit;
  const moreExcluded = exclusionRows.length > limit;
  // Positions come from the raw rows, even if a side can no longer be shown below.
  const at = (row: { position: string; id: string }): HistoryPosition => ({
    createdAt: row.position,
    id: row.id,
  });
  const nextCursor: TransferHistoryCursor | null =
    moreLinks || moreExcluded
      ? {
          links: moreLinks ? at(links.at(-1)!) : null,
          excluded: moreExcluded ? at(exclusions.at(-1)!) : null,
        }
      : null;
  const excludedRefs = exclusions.map((row): SideRef =>
    row.transactionId
      ? { kind: "transaction", id: row.transactionId }
      : { kind: "investment", id: row.investmentTransactionId! },
  );
  const refs = [...links.flatMap(linkSides), ...excludedRefs];
  const sides = refs.length ? await loadTransferSides(db, scope, refs) : [];
  const byKey = new Map(sides.map((side) => [sideKey(side), side]));
  return {
    links: links.map((link) => {
      const [outgoing, incoming] = linkSides(link);
      return {
        id: link.id,
        outgoing: byKey.get(sideKey(outgoing!)),
        incoming: byKey.get(sideKey(incoming!)),
        feeAmount: link.feeAmount,
        feeCurrency: link.feeCurrency,
      };
    }),
    excluded: excludedRefs.flatMap((ref) => {
      const side = byKey.get(sideKey(ref));
      return side ? [side] : [];
    }),
    moreLinks,
    moreExcluded,
    nextCursor,
  };
}
