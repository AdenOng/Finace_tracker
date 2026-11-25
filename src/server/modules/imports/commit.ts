import "server-only";

import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, exists, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { z } from "zod";

import { accountGroupOf, holdsSecurities } from "~/lib/accounts";
import { checkImportBalance, type BalanceSummary } from "~/lib/import-balance-check";
import type { Database } from "~/server/db";
import {
  accountSnapshot,
  document,
  extractionJob,
  investmentTransaction,
  position,
  security,
  stagedRow,
  transaction,
} from "~/server/db/schema";
import { type AccessScope, writableBy } from "~/server/lib/access";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import {
  stagedSchemas,
  type StagedKind,
} from "~/server/modules/imports/rows";
import { snapshotInput, writeSnapshot } from "~/server/modules/portfolio/snapshots";
import {
  classifyTransaction,
  loadClassificationCategories,
} from "~/server/modules/spending/classification";
import {
  checkCategory,
  lockAccounts,
  requireOpenPeriod,
} from "~/server/modules/spending/guards";
import { normalizeMerchantText } from "~/server/modules/spending/rules";

/** Deterministic, so committing the same statement line twice is caught by the unique index. */
export function fingerprint(
  parts: (string | null)[],
  seen: Map<string, number>,
  matched: ReadonlySet<string>,
) {
  const key = parts.map((p) => p ?? "").join("\u0000");
  let n = seen.get(key) ?? 0;
  let value: string;
  // Skipped duplicates already occupy occurrence numbers; a new identical line needs a free one.
  do {
    n++;
    value = `statement:${createHash("sha256").update(`${key}\u0000${n}`).digest("hex")}`;
  } while (matched.has(value));
  seen.set(key, n);
  return value;
}

/**
 * A trade names only a symbol, which can match listings on several exchanges or in several
 * currencies. Listings held in `holdings` win, in the order given (the statement's own holdings
 * first), then one in the trade's currency. If the best evidence still points at more than one
 * listing, the trade is left unlinked.
 */
export function tradedListing(
  listings: { id: string; currency: string }[],
  currency: string,
  holdings: ReadonlySet<string>[],
) {
  for (const pool of [
    ...holdings.flatMap((held) => [
      listings.filter((l) => held.has(l.id) && l.currency === currency),
      listings.filter((l) => held.has(l.id)),
    ]),
    listings.filter((l) => l.currency === currency),
  ]) {
    if (pool.length > 0) return pool.length === 1 ? pool[0]!.id : null;
  }
  return null;
}

