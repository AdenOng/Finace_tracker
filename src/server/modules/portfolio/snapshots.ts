import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import {
  holdsSecurities,
  assetClasses,
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
  position,
  security,
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
});

export const snapshotInput = z.object({
  accountId: z.uuid(),
  asOf: isoDateInput,
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
    .array(z.object({ currency: currencyInput, amount: moneyInput }))
    .max(20)
    .refine(
      (rows) => new Set(rows.map((r) => r.currency)).size === rows.length,
      "Each currency can only be listed once",
    ),
});

export type SnapshotInput = z.infer<typeof snapshotInput>;

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
  options: { source: "manual" | "statement"; documentId?: string | null },
) {
  if (input.positions.length > 0 && !holdsSecurities(account.type)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This type of account only holds cash balances",
    });
  }

  const securityIds = new Map<string, string>();
  if (input.positions.length > 0) {
    // The instrument catalogue is shared: add unknown ones, never rewrite existing ones.
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
        target: [security.symbol, security.exchange],
      });
    const known = await tx
      .select({
        id: security.id,
        symbol: security.symbol,
        exchange: security.exchange,
        currency: security.currency,
      })
      .from(security)
      .where(
        or(
          ...input.positions.map((p) =>
            and(
              eq(security.symbol, p.symbol),
              eq(security.exchange, p.exchange),
            ),
          ),
        ),
      );
    for (const p of input.positions) {
      const match = known.find(
        (k) => k.symbol === p.symbol && k.exchange === p.exchange,
      )!;
      if (match.currency !== p.currency) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${p.symbol}${p.exchange ? ` on ${p.exchange}` : ""} is priced in ${match.currency}, not ${p.currency}`,
        });
      }
      securityIds.set(`${p.symbol}\u0000${p.exchange}`, match.id);
    }
  }

  const replaced = await tx
    .select({ id: accountSnapshot.id })
    .from(accountSnapshot)
    .where(
      and(
        eq(accountSnapshot.accountId, account.id),
        eq(accountSnapshot.asOf, input.asOf),
        eq(accountSnapshot.source, options.source),
      ),
    );
  if (replaced.length > 0) {
    await tx.delete(accountSnapshot).where(
      inArray(
        accountSnapshot.id,
        replaced.map((r) => r.id),
      ),
    );
  }

  const [snapshot] = await tx
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

  if (input.positions.length > 0) {
    await tx.insert(position).values(
      input.positions.map((p) => ({
        snapshotId,
        securityId: securityIds.get(`${p.symbol}\u0000${p.exchange}`)!,
        quantity: p.quantity,
        averageCost: p.averageCost,
        costCurrency: p.averageCost ? p.currency : null,
        statementPrice: p.price,
        statementValue: p.price ? multiply(p.quantity, p.price) : null,
      })),
    );
  }
  if (input.cash.length > 0) {
    await tx
      .insert(cashBalance)
      .values(input.cash.map((c) => ({ snapshotId, ...c })));
  }
  return { id: snapshotId, replaced: replaced.length > 0 };
}
