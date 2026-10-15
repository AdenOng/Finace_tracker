import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { auth } from "~/server/auth/config";
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_DAYS,
} from "~/server/auth/invitations";
import { PASSWORD_RESET_TTL_HOURS } from "~/server/auth/password-reset";
import type { Database } from "~/server/db";
import {
  invitation,
  passwordReset,
  session,
  twoFactor,
  user,
} from "~/server/db/schema";
import { recordAudit } from "~/server/lib/audit";

const role = z.enum(["user", "admin"]);
const userIdInput = z.object({ userId: z.string() });

/** Loads another user for a recovery action; admins use Settings for their own account. */
async function loadOtherUser(db: Database, actorId: string, userId: string) {
  if (userId === actorId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use Settings to manage your own account",
    });
  }
  const [row] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

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
        lastActiveAt:
          sql<Date | null>`(select max(${session.updatedAt}) from ${session} where ${session.userId} = ${user.id})`.mapWith(
            (value: string | null) => (value ? new Date(value) : null),
          ),
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
      const target = await loadOtherUser(
        ctx.db,
        ctx.session.user.id,
        input.userId,
      );
      await auth.api.setRole({ headers: ctx.headers, body: input });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "user.role_changed",
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email,
        details: { role: input.role },
      });
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
      const target = await loadOtherUser(
        ctx.db,
        ctx.session.user.id,
        input.userId,
      );
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
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: input.banned ? "user.disabled" : "user.enabled",
        targetType: "user",
        targetId: target.id,
        targetLabel: target.email,
      });
    }),

  /** Active sessions for one user. Session tokens are never returned. */
  sessions: adminProcedure.input(userIdInput).query(({ ctx, input }) =>
    ctx.db
      .select({
        id: session.id,
        createdAt: session.createdAt,
        lastActiveAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(
        and(
          eq(session.userId, input.userId),
          gt(session.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(session.updatedAt)),
  ),

  revokeSessions: adminProcedure
    .input(userIdInput)
    .mutation(async ({ ctx, input }) => {
      const target = await loadOtherUser(
        ctx.db,
        ctx.session.user.id,
        input.userId,
      );
      const revoked = await ctx.db.transaction(async (tx) => {
        const rows = await tx
          .delete(session)
          .where(eq(session.userId, target.id))
          .returning({ id: session.id });
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "user.sessions_revoked",
          targetType: "user",
          targetId: target.id,
          targetLabel: target.email,
          details: { sessions: rows.length },
        });
        return rows.length;
      });
      return { revoked };
    }),

  /**
   * Removes a user's two-step setup so they can enrol again, e.g. after losing their phone. They
   * are signed out; on REQUIRE_TWO_FACTOR instances they must re-enrol before using the app.
   */
  resetTwoFactor: adminProcedure
    .input(userIdInput)
    .mutation(async ({ ctx, input }) => {
      const target = await loadOtherUser(
        ctx.db,
        ctx.session.user.id,
        input.userId,
      );
      await ctx.db.transaction(async (tx) => {
        await tx.delete(twoFactor).where(eq(twoFactor.userId, target.id));
        await tx
          .update(user)
          .set({ twoFactorEnabled: false, updatedAt: new Date() })
          .where(eq(user.id, target.id));
        await tx.delete(session).where(eq(session.userId, target.id));
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "user.two_factor_reset",
          targetType: "user",
          targetId: target.id,
          targetLabel: target.email,
        });
      });
    }),

  /** Returns a single-use reset link once; only its hash is stored. Older links stop working. */
  createPasswordReset: adminProcedure
    .input(userIdInput)
    .mutation(async ({ ctx, input }) => {
      const target = await loadOtherUser(
        ctx.db,
        ctx.session.user.id,
        input.userId,
      );
      const token = generateInviteToken();
      const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_TTL_HOURS * 3_600_000,
      );
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(passwordReset)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(passwordReset.userId, target.id),
              isNull(passwordReset.usedAt),
              isNull(passwordReset.revokedAt),
            ),
          );
        await tx.insert(passwordReset).values({
          id: crypto.randomUUID(),
          userId: target.id,
          tokenHash: hashInviteToken(token),
          createdById: ctx.session.user.id,
          expiresAt,
        });
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "user.password_reset_created",
          targetType: "user",
          targetId: target.id,
          targetLabel: target.email,
        });
      });
      return { url: `${env.BETTER_AUTH_URL}/reset/${token}`, expiresAt };
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

  /**
   * Returns the invite link once; only its hash is stored, so it cannot be shown again. Inviting
   * the same email again replaces any pending link.
   */
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
      await ctx.db.transaction(async (tx) => {
        const replaced = await tx
          .update(invitation)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(invitation.email, input.email),
              isNull(invitation.acceptedAt),
              isNull(invitation.revokedAt),
            ),
          )
          .returning({ id: invitation.id });
        const id = crypto.randomUUID();
        await tx.insert(invitation).values({
          id,
          email: input.email,
          role: input.role,
          tokenHash: hashInviteToken(token),
          invitedById: ctx.session.user.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
        });
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "invitation.created",
          targetType: "invitation",
          targetId: id,
          targetLabel: input.email,
          details: { role: input.role, replaced: replaced.length },
        });
      });
      return { url: `${env.BETTER_AUTH_URL}/invite/${token}` };
    }),

  revokeInvite: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(invitation)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(invitation.id, input.id),
            isNull(invitation.acceptedAt),
            isNull(invitation.revokedAt),
          ),
        )
        .returning({ id: invitation.id, email: invitation.email });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "invitation.revoked",
        targetType: "invitation",
        targetId: row.id,
        targetLabel: row.email,
      });
    }),
});
