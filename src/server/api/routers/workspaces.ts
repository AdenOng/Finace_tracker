import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import { currencyInput } from "~/server/api/inputs";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  currency,
  financialAccount,
  user,
  workspace,
  workspaceAccountShare,
  workspaceInvitation,
  workspaceMember,
} from "~/server/db/schema";
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_DAYS,
} from "~/server/auth/invitations";
import { recordAudit } from "~/server/lib/audit";
import { acceptWorkspaceInvitation } from "~/server/modules/workspaces/invitations";
import { requireWorkspace } from "~/server/modules/workspaces/permissions";

const workspaceInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["family", "fund", "custom"]),
  displayCurrency: currencyInput,
});
const identity = z.object({ workspaceId: z.uuid() });
const memberInput = identity.extend({ userId: z.string().min(1) });
const shareInput = identity.extend({ accountId: z.uuid() });

export const workspacesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: workspace.id,
        name: workspace.name,
        kind: workspace.kind,
        displayCurrency: workspace.displayCurrency,
        ownerId: workspace.ownerId,
        memberRole: workspaceMember.role,
      })
      .from(workspace)
      .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, workspace.id))
      .where(eq(workspaceMember.userId, ctx.scope.userId))
      .orderBy(asc(workspace.name));
    return rows.map(({ memberRole, ownerId, ...row }) => ({
      ...row,
      role: ownerId === ctx.scope.userId ? ("owner" as const) : memberRole,
    }));
  }),

  get: protectedProcedure.input(identity).query(async ({ ctx, input }) => {
    const row = await requireWorkspace(
      ctx.db,
      input.workspaceId,
      ctx.scope.userId,
    );
    const [members, shares, invitations] = await Promise.all([
      ctx.db
        .select({
          userId: user.id,
          name: user.name,
          role: workspaceMember.role,
        })
        .from(workspaceMember)
        .innerJoin(user, eq(user.id, workspaceMember.userId))
        .where(eq(workspaceMember.workspaceId, row.id))
        .orderBy(asc(user.name)),
      ctx.db
        .select({
          accountId: workspaceAccountShare.accountId,
          sharedById: workspaceAccountShare.sharedById,
        })
        .from(workspaceAccountShare)
        .where(eq(workspaceAccountShare.workspaceId, row.id)),
      row.role === "owner"
        ? ctx.db
            .select({
              id: workspaceInvitation.id,
              email: workspaceInvitation.email,
              role: workspaceInvitation.role,
              expiresAt: workspaceInvitation.expiresAt,
            })
            .from(workspaceInvitation)
            .where(
              and(
                eq(workspaceInvitation.workspaceId, row.id),
                isNull(workspaceInvitation.acceptedAt),
                isNull(workspaceInvitation.revokedAt),
                gt(workspaceInvitation.expiresAt, new Date()),
              ),
            )
        : [],
    ]);
    return {
      ...row,
      userId: ctx.scope.userId,
      shares,
      invitations,
      members: members.map((m) => ({
        ...m,
        role: m.userId === row.ownerId ? ("owner" as const) : m.role,
      })),
    };
  }),

  create: protectedProcedure
    .input(workspaceInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [known] = await tx
          .select()
          .from(currency)
          .where(
            and(
              eq(currency.code, input.displayCurrency),
              eq(currency.isActive, true),
            ),
          );
        if (!known)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unknown currency",
          });
        const [row] = await tx
          .insert(workspace)
          .values({ ...input, ownerId: ctx.scope.userId })
          .returning({ id: workspace.id });
        await tx.insert(workspaceMember).values({
          workspaceId: row!.id,
          userId: ctx.scope.userId,
          role: "member",
        });
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.create",
          targetType: "workspace",
          targetId: row!.id,
        });
        return row!;
      }),
    ),

  update: protectedProcedure
    .input(workspaceInput.merge(identity))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          "manage",
          true,
        );
        const [known] = await tx
          .select()
          .from(currency)
          .where(
            and(
              eq(currency.code, input.displayCurrency),
              eq(currency.isActive, true),
            ),
          );
        if (!known)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unknown currency",
          });
        const { workspaceId, ...values } = input;
        await tx
          .update(workspace)
          .set(values)
          .where(eq(workspace.id, workspaceId));
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.update",
          targetType: "workspace",
          targetId: workspaceId,
        });
      }),
    ),

  invite: protectedProcedure
    .input(
      identity.extend({
        email: z.string().trim().toLowerCase().pipe(z.email()),
        role: z.enum(["member", "viewer"]),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          "manage",
          true,
        );
        const [existing] = await tx
          .select({ id: user.id })
          .from(user)
          .innerJoin(workspaceMember, eq(workspaceMember.userId, user.id))
          .where(
            and(
              eq(user.email, input.email),
              eq(workspaceMember.workspaceId, input.workspaceId),
            ),
          );
        if (existing)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This person is already a member",
          });
        // Reissuing an invitation revokes all older pending links for the same audience/email.
        await tx
          .update(workspaceInvitation)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(workspaceInvitation.workspaceId, input.workspaceId),
              eq(workspaceInvitation.email, input.email),
              isNull(workspaceInvitation.acceptedAt),
              isNull(workspaceInvitation.revokedAt),
            ),
          );
        const token = generateInviteToken();
        const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
        const [invite] = await tx
          .insert(workspaceInvitation)
          .values({
            ...input,
            invitedById: ctx.scope.userId,
            tokenHash: hashInviteToken(token),
            expiresAt,
          })
          .returning({ id: workspaceInvitation.id });
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.invitation.create",
          targetType: "workspace",
          targetId: input.workspaceId,
          details: { invitationId: invite!.id, role: input.role },
        });
        return {
          url: new URL(
            `/workspace-invite/${token}`,
            env.BETTER_AUTH_URL,
          ).toString(),
          expiresAt,
        };
      }),
    ),

  revokeInvitation: protectedProcedure
    .input(identity.extend({ invitationId: z.uuid() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          "manage",
          true,
        );
        const [row] = await tx
          .update(workspaceInvitation)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(workspaceInvitation.id, input.invitationId),
              eq(workspaceInvitation.workspaceId, input.workspaceId),
              isNull(workspaceInvitation.acceptedAt),
              isNull(workspaceInvitation.revokedAt),
            ),
          )
          .returning({ id: workspaceInvitation.id });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.invitation.revoke",
          targetType: "workspace",
          targetId: input.workspaceId,
          details: { invitationId: row.id },
        });
      }),
    ),

  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string().min(20).max(200) }))
    .mutation(({ ctx, input }) =>
      acceptWorkspaceInvitation(ctx.db, input.token, ctx.session.user),
    ),

  shareAccount: protectedProcedure
    .input(shareInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          "share",
          true,
        );
        const [account] = await tx
          .select({ id: financialAccount.id })
          .from(financialAccount)
          .where(
            and(
              eq(financialAccount.id, input.accountId),
              eq(financialAccount.ownerId, ctx.scope.userId),
            ),
          )
          .for("update");
        if (!account)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          });
        await tx
          .insert(workspaceAccountShare)
          .values({ ...input, sharedById: ctx.scope.userId })
          .onConflictDoNothing();
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.account.share",
          targetType: "workspace",
          targetId: input.workspaceId,
          details: { accountId: input.accountId },
        });
      }),
    ),

  unshareAccount: protectedProcedure
    .input(shareInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const row = await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          "view",
          true,
        );
        const [removed] = await tx
          .delete(workspaceAccountShare)
          .where(
            and(
              eq(workspaceAccountShare.workspaceId, input.workspaceId),
              eq(workspaceAccountShare.accountId, input.accountId),
              row.role === "owner"
                ? undefined
                : eq(workspaceAccountShare.sharedById, ctx.scope.userId),
            ),
          )
          .returning({ accountId: workspaceAccountShare.accountId });
        if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.account.unshare",
          targetType: "workspace",
          targetId: input.workspaceId,
          details: { accountId: input.accountId },
        });
      }),
    ),

  setMemberRole: protectedProcedure
    .input(memberInput.extend({ role: z.enum(["member", "viewer"]) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const row = await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          "manage",
          true,
        );
        if (input.userId === row.ownerId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transfer ownership first",
          });
        const [updated] = await tx
          .update(workspaceMember)
          .set({ role: input.role })
          .where(
            and(
              eq(workspaceMember.workspaceId, input.workspaceId),
              eq(workspaceMember.userId, input.userId),
            ),
          )
          .returning({ userId: workspaceMember.userId });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        if (input.role === "viewer")
          await tx
            .delete(workspaceAccountShare)
            .where(
              and(
                eq(workspaceAccountShare.workspaceId, input.workspaceId),
                eq(workspaceAccountShare.sharedById, input.userId),
              ),
            );
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.member.role",
          targetType: "workspace",
          targetId: input.workspaceId,
          details: { userId: input.userId, role: input.role },
        });
      }),
    ),

  removeMember: protectedProcedure
    .input(memberInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const row = await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          input.userId === ctx.scope.userId ? "view" : "manage",
          true,
        );
        if (input.userId === row.ownerId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Transfer ownership or delete the workspace before leaving",
          });
        const [removed] = await tx
          .delete(workspaceMember)
          .where(
            and(
              eq(workspaceMember.workspaceId, input.workspaceId),
              eq(workspaceMember.userId, input.userId),
            ),
          )
          .returning({ userId: workspaceMember.userId });
        if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
        // Prevent an old pending invitation from granting removed members access again.
        const [person] = await tx
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, input.userId));
        if (person)
          await tx
            .update(workspaceInvitation)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(workspaceInvitation.workspaceId, input.workspaceId),
                eq(workspaceInvitation.email, person.email.toLowerCase()),
                isNull(workspaceInvitation.acceptedAt),
                isNull(workspaceInvitation.revokedAt),
              ),
            );
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.member.remove",
          targetType: "workspace",
          targetId: input.workspaceId,
          details: { userId: input.userId },
        });
      }),
    ),

  transferOwnership: protectedProcedure
    .input(memberInput)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        await requireWorkspace(
          tx,
          input.workspaceId,
          ctx.scope.userId,
          "manage",
          true,
        );
        if (input.userId === ctx.scope.userId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pick another member",
          });
        const [target] = await tx
          .select()
          .from(workspaceMember)
          .where(
            and(
              eq(workspaceMember.workspaceId, input.workspaceId),
              eq(workspaceMember.userId, input.userId),
            ),
          );
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(workspaceMember)
          .set({ role: "member" })
          .where(
            and(
              eq(workspaceMember.workspaceId, input.workspaceId),
              eq(workspaceMember.userId, input.userId),
            ),
          );
        await tx
          .update(workspace)
          .set({ ownerId: input.userId })
          .where(eq(workspace.id, input.workspaceId));
        await tx
          .update(workspaceInvitation)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(workspaceInvitation.workspaceId, input.workspaceId),
              isNull(workspaceInvitation.acceptedAt),
              isNull(workspaceInvitation.revokedAt),
            ),
          );
        await recordAudit(tx, {
          actorId: ctx.scope.userId,
          action: "workspace.owner.transfer",
          targetType: "workspace",
          targetId: input.workspaceId,
          details: { userId: input.userId },
        });
      }),
    ),

  remove: protectedProcedure.input(identity).mutation(async ({ ctx, input }) =>
    ctx.db.transaction(async (tx) => {
      await requireWorkspace(
        tx,
        input.workspaceId,
        ctx.scope.userId,
        "manage",
        true,
      );
      await tx.delete(workspace).where(eq(workspace.id, input.workspaceId));
      await recordAudit(tx, {
        actorId: ctx.scope.userId,
        action: "workspace.remove",
        targetType: "workspace",
        targetId: input.workspaceId,
      });
    }),
  ),
});
