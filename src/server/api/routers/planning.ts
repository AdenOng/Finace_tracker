import { TRPCError } from "@trpc/server";
import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  isCashFlowAccount,
  matchesOccurrence,
  occurrenceDates,
} from "~/lib/cash-flow";
import { todayIso } from "~/lib/dates";
import { isoDateInput, moneyInput } from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  cardPaymentAccount,
  cardStatement,
  recurringOccurrence,
  recurringSchedule,
  transaction,
} from "~/server/db/schema";
import { writableBy, type AccessScope } from "~/server/lib/access";
import { requireWritableAccount } from "~/server/modules/accounts/ownership";
import { loadPlanning } from "~/server/modules/planning";
import {
  lockAccounts,
  writableTransactions,
  type FinanceDatabase,
} from "~/server/modules/spending/guards";

async function requireSchedule(
  db: FinanceDatabase,
  scope: AccessScope,
  id: string,
) {
  const where = and(
    eq(recurringSchedule.id, id),
    writableBy(scope, recurringSchedule.ownerId),
  );
  const [before] = await db.select().from(recurringSchedule).where(where);
  if (!before)
    throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
  await lockAccounts(db, scope, [before.accountId]);
  const [row] = await db
    .select()
    .from(recurringSchedule)
    .where(where)
    .for("update");
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
  await requireWritableAccount(db, scope, row.accountId);
  return row;
}

async function requireCardBank(
  db: FinanceDatabase,
  scope: AccessScope,
  cardId: string,
  bankId: string,
) {
  await lockAccounts(db, scope, [cardId, bankId]);
  const card = await requireWritableAccount(db, scope, cardId);
  const bank = await requireWritableAccount(db, scope, bankId);
  if (
    card.type !== "credit_card" ||
    !["checking", "savings"].includes(bank.type) ||
    card.currency !== bank.currency
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a credit card and a bank account in the same currency",
    });
  return card;
}

