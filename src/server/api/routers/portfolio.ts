import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  financialAccount,
  institution,
  userSettings,
  accountSnapshot,
} from "~/server/db/schema";
import {
  readableAccount,
  resolveWorkspaceScope,
  writableBy,
  type AccessScope,
} from "~/server/lib/access";
import { holdsSecurities } from "~/lib/accounts";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import {
  lockAccounts,
  type FinanceDatabase,
} from "~/server/modules/spending/guards";
import {
  hasSnapshotEntries,
  latestHoldings,
  ratesInto,
  snapshotDetails,
} from "~/server/modules/portfolio/holdings";
import {
  snapshotInput,
  writeSnapshot,
} from "~/server/modules/portfolio/snapshots";
import { consolidateHoldings } from "~/server/modules/portfolio/consolidated";
import { refreshQuotes } from "~/server/modules/portfolio/market-health";
import { netWorthHistory } from "~/server/modules/portfolio/history";
import { computeNetWorth } from "~/server/modules/portfolio/net-worth";

const entryIdentity = z.object({
  accountId: z.uuid(),
  snapshotId: z.uuid(),
  version: z.string().min(1).max(100),
});
async function lockEntry(
  db: FinanceDatabase,
  scope: AccessScope,
  input: z.infer<typeof entryIdentity>,
) {
  const [entry] = await db
    .select({
      id: accountSnapshot.id,
      source: accountSnapshot.source,
      documentId: accountSnapshot.documentId,
      version: sql<string>`${accountSnapshot.updatedAt}::text`,
    })
    .from(accountSnapshot)
    .where(
      and(
        eq(accountSnapshot.id, input.snapshotId),
        eq(accountSnapshot.accountId, input.accountId),
        writableBy(scope, accountSnapshot.ownerId),
      ),
    )
    .for("update");
  if (!entry)
    throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
  if (entry.version !== input.version)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This entry changed while you were reviewing it. Refresh and try again.",
    });
  return entry;
}

