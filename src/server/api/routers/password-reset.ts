import { TRPCError } from "@trpc/server";
import { after } from "next/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  consumePasswordReset,
  PasswordResetError,
  requestPasswordReset,
} from "~/server/auth/password-reset";
import { isEmailConfigured } from "~/server/lib/mailer";

/** Public: the reset link's token is the credential. */
export const passwordResetRouter = createTRPCRouter({
  /**
   * Emails a reset link when the address belongs to an account. The answer is the same either
   * way, and the work runs after responding so timing does not tell addresses apart either.
   */
  request: publicProcedure
    .input(z.object({ email: z.email().max(254) }))
    .mutation(({ ctx, input }) => {
      if (!isEmailConfigured())
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Ask your admin for a password reset link.",
        });
      after(async () => {
        try {
          await requestPasswordReset(ctx.db, input.email);
        } catch (error) {
          console.error("[auth] password reset request failed", error);
        }
      });
      return { ok: true };
    }),

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
