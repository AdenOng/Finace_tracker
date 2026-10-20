import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { z } from "zod";

import {
  createTRPCRouter,
  enrollingProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  currency,
  session,
  signInEvent,
  userSettings,
} from "~/server/db/schema";
import { preset } from "~/server/lib/preset";
import { outer } from "~/server/lib/sql";

export const settingsRouter = createTRPCRouter({
  get: enrollingProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.scope.userId))
      .limit(1);
    const { cpfSrs } = await preset.features();
    return {
      ...(row ?? {
        userId: ctx.scope.userId,
        displayCurrency: "SGD",
        countCpfSrs: true,
      }),
      /** CPF and SRS accounts can be added (set by the preset pack). */
      cpfSrsEnabled: cpfSrs,
    };
  }),

  setDisplayCurrency: enrollingProcedure
    .input(z.object({ code: z.string().length(3) }))
    .mutation(async ({ ctx, input }) => {
      const [known] = await ctx.db
        .select({ code: currency.code })
        .from(currency)
        .where(and(eq(currency.code, input.code), eq(currency.isActive, true)))
        .limit(1);
      if (!known) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown currency",
        });
      }
      await ctx.db
        .insert(userSettings)
        .values({ userId: ctx.scope.userId, displayCurrency: input.code })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: { displayCurrency: input.code },
        });
      return { displayCurrency: input.code };
    }),

  setCountCpfSrs: enrollingProcedure
    .input(z.object({ count: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userSettings)
        .values({ userId: ctx.scope.userId, countCpfSrs: input.count })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: { countCpfSrs: input.count },
        });
      return { countCpfSrs: input.count };
    }),

  /** Your own signed-in devices, newest activity first. Session tokens are never returned. */
  sessions: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: session.id,
        createdAt: session.createdAt,
        lastActiveAt: session.updatedAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        method: sql<
          string | null
        >`(select ${signInEvent.method} from ${signInEvent} where ${signInEvent.sessionId} = ${outer(session.id)} and ${signInEvent.success} limit 1)`,
      })
      .from(session)
      .where(
        and(
          eq(session.userId, ctx.scope.userId),
          gt(session.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(session.updatedAt));
    return rows.map((row) => ({
      ...row,
      current: row.id === ctx.session.session.id,
    }));
  }),

  /** Signs one of your other devices out. This device signs out from the menu instead. */
  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      if (input.sessionId === ctx.session.session.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use Sign out in the menu to sign out of this device.",
        });
      const [row] = await ctx.db
        .delete(session)
        .where(
          and(
            eq(session.id, input.sessionId),
            eq(session.userId, ctx.scope.userId),
          ),
        )
        .returning({ id: session.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  /** Signs out every device except this one. */
  revokeOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const rows = await ctx.db
      .delete(session)
      .where(
        and(
          eq(session.userId, ctx.scope.userId),
          ne(session.id, ctx.session.session.id),
        ),
      )
      .returning({ id: session.id });
    return { revoked: rows.length };
  }),
});
