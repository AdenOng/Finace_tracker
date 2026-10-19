import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, enrollingProcedure } from "~/server/api/trpc";
import { currency, userSettings } from "~/server/db/schema";
import { preset } from "~/server/lib/preset";

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
});