/** Write every accepted staged row into the account atomically. */
export async function commitImportJob(
  db: Database,
  scope: AccessScope,
  input: {
    jobId: string;
    asOf: string;
    acknowledgeBalanceMismatch?: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        id: extractionJob.id,
        status: extractionJob.status,
        result: extractionJob.result,
        documentId: document.id,
        accountId: document.accountId,
      })
      .from(extractionJob)
      .innerJoin(document, eq(document.id, extractionJob.documentId))
      .where(
        and(
          eq(extractionJob.id, input.jobId),
          writableBy(scope, extractionJob.ownerId),
        ),
      )
      .for("update", { of: extractionJob });
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (job.status !== "needs_review" || !job.accountId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This import is no longer open for review",
      });
    }
    await lockAccounts(tx, scope, [job.accountId]);
    const account = await requireWritableAccount(tx, scope, job.accountId);

    const rows = await tx
      .select()
      .from(stagedRow)
      .where(
        and(eq(stagedRow.jobId, job.id), isNull(stagedRow.committedRecordId)),
      )
      .orderBy(asc(stagedRow.createdAt), asc(stagedRow.id));
    if (
      rows.some(
        (r) =>
          r.matchStatus === "possible_duplicate" && r.decision === "pending",
      )
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Choose Keep or Skip for every possible duplicate before saving",
      });
    }
    const matchedRecordIds = rows.flatMap((r) =>
      r.matchStatus !== "new" && r.matchedRecordId ? [r.matchedRecordId] : [],
    );
    // Reserve occurrences matched at review time, including possible duplicates the user keeps.
    // Rows added by another pending import still meet the unique constraint below,
    // so concurrent reviews cannot duplicate them.
    const matches = matchedRecordIds.length
      ? (
          await Promise.all([
            tx
              .select({
                id: transaction.id,
                fingerprint: transaction.fingerprint,
                recordedTransaction: {
                  amount: transaction.amount,
                  currency: transaction.currency,
                  postedDate: transaction.postedDate,
                },
              })
              .from(transaction)
              .where(
                and(
                  eq(transaction.accountId, account.id),
                  writableBy(scope, transaction.ownerId),
                  inArray(transaction.id, matchedRecordIds),
                ),
              ),
            tx
              .select({
                id: investmentTransaction.id,
                fingerprint: investmentTransaction.fingerprint,
                recordedTransaction: {
                  amount: investmentTransaction.amount,
                  currency: investmentTransaction.currency,
                  postedDate: investmentTransaction.tradeDate,
                },
              })
              .from(investmentTransaction)
              .where(
                and(
                  eq(investmentTransaction.accountId, account.id),
                  writableBy(scope, investmentTransaction.ownerId),
                  inArray(investmentTransaction.id, matchedRecordIds),
                ),
              ),
          ])
        ).flat()
      : [];
    const matchedIds = new Set(matches.map((r) => r.id));
    const matchedFingerprints = new Set(matches.map((r) => r.fingerprint));
    const recordedById = new Map(
      matches.map((r) => [r.id, r.recordedTransaction]),
    );
    const balanceCheck = checkImportBalance({
      summary: job.result as BalanceSummary | null,
      accountType: account.type,
      accountCurrency: account.currency,
      rows: rows.map((r) => ({
        ...r,
        data: stagedSchemas[r.kind].parse(r.data),
        recorded: matchedIds.has(r.matchedRecordId ?? ""),
        recordedTransaction:
          recordedById.get(r.matchedRecordId ?? "") ?? null,
      })),
    });
    if (
      balanceCheck.requiresAcknowledgment &&
      !input.acknowledgeBalanceMismatch
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "The statement balance check does not match. Correct the rows or confirm “I've checked this — save anyway” before saving.",
      });
    }
    const of = <S extends z.ZodType>(kind: StagedKind, schema: S) =>
      rows
        .filter((r) => r.kind === kind && r.decision === "accept")
        .map((r) => ({
          id: r.id,
          data: schema.parse(r.data),
          duplicate:
            r.matchStatus === "duplicate" &&
            matchedIds.has(r.matchedRecordId ?? ""),
        }));

    const committed = new Map<string, string>();
    const counts = {
      transactions: 0,
      duplicates: 0,
      holdings: 0,
      activity: 0,
      balances: 0,
    };
    const seen = new Map<string, number>();

    if (accountGroupOf(account.type) === "banking") {
      const categories = await loadClassificationCategories(tx);
      for (const { id, data, duplicate } of of(
        "transaction",
        stagedSchemas.transaction,
      )) {
        if (duplicate) {
          counts.duplicates++;
          continue;
        }
        await requireOpenPeriod(tx, scope, {
          accountId: account.id,
          currency: data.currency,
          postedDate: data.postedDate,
        });
        await checkCategory(tx, data.categoryId);
        const classification = classifyTransaction(
          data,
          { categoryId: data.categoryId },
          categories,
        );
        const [row] = await tx
          .insert(transaction)
          .values({
            ownerId: scope.userId,
            accountId: account.id,
            postedDate: data.postedDate,
            transactionDate: data.transactionDate,
            description: data.description,
            reference: data.reference,
            merchant: data.merchant,
            amount: data.amount,
            currency: data.currency,
            originalAmount: data.originalAmount,
            originalCurrency: data.originalCurrency,
            ...classification,
            categorySource: classification.categoryId ? "ai" : null,
            source: "statement",
            documentId: job.documentId,
            fingerprint: fingerprint(
              [
                data.postedDate,
                data.amount,
                data.currency,
                normalizeMerchantText(data.description),
                data.reference,
              ],
              seen,
              matchedFingerprints,
            ),
          })
          .onConflictDoNothing({
            target: [transaction.accountId, transaction.fingerprint],
          })
          .returning({ id: transaction.id });
        if (row) {
          committed.set(id, row.id);
          counts.transactions++;
        } else counts.duplicates++;
      }
    }

    const positions = holdsSecurities(account.type)
      ? of("position", stagedSchemas.position)
      : [];
    const cash = of("cash_balance", stagedSchemas.cash_balance);
    let imported: string | null = null;
    if (positions.length > 0 || cash.length > 0) {
      const parsed = snapshotInput.safeParse({
        accountId: account.id,
        asOf: input.asOf,
        positions: positions.map(({ data }) => ({
          symbol: data.symbol,
          exchange: data.exchange,
          name: data.name ?? "",
          assetClass: data.assetClass,
          currency: data.currency,
          quantity: data.quantity,
          averageCost: data.averageCost,
          price: data.price,
          value: data.value,
        })),
        cash: cash.map(({ data }) => data),
      });
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            parsed.error.issues[0]?.message ??
            "Some holdings could not be saved",
        });
      }
      const snapshot = await writeSnapshot(tx, scope, account, parsed.data, {
        source: "statement",
        documentId: job.documentId,
      });
      imported = snapshot.id;
      for (const r of [...positions, ...cash]) committed.set(r.id, snapshot.id);
      counts.holdings = positions.length;
      counts.balances = cash.length;
    }

    const activity = holdsSecurities(account.type)
      ? of("investment_transaction", stagedSchemas.investment_transaction)
      : [];
    if (activity.length > 0) {
      const symbols = [
        ...new Set(
          activity.flatMap(({ data }) =>
            data.symbol ? [data.symbol.toUpperCase()] : [],
          ),
        ),
      ];
      // A September statement imported after October's entry must not use October's listings.
      const [known, [earlier]] =
        symbols.length > 0
          ? await Promise.all([
              tx
                .select({
                  id: security.id,
                  symbol: security.symbol,
                  currency: security.currency,
                })
                .from(security)
                .where(inArray(security.symbol, symbols)),
              tx
                .select({ id: accountSnapshot.id })
                .from(accountSnapshot)
                .where(
                  and(
                    eq(accountSnapshot.accountId, account.id),
                    lte(accountSnapshot.asOf, input.asOf),
                    imported ? ne(accountSnapshot.id, imported) : undefined,
                    exists(
                      tx
                        .select({ id: position.id })
                        .from(position)
                        .where(eq(position.snapshotId, accountSnapshot.id)),
                    ),
                  ),
                )
                .orderBy(
                  desc(accountSnapshot.asOf),
                  desc(accountSnapshot.createdAt),
                  desc(accountSnapshot.id),
                )
                .limit(1),
            ])
          : [[], []];
      const heldIn = async (snapshotId: string | null | undefined) =>
        new Set(
          snapshotId
            ? (
                await tx
                  .select({ id: position.securityId })
                  .from(position)
                  .where(eq(position.snapshotId, snapshotId))
              ).map((p) => p.id)
            : [],
        );
      const holdings = [await heldIn(imported), await heldIn(earlier?.id)];
      for (const { id, data, duplicate } of activity) {
        if (duplicate) {
          counts.duplicates++;
          continue;
        }
        const [row] = await tx
          .insert(investmentTransaction)
          .values({
            ownerId: scope.userId,
            accountId: account.id,
            securityId: tradedListing(
              known.filter((k) => k.symbol === data.symbol?.toUpperCase()),
              data.currency,
              holdings,
            ),
            type: data.type,
            tradeDate: data.tradeDate,
            settleDate: data.settleDate,
            quantity: data.quantity,
            price: data.price,
            amount: data.amount,
            fees: data.fees,
            reference: data.reference,
            currency: data.currency,
            description: data.description,
            source: "statement",
            documentId: job.documentId,
            fingerprint: fingerprint(
              [
                data.tradeDate,
                data.type,
                data.symbol,
                data.amount,
                data.currency,
                data.quantity,
                data.price,
                data.fees,
                data.reference,
              ],
              seen,
              matchedFingerprints,
            ),
          })
          .onConflictDoNothing({
            target: [
              investmentTransaction.accountId,
              investmentTransaction.fingerprint,
            ],
          })
          .returning({ id: investmentTransaction.id });
        if (row) {
          committed.set(id, row.id);
          counts.activity++;
        } else counts.duplicates++;
      }
    }

    if (committed.size > 0) {
      const values = sql.join(
        [...committed].map(
          ([rowId, recordId]) => sql`(${rowId}::uuid, ${recordId}::uuid)`,
        ),
        sql`, `,
      );
      await tx
        .update(stagedRow)
        .set({ committedRecordId: sql`committed.record_id` })
        .from(sql`(values ${values}) as committed(id, record_id)`)
        .where(
          and(eq(stagedRow.id, sql`committed.id`), eq(stagedRow.jobId, job.id)),
        );
    }
    await tx
      .update(extractionJob)
      .set({
        status: "completed",
        ...(balanceCheck.requiresAcknowledgment &&
        input.acknowledgeBalanceMismatch
          ? {
              result: {
                ...(job.result as Record<string, unknown>),
                balanceAcknowledgment: {
                  acknowledgedAt: new Date().toISOString(),
                  check: balanceCheck,
                },
              },
            }
          : {}),
      })
      .where(eq(extractionJob.id, job.id));
    return counts;
  });
}
