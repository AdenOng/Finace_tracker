import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  consumePasswordReset,
  PasswordResetError,
} from "~/server/auth/password-reset";

/** Public: the reset link's token is the credential. */
export const passwordResetRouter = createTRPCRouter({
  complete: publicProcedure
    .input(
      z.object({ token: z.string().min(1).max(200), password: z.string() }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await consumePasswordReset(ctx.db, input.token, input.password);
      } catch (error) {
        if (!(error instanceof PasswordResetError)) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
    }),
});