export const planningRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(
      z
        .object({
          days: z
            .union([z.literal(30), z.literal(60), z.literal(90)])
            .default(30),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      loadPlanning(ctx.db, ctx.scope, input?.days ?? 30),
    ),

  createSchedule: protectedProcedure
    .input(
      z
        .object({
          accountId: z.uuid(),
          name: z.string().trim().min(1).max(120),
          amount: moneyInput.refine(
            (v) => !new Decimal(v).isZero(),
            "Amount cannot be zero",
          ),
          frequency: z.enum(["weekly", "monthly", "yearly"]),
          startDate: isoDateInput,
          endDate: isoDateInput.nullable(),
        })
        .refine(
          (v) => !v.endDate || v.endDate >= v.startDate,
          "End date must follow the first due date",
        ),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await lockAccounts(tx, ctx.scope, [input.accountId]);
        const account = await requireWritableAccount(
          tx,
          ctx.scope,
          input.accountId,
        );
        if (!isCashFlowAccount(account.type))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Choose a bank or cash account; track card payments using statement bills",
          });
        const [row] = await tx
          .insert(recurringSchedule)
          .values({
            ...input,
            ownerId: ctx.scope.userId,
            currency: account.currency,
          })
          .returning({ id: recurringSchedule.id });
        return row!;
      }),
    ),

  setActive: protectedProcedure
    .input(z.object({ id: z.uuid(), active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireSchedule(tx, ctx.scope, input.id);
        await tx
          .update(recurringSchedule)
          .set({ active: input.active })
          .where(
            and(
              eq(recurringSchedule.id, input.id),
              writableBy(ctx.scope, recurringSchedule.ownerId),
            ),
          );
      }),
    ),

  removeSchedule: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireSchedule(tx, ctx.scope, input.id);
        await tx
          .delete(recurringSchedule)
          .where(
            and(
              eq(recurringSchedule.id, input.id),
              writableBy(ctx.scope, recurringSchedule.ownerId),
            ),
          );
      }),
    ),

  decideOccurrence: protectedProcedure
    .input(
      z.object({
        scheduleId: z.uuid(),
        dueDate: isoDateInput,
        action: z.enum(["match", "skip", "reset"]),
        transactionId: z.uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const schedule = await requireSchedule(tx, ctx.scope, input.scheduleId);
        if (
          occurrenceDates(schedule, input.dueDate, input.dueDate).length !== 1
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This date is not an occurrence of the schedule",
          });
        const where = and(
          eq(recurringOccurrence.scheduleId, schedule.id),
          eq(recurringOccurrence.dueDate, input.dueDate),
        );
        if (input.action === "reset") {
          await tx.delete(recurringOccurrence).where(where);
          return;
        }
        if (input.action === "match") {
          if (!input.transactionId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose a recorded transaction",
            });
          const [candidate] = await tx
            .select({ accountId: transaction.accountId })
            .from(transaction)
            .where(
              and(
                eq(transaction.id, input.transactionId),
                writableBy(ctx.scope, transaction.ownerId),
              ),
            );
          if (candidate?.accountId !== schedule.accountId)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Transaction not found in the scheduled account",
            });
          const [row] = await writableTransactions(tx, ctx.scope, [
            input.transactionId,
          ]);
          if (
            !row ||
            row.postedDate > todayIso() ||
            !matchesOccurrence(schedule, input.dueDate, row)
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Transaction must match the account, currency and signed amount within seven days of the due date",
            });
          const [used] = await tx
            .select()
            .from(recurringOccurrence)
            .where(eq(recurringOccurrence.transactionId, row.id));
          if (
            used &&
            (used.scheduleId !== schedule.id || used.dueDate !== input.dueDate)
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This transaction is already matched to another occurrence",
            });
        }
        await tx
          .insert(recurringOccurrence)
          .values({
            scheduleId: schedule.id,
            dueDate: input.dueDate,
            transactionId:
              input.action === "match" ? input.transactionId! : null,
          })
          .onConflictDoUpdate({
            target: [
              recurringOccurrence.scheduleId,
              recurringOccurrence.dueDate,
            ],
            set: {
              transactionId:
                input.action === "match" ? input.transactionId! : null,
            },
          });
      }),
    ),

  setPaymentBank: protectedProcedure
    .input(
      z.object({ cardAccountId: z.uuid(), bankAccountId: z.uuid().nullable() }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        if (input.bankAccountId === null) {
          await lockAccounts(tx, ctx.scope, [input.cardAccountId]);
          const card = await requireWritableAccount(
            tx,
            ctx.scope,
            input.cardAccountId,
          );
          if (card.type !== "credit_card")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose a credit card",
            });
          await tx
            .delete(cardPaymentAccount)
            .where(
              and(
                eq(cardPaymentAccount.cardAccountId, card.id),
                writableBy(ctx.scope, cardPaymentAccount.ownerId),
              ),
            );
          return;
        }
        await requireCardBank(
          tx,
          ctx.scope,
          input.cardAccountId,
          input.bankAccountId,
        );
        await tx
          .insert(cardPaymentAccount)
          .values({
            ...input,
            bankAccountId: input.bankAccountId,
            ownerId: ctx.scope.userId,
          })
          .onConflictDoUpdate({
            target: cardPaymentAccount.cardAccountId,
            set: { bankAccountId: input.bankAccountId },
          });
      }),
    ),

  createStatement: protectedProcedure
    .input(
      z
        .object({
          cardAccountId: z.uuid(),
          statementDate: isoDateInput,
          dueDate: isoDateInput,
          amountDue: moneyInput.refine(
            (v) => new Decimal(v).gte(0),
            "Amount due cannot be negative",
          ),
        })
        .refine(
          (v) => v.statementDate <= todayIso(),
          "Statement closing date cannot be in the future",
        )
        .refine(
          (v) => v.dueDate > v.statementDate,
          "Due date must follow the statement closing date",
        ),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [profile] = await tx
          .select()
          .from(cardPaymentAccount)
          .where(
            and(
              eq(cardPaymentAccount.cardAccountId, input.cardAccountId),
              writableBy(ctx.scope, cardPaymentAccount.ownerId),
            ),
          );
        if (!profile)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Link a payment bank to this card first",
          });
        const card = await requireCardBank(
          tx,
          ctx.scope,
          input.cardAccountId,
          profile.bankAccountId,
        );
        const [current] = await tx
          .select()
          .from(cardPaymentAccount)
          .where(
            and(
              eq(cardPaymentAccount.cardAccountId, card.id),
              writableBy(ctx.scope, cardPaymentAccount.ownerId),
            ),
          );
        if (current?.bankAccountId !== profile.bankAccountId)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Payment bank changed; refresh and try again",
          });
        const [row] = await tx
          .insert(cardStatement)
          .values({
            ...input,
            ownerId: ctx.scope.userId,
            bankAccountId: profile.bankAccountId,
            currency: card.currency,
          })
          .onConflictDoNothing()
          .returning({ id: cardStatement.id });
        if (!row)
          throw new TRPCError({
            code: "CONFLICT",
            message: "A bill already exists for this statement closing date",
          });
        return row;
      }),
    ),

  removeStatement: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const where = and(
          eq(cardStatement.id, input.id),
          writableBy(ctx.scope, cardStatement.ownerId),
        );
        const [row] = await tx.select().from(cardStatement).where(where);
        if (!row)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Statement bill not found",
          });
        await lockAccounts(tx, ctx.scope, [
          row.cardAccountId,
          row.bankAccountId,
        ]);
        await tx.delete(cardStatement).where(where);
      }),
    ),
});
