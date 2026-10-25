import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { currencyInput, moneyInput } from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { transferExclusion, transferLink } from "~/server/db/schema";
import { writableBy } from "~/server/lib/access";
import { ratesInto } from "~/server/modules/portfolio/holdings";
import { lockAccounts } from "~/server/modules/spending/guards";
import {
  candidateMatch,
  sideKey,
  suggestTransfers,
} from "~/server/modules/transfers/matching";
import {
  linkSides,
  loadTransferSides,
  transferDecisions,
} from "~/server/modules/transfers/store";

const sideInput = z.object({
  kind: z.enum(["transaction", "investment"]),
  id: z.uuid(),
});
const linkInput = z.object({
  outgoing: sideInput,
  incoming: sideInput,
  fee: z
    .object({
      amount: moneyInput.refine(
        (v) => new Decimal(v).gte(0),
        "Fee cannot be negative",
      ),
      currency: currencyInput,
    })
    .nullable()
    .optional(),
  manual: z.boolean().default(false),
});

export const transfersRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const [sides, decisions] = await Promise.all([
      loadTransferSides(ctx.db, ctx.scope),
      transferDecisions(ctx.db, ctx.scope),
    ]);
    const unmatched = sides.filter(
      (s) =>
        !decisions.linked.has(sideKey(s)) &&
        !decisions.excluded.has(sideKey(s)),
    );
    const currencies = [...new Set(unmatched.map((s) => s.currency))].sort();
    const rates = new Map<string, string>();
    const dates: string[] = [];
    for (const target of currencies) {
      const result = await ratesInto(ctx.db, target, currencies);
      for (const [source, rate] of result.rates)
        rates.set(`${source}:${target}`, rate);
      if (result.asOf) dates.push(result.asOf);
    }
    return {
      unmatched,
      suggestions: suggestTransfers(unmatched, rates),
      fxAsOf: dates.sort().at(0) ?? null,
      excluded: sides.filter((s) => decisions.excluded.has(sideKey(s))),
      links: decisions.links.map((link) => {
        const [outgoing, incoming] = linkSides(link).map((ref) =>
          sides.find((s) => sideKey(s) === sideKey(ref)),
        );
        return {
          id: link.id,
          outgoing,
          incoming,
          feeAmount: link.feeAmount,
          feeCurrency: link.feeCurrency,
        };
      }),
    };
  }),

  /** Confirm a proposed pair, or explicitly choose any valid counterpart outside the window. */
  link: protectedProcedure.input(linkInput).mutation(async ({ ctx, input }) => {
    let proposed: Awaited<ReturnType<typeof loadTransferSides>> = [];
    let fxRate: string | undefined;
    if (!input.manual) {
      const sides = await loadTransferSides(ctx.db, ctx.scope, [
        input.outgoing,
        input.incoming,
      ]);
      const outgoing = sides.find(
        (s) => sideKey(s) === sideKey(input.outgoing),
      );
      const incoming = sides.find(
        (s) => sideKey(s) === sideKey(input.incoming),
      );
      if (!outgoing || !incoming)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transfer side not found",
        });
      const { rates } = await ratesInto(ctx.db, incoming.currency, [
        outgoing.currency,
      ]);
      proposed = sides;
      fxRate = rates.get(outgoing.currency);
      const match = candidateMatch(outgoing, incoming, fxRate);
      if (!match)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Suggestion changed. Refresh or choose a counterpart manually.",
        });
    }
    return ctx.db.transaction(async (tx) => {
      const refs = [input.outgoing, input.incoming];
      const before = await loadTransferSides(tx, ctx.scope, refs);
      if (before.length !== 2)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transfer side not found",
        });
      await lockAccounts(
        tx,
        ctx.scope,
        before.map((s) => s.accountId),
      );
      const sides = await loadTransferSides(tx, ctx.scope, refs);
      const outgoing = sides.find(
        (s) => sideKey(s) === sideKey(input.outgoing),
      );
      const incoming = sides.find(
        (s) => sideKey(s) === sideKey(input.incoming),
      );
      if (
        !outgoing ||
        !incoming ||
        sides.some((s) => !before.some((b) => b.accountId === s.accountId))
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Transfer changed. Refresh and try again.",
        });
      if (
        outgoing.direction !== "out" ||
        incoming.direction !== "in" ||
        outgoing.accountId === incoming.accountId
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Choose an outgoing and incoming transfer in different accounts",
        });
      const { linked, excluded } = await transferDecisions(tx, ctx.scope);
      if (refs.some((s) => linked.has(sideKey(s)) || excluded.has(sideKey(s))))
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A side is already linked or marked as having no counterpart",
        });
      let impliedFee: { amount: string; currency: string } | null = null;
      // Check again after account locks: a stale suggestion must never confirm changed amounts.
      if (
        !input.manual &&
        proposed.some((b) => {
          const current = sides.find((s) => sideKey(s) === sideKey(b));
          return (
            current?.amount !== b.amount ||
            current.currency !== b.currency ||
            current.date !== b.date
          );
        })
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "Transfer changed. Refresh and try again.",
        });
      if (!input.manual) {
        const match = candidateMatch(outgoing, incoming, fxRate);
        if (!match)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Suggestion changed. Refresh and try again.",
          });
        if (match.feeAmount && match.feeCurrency)
          impliedFee = { amount: match.feeAmount, currency: match.feeCurrency };
      }
      const fee = input.fee === undefined ? impliedFee : input.fee;
      const [link] = await tx
        .insert(transferLink)
        .values({
          ownerId: ctx.scope.userId,
          outgoingTransactionId:
            outgoing.kind === "transaction" ? outgoing.id : null,
          outgoingInvestmentId:
            outgoing.kind === "investment" ? outgoing.id : null,
          incomingTransactionId:
            incoming.kind === "transaction" ? incoming.id : null,
          incomingInvestmentId:
            incoming.kind === "investment" ? incoming.id : null,
          feeAmount: fee?.amount ?? null,
          feeCurrency: fee?.currency ?? null,
        })
        .returning({ id: transferLink.id });
      return link!;
    });
  }),

  unlink: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(transferLink)
        .where(
          and(
            writableBy(ctx.scope, transferLink.ownerId),
            eq(transferLink.id, input.id),
          ),
        );
    }),

  noCounterpart: protectedProcedure
    .input(sideInput.extend({ excluded: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [side] = await loadTransferSides(tx, ctx.scope, [input]);
        if (!side)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transfer side not found",
          });
        await lockAccounts(tx, ctx.scope, [side.accountId]);
        const [current] = await loadTransferSides(tx, ctx.scope, [input]);
        if (current?.accountId !== side.accountId)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Transfer changed. Refresh and try again.",
          });
        const { linked } = await transferDecisions(tx, ctx.scope);
        if (linked.has(sideKey(input)))
          throw new TRPCError({
            code: "CONFLICT",
            message: "Unlink this transfer first",
          });
        if (input.excluded) {
          await tx
            .insert(transferExclusion)
            .values({
              ownerId: ctx.scope.userId,
              transactionId: input.kind === "transaction" ? input.id : null,
              investmentTransactionId:
                input.kind === "investment" ? input.id : null,
            })
            .onConflictDoNothing();
        } else {
          await tx
            .delete(transferExclusion)
            .where(
              and(
                writableBy(ctx.scope, transferExclusion.ownerId),
                input.kind === "transaction"
                  ? eq(transferExclusion.transactionId, input.id)
                  : eq(transferExclusion.investmentTransactionId, input.id),
              ),
            );
        }
      }),
    ),
});
