import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, enrollingProcedure } from "~/server/api/trpc";
import { currency, userSettings } from "~/server/db/schema";

export const settingsRouter = createTRPCRouter({
  get: enrollingProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.scope.userId))
      .limit(1);
    return row ?? { userId: ctx.scope.userId, displayCurrency: "SGD" };
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
});
