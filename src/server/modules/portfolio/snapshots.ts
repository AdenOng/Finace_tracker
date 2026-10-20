import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  holdsSecurities,
  assetClasses,
  cpfBuckets,
  type AccountType,
} from "~/lib/accounts";
import {
  currencyInput,
  isoDateInput,
  moneyInput,
  priceInput,
  quantityInput,
} from "~/server/api/inputs";
import {
  accountSnapshot,
  cashBalance,
  investmentTransaction,
  position,
  priceHistory,
  security,
  securityQuote,
} from "~/server/db/schema";
import type { AccessScope } from "~/server/lib/access";
import type { FinanceDatabase } from "~/server/modules/spending/guards";
import { multiply } from "./valuation";

export const positionInput = z.object({
  symbol: z.string().trim().toUpperCase().min(1).max(32),
  /** Exchange MIC or short code; blank when unknown. */
  exchange: z.string().trim().toUpperCase().max(16),
  name: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
  assetClass: z.enum(assetClasses),
  currency: currencyInput,
  quantity: quantityInput,
  averageCost: priceInput.nullable(),
  price: priceInput.nullable(),
  value: moneyInput.nullable().optional(),
});

/**
 * The newest date an entry may carry. A day ahead of UTC covers every time zone, so "today" is
 * always accepted while a mistyped year (which would stay the current entry for good) is not.
 */
const latestEntryDate = () =>
  new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

export const snapshotInput = z
  .object({
    accountId: z.uuid(),
    asOf: isoDateInput.refine(
      (date) => date <= latestEntryDate(),
      "The entry date can't be in the future",
    ),
    positions: z
      .array(positionInput)
      .max(500)
      .refine(
        (rows) =>
          new Set(rows.map((r) => `${r.symbol}\u0000${r.exchange}`)).size ===
          rows.length,
        "Each holding can only be listed once",
      ),
    cash: z
      .array(
        z.object({
          currency: currencyInput,
          amount: moneyInput,
          /** CPF sub-account; only CPF accounts use it. */
          bucket: z.enum(cpfBuckets).nullable().optional(),
        }),
      )
      .max(20)
      .refine(
        (rows) =>
          new Set(rows.map((r) => `${r.currency}\u0000${r.bucket ?? ""}`))
            .size === rows.length,
        "Each currency can only be listed once",
      ),
  })
  .refine((input) => input.positions.length > 0 || input.cash.length > 0, {
    message:
      "Add a holding or cash balance. To record an empty account, enter a cash balance of 0.",
    path: ["cash"],
  });

export type SnapshotInput = z.infer<typeof snapshotInput>;

/**
 * A new entry that lists a holding in another currency than the account's current entry is almost
 * always a typo, so it is refused with a pointer to the entry to fix. Edits are not checked: a
 * typo copied into several entries is corrected one entry at a time.
 */
async function rejectCurrencyChanges(
  tx: FinanceDatabase,
  accountId: string,
  input: SnapshotInput,
  source: "manual" | "statement" | "api",
) {
  const [current] = await tx
    .select({ id: accountSnapshot.id, asOf: accountSnapshot.asOf })
    .from(accountSnapshot)
    .where(
      and(
        eq(accountSnapshot.accountId, accountId),
        // Re-saving the same date replaces that entry, so it is not the one to compare with.
        or(
          ne(accountSnapshot.asOf, input.asOf),
          ne(accountSnapshot.source, source),
        ),
      ),
    )
    .orderBy(
      desc(accountSnapshot.asOf),
      desc(accountSnapshot.createdAt),
      desc(accountSnapshot.id),
    )
    .limit(1);
  if (!current) return;
  const held = await tx
    .select({
      symbol: security.symbol,
      exchange: security.exchange,
      currency: security.currency,
    })
    .from(position)
    .innerJoin(security, eq(security.id, position.securityId))
    .where(eq(position.snapshotId, current.id));
  for (const p of input.positions) {
    const other = held.find(
      (h) =>
        h.symbol === p.symbol &&
        h.exchange === p.exchange &&
        h.currency !== p.currency,
    );
    if (other)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${p.symbol}${p.exchange ? ` on ${p.exchange}` : ""} is in ${other.currency} in this account's ${current.asOf} entry, not ${p.currency}. Use the same currency, or edit that entry first if it is wrong.`,
      });
  }
}

type Listing = {
  id: string;
  name: string | null;
  assetClass: (typeof assetClasses)[number];
};

/**
 * Applies someone's corrected asset class or name to instruments only they hold, so fixing a typo
 * in an entry actually sticks. Instruments shared with other people keep their catalogue labels.
 * A new asset class can change which market symbol is used, so its old quote is dropped.
 */
async function correctListings(
  tx: FinanceDatabase,
  scope: AccessScope,
  changes: Listing[],
  known: { id: string; assetClass: string }[],
) {
  if (changes.length === 0) return;
  const ids = changes.map((c) => c.id);
  const [heldByOthers, tradedByOthers] = await Promise.all([
    tx
      .select({ id: position.securityId })
      .from(position)
      .innerJoin(accountSnapshot, eq(accountSnapshot.id, position.snapshotId))
      .where(
        and(
          inArray(position.securityId, ids),
          ne(accountSnapshot.ownerId, scope.userId),
        ),
      ),
    tx
      .select({ id: investmentTransaction.securityId })
      .from(investmentTransaction)
      .where(
        and(
          inArray(investmentTransaction.securityId, ids),
          ne(investmentTransaction.ownerId, scope.userId),
        ),
      ),
  ]);
  const shared = new Set([...heldByOthers, ...tradedByOthers].map((r) => r.id));
  for (const change of changes) {
    if (shared.has(change.id)) continue;
    await tx
      .update(security)
      .set({ name: change.name, assetClass: change.assetClass })
      .where(eq(security.id, change.id));
    if (
      known.find((k) => k.id === change.id)?.assetClass !== change.assetClass
    ) {
      await tx
        .delete(securityQuote)
        .where(eq(securityQuote.securityId, change.id));
      await tx
        .delete(priceHistory)
        .where(eq(priceHistory.securityId, change.id));
    }
  }
}

