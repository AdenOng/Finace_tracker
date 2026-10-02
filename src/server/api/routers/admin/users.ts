import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { auth } from "~/server/auth/config";
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_DAYS,
} from "~/server/auth/invitations";
import { invitation, user } from "~/server/db/schema";

const role = z.enum(["user", "admin"]);

export const adminUsersRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(user.createdAt),
  ),

  setRole: adminProcedure
    .input(z.object({ userId: z.string(), role }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own role",
        });
      }
      await auth.api.setRole({ headers: ctx.headers, body: input });
    }),

  setBanned: adminProcedure
    .input(z.object({ userId: z.string(), banned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot disable yourself",
        });
      }
      if (input.banned) {
        await auth.api.banUser({
          headers: ctx.headers,
          body: { userId: input.userId, banReason: "Disabled by admin" },
        });
      } else {
        await auth.api.unbanUser({
          headers: ctx.headers,
          body: { userId: input.userId },
        });
      }
    }),

  invitations: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      })
      .from(invitation)
      .where(
        and(
          isNull(invitation.acceptedAt),
          isNull(invitation.revokedAt),
          gt(invitation.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invitation.createdAt)),
  ),

  /** Returns the invite link once; only its hash is stored, so it cannot be shown again. */
  invite: adminProcedure
    .input(z.object({ email: z.email().toLowerCase(), role }))
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.$count(user, eq(user.email, input.email));
      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That email already has an account",
        });
      }
      const token = generateInviteToken();
      await ctx.db.insert(invitation).values({
        id: crypto.randomUUID(),
        email: input.email,
        role: input.role,
        tokenHash: hashInviteToken(token),
        invitedById: ctx.session.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      });
      return { url: `${env.BETTER_AUTH_URL}/invite/${token}` };
    }),

  revokeInvite: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(invitation)
        .set({ revokedAt: new Date() })
        .where(eq(invitation.id, input.id));
    }),
});