/** Holdings and net worth: what the accounts are worth, as opposed to spending flows. */
export const portfolioRouter = createTRPCRouter({
  /** Personal view of current holdings across active investment accounts. */
  consolidated: protectedProcedure
    .input(z.object({ accountId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const [rows, settings] = await Promise.all([
        ctx.db
          .select({
            id: financialAccount.id,
            name: financialAccount.name,
            type: financialAccount.type,
            archivedAt: financialAccount.archivedAt,
            institutionName: institution.name,
            institutionKey: institution.key,
          })
          .from(financialAccount)
          .leftJoin(
            institution,
            eq(institution.id, financialAccount.institutionId),
          )
          .where(writableBy(ctx.scope, financialAccount.ownerId))
          .orderBy(financialAccount.name),
        ctx.db
          .select({ currency: userSettings.displayCurrency })
          .from(userSettings)
          .where(eq(userSettings.userId, ctx.scope.userId))
          .limit(1),
      ]);
      const investmentAccounts = rows.filter((a) => holdsSecurities(a.type));
      const accounts = investmentAccounts.filter((a) => !a.archivedAt);
      if (input?.accountId && !accounts.some((a) => a.id === input.accountId))
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Investment account not found",
        });
      const currency = settings[0]?.currency ?? "SGD";
      const holdings = await latestHoldings(
        ctx.db,
        ctx.scope,
        accounts.map((a) => a.id),
      );
      const { rates, asOf: fxAsOf } = await ratesInto(
        ctx.db,
        currency,
        // Costs stay in the listing's currency even when a quote values it in another.
        [...holdings.values()].flatMap((h) => [
          ...h.totals.map((t) => t.currency),
          ...h.positions.map((p) => p.currency),
        ]),
      );
      return {
        ...consolidateHoldings(
          accounts,
          holdings,
          currency,
          rates,
          input?.accountId,
        ),
        fxAsOf,
        archivedCount: investmentAccounts.filter((a) => a.archivedAt).length,
      };
    }),
  history: protectedProcedure
    .input(z.object({ accountId: z.uuid(), cursor: z.uuid().optional() }))
    .query(async ({ ctx, input }) => {
      await requireWritableAccount(ctx.db, ctx.scope, input.accountId, {
        allowArchived: true,
      });
      const owned = and(
        eq(accountSnapshot.accountId, input.accountId),
        writableBy(ctx.scope, accountSnapshot.ownerId),
      );
      const [rows, current] = await Promise.all([
        ctx.db
          .select({
            id: accountSnapshot.id,
            asOf: accountSnapshot.asOf,
            source: accountSnapshot.source,
            documentId: accountSnapshot.documentId,
            version: sql<string>`${accountSnapshot.updatedAt}::text`,
            positionCount: sql<number>`(select count(*)::int from position p where p.snapshot_id=account_snapshot.id)`,
            adjusted: sql<boolean>`${accountSnapshot.updatedAt} > ${accountSnapshot.createdAt}`,
            importId: sql<
              string | null
            >`(select j.id from extraction_job j where j.document_id=account_snapshot.document_id and j.owner_id=${ctx.scope.userId} order by j.created_at desc limit 1)`,
            cashCount: sql<number>`(select count(*)::int from cash_balance c where c.snapshot_id=account_snapshot.id)`,
          })
          .from(accountSnapshot)
          .where(
            and(
              owned,
              input.cursor
                ? sql`(${accountSnapshot.asOf},${accountSnapshot.createdAt},${accountSnapshot.id}) < (select as_of,created_at,id from account_snapshot where id=${input.cursor} and account_id=${input.accountId} and owner_id=${ctx.scope.userId})`
                : undefined,
            ),
          )
          .orderBy(
            desc(accountSnapshot.asOf),
            desc(accountSnapshot.createdAt),
            desc(accountSnapshot.id),
          )
          .limit(21),
        ctx.db
          .select({ id: accountSnapshot.id })
          .from(accountSnapshot)
          .where(and(owned, hasSnapshotEntries(ctx.db)))
          .orderBy(
            desc(accountSnapshot.asOf),
            desc(accountSnapshot.createdAt),
            desc(accountSnapshot.id),
          )
          .limit(1),
      ]);
      const more = rows.length > 20;
      const entries = rows.slice(0, 20);
      return {
        entries,
        currentId: current[0]?.id ?? null,
        nextCursor: more ? entries.at(-1)!.id : null,
      };
    }),
  snapshot: protectedProcedure
    .input(z.object({ accountId: z.uuid(), snapshotId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      await requireWritableAccount(ctx.db, ctx.scope, input.accountId, {
        allowArchived: true,
      });
      return snapshotDetails(
        ctx.db,
        ctx.scope,
        input.accountId,
        input.snapshotId,
      );
    }),
  addSnapshot: protectedProcedure
    .input(snapshotInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          input.accountId,
        );
        return writeSnapshot(tx, ctx.scope, account, input, {
          source: "manual",
          createOnly: true,
          manual: true,
        });
      }),
    ),
  updateSnapshot: protectedProcedure
    .input(
      z.object({
        snapshotId: z.uuid(),
        version: z.string().min(1).max(100),
        entry: snapshotInput,
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.entry.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          input.entry.accountId,
        );
        const current = await lockEntry(tx, ctx.scope, {
          accountId: input.entry.accountId,
          ...input,
        });
        return writeSnapshot(tx, ctx.scope, account, input.entry, {
          source: current.source,
          documentId: current.documentId,
          editId: current.id,
          manual: true,
        });
      }),
    ),
  removeSnapshot: protectedProcedure
    .input(entryIdentity)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        await requireWritableAccount(tx, ctx.scope, input.accountId);
        const entry = await lockEntry(tx, ctx.scope, input);
        await tx
          .delete(accountSnapshot)
          .where(
            and(
              eq(accountSnapshot.id, entry.id),
              eq(accountSnapshot.accountId, input.accountId),
              writableBy(ctx.scope, accountSnapshot.ownerId),
            ),
          );
        return { id: entry.id };
      }),
    ),
  /**
   * Latest value of every open account, converted to the display currency where an FX rate is
   * known. Amounts without a rate are returned separately rather than left out silently.
   */
  netWorth: protectedProcedure
    .input(z.object({ workspaceId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input?.workspaceId,
      );
      return computeNetWorth(ctx.db, ctx.scope, scope);
    }),

  /** Your personal net worth over time, for the overview chart. */
  netWorthHistory: protectedProcedure.query(({ ctx }) =>
    netWorthHistory(ctx.db, ctx.scope.userId),
  ),

  /** Fetches market prices for everything the visible accounts currently hold. */
  refreshPrices: protectedProcedure
    .input(z.object({ workspaceId: z.uuid().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveWorkspaceScope(
        ctx.db,
        ctx.scope,
        input?.workspaceId,
      );
      const accounts = await ctx.db
        .select({ id: financialAccount.id })
        .from(financialAccount)
        .where(
          and(
            readableAccount(
              scope,
              financialAccount.ownerId,
              financialAccount.id,
            ),
            isNull(financialAccount.archivedAt),
          ),
        );
      const holdings = await latestHoldings(
        ctx.db,
        scope,
        accounts.map((a) => a.id),
      );
      const securityIds = [
        ...new Set(
          [...holdings.values()].flatMap((h) =>
            h.positions.map((p) => p.securityId),
          ),
        ),
      ];
      return refreshQuotes(ctx.db, { securityIds });
    }),

  /**
   * Records what an account held on a date: positions (investment accounts) and cash balances.
   * Re-entering the same date replaces the earlier manual entry.
   */
  recordSnapshot: protectedProcedure
    .input(snapshotInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          input.accountId,
        );
        return writeSnapshot(tx, ctx.scope, account, input, {
          source: "manual",
          manual: true,
        });
      }),
    ),
});