/**
 * Records what an account held on a date: positions (investment accounts) and cash balances.
 * Saving the same date from the same source again replaces the earlier entry. The caller locks
 * the account and checks it is writable first.
 */
export async function writeSnapshot(
  tx: FinanceDatabase,
  scope: AccessScope,
  account: { id: string; type: AccountType },
  input: SnapshotInput,
  options: {
    source: "manual" | "statement" | "api";
    documentId?: string | null;
    editId?: string;
    createOnly?: boolean;
    /** Typed by the person, so their asset class and name correct the catalogue. */
    manual?: boolean;
  },
) {
  if (input.positions.length > 0 && !holdsSecurities(account.type)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This type of account only holds cash balances",
    });
  }
  if (account.type !== "cpf" && input.cash.some((c) => c.bucket)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only CPF balances are split into sub-accounts",
    });
  }

  const securityIds = new Map<string, string>();
  if (input.positions.length > 0 && !options.editId) {
    await rejectCurrencyChanges(tx, account.id, input, options.source);
  }
  if (input.positions.length > 0) {
    // The instrument catalogue is shared: add unknown ones; only manual corrections relabel them.
    await tx
      .insert(security)
      .values(
        input.positions.map((p) => ({
          symbol: p.symbol,
          exchange: p.exchange,
          name: p.name,
          assetClass: p.assetClass,
          currency: p.currency,
        })),
      )
      .onConflictDoNothing({
        target: [security.symbol, security.exchange, security.currency],
      });
    const known = await tx
      .select({
        id: security.id,
        symbol: security.symbol,
        exchange: security.exchange,
        currency: security.currency,
        name: security.name,
        assetClass: security.assetClass,
      })
      .from(security)
      .where(
        or(
          ...input.positions.map((p) =>
            and(
              eq(security.symbol, p.symbol),
              eq(security.exchange, p.exchange),
              eq(security.currency, p.currency),
            ),
          ),
        ),
      );
    const relabel: Listing[] = [];
    for (const p of input.positions) {
      const match = known.find(
        (k) =>
          k.symbol === p.symbol &&
          k.exchange === p.exchange &&
          k.currency === p.currency,
      )!;
      securityIds.set(`${p.symbol}\u0000${p.exchange}`, match.id);
      if (
        options.manual &&
        (match.assetClass !== p.assetClass ||
          (p.name !== null && p.name !== match.name))
      )
        relabel.push({
          id: match.id,
          name: p.name ?? match.name,
          assetClass: p.assetClass,
        });
    }
    await correctListings(tx, scope, relabel, known);
  }

  const replaced = await tx
    .select({ id: accountSnapshot.id })
    .from(accountSnapshot)
    .where(
      and(
        eq(accountSnapshot.accountId, account.id),
        eq(accountSnapshot.asOf, input.asOf),
        eq(accountSnapshot.source, options.source),
        options.editId ? ne(accountSnapshot.id, options.editId) : undefined,
      ),
    );
  if (replaced.length > 0) {
    if (options.editId || options.createOnly)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Another entry from this source already uses that date. Choose another date or edit that entry.",
      });
    await tx.delete(accountSnapshot).where(
      inArray(
        accountSnapshot.id,
        replaced.map((r) => r.id),
      ),
    );
  }

  const [snapshot] = options.editId
    ? await tx
        .update(accountSnapshot)
        .set({
          asOf: input.asOf,
          updatedAt: sql`greatest(clock_timestamp(), ${accountSnapshot.updatedAt} + interval '1 microsecond')`,
        })
        .where(
          and(
            eq(accountSnapshot.id, options.editId),
            eq(accountSnapshot.accountId, account.id),
            eq(accountSnapshot.ownerId, scope.userId),
          ),
        )
        .returning({ id: accountSnapshot.id })
    : await tx
        .insert(accountSnapshot)
        .values({
          ownerId: scope.userId,
          accountId: account.id,
          asOf: input.asOf,
          source: options.source,
          documentId: options.documentId ?? null,
        })
        .returning({ id: accountSnapshot.id });
  const snapshotId = snapshot!.id;
  if (options.editId) {
    await tx.delete(position).where(eq(position.snapshotId, snapshotId));
    await tx.delete(cashBalance).where(eq(cashBalance.snapshotId, snapshotId));
  }

  if (input.positions.length > 0) {
    await tx.insert(position).values(
      input.positions.map((p) => ({
        snapshotId,
        securityId: securityIds.get(`${p.symbol}\u0000${p.exchange}`)!,
        quantity: p.quantity,
        averageCost: p.averageCost,
        costCurrency: p.averageCost ? p.currency : null,
        statementPrice: p.price,
        statementValue:
          p.value ?? (p.price ? multiply(p.quantity, p.price) : null),
      })),
    );
  }
  if (input.cash.length > 0) {
    await tx
      .insert(cashBalance)
      .values(
        input.cash.map((c) => ({ snapshotId, ...c, bucket: c.bucket ?? null })),
      );
  }
  return { id: snapshotId, replaced: replaced.length > 0 };
}
