import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "~/server/db";
import {
  workspace,
  workspaceInvitation,
  workspaceMember,
} from "~/server/db/schema";
import { hashInviteToken } from "~/server/auth/invitations";
import { recordAudit } from "~/server/lib/audit";

export const WORKSPACE_INVITE_HEADER = "x-workspace-invite-token";

export async function findPendingWorkspaceInvitation(
  db: Pick<Database, "select">,
  token: string,
) {
  const [row] = await db
    .select({
      id: workspaceInvitation.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      email: workspaceInvitation.email,
      role: workspaceInvitation.role,
      expiresAt: workspaceInvitation.expiresAt,
    })
    .from(workspaceInvitation)
    .innerJoin(workspace, eq(workspace.id, workspaceInvitation.workspaceId))
    .where(
      and(
        eq(workspaceInvitation.tokenHash, hashInviteToken(token)),
        isNull(workspaceInvitation.acceptedAt),
        isNull(workspaceInvitation.revokedAt),
        gt(workspaceInvitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Used by both signed-in acceptance and invite-only registration. A token is consumed once. */
export async function acceptWorkspaceInvitation(
  db: Database,
  token: string,
  user: { id: string; email: string },
) {
  return db.transaction(async (tx) => {
    const pending = await findPendingWorkspaceInvitation(tx, token);
    if (!pending)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This invitation no longer works",
      });
    // Same lock order as workspace mutations, so removal/revocation cannot race acceptance.
    await tx
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.id, pending.workspaceId))
      .for("update");
    const [invite] = await tx
      .select()
      .from(workspaceInvitation)
      .where(
        and(
          eq(workspaceInvitation.id, pending.id),
          isNull(workspaceInvitation.acceptedAt),
          isNull(workspaceInvitation.revokedAt),
          gt(workspaceInvitation.expiresAt, new Date()),
        ),
      )
      .for("update");
    if (!invite)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This invitation no longer works",
      });
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Sign in with the invited email address",
      });
    }
    await tx
      .insert(workspaceMember)
      .values({
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
      })
      .onConflictDoNothing();
    await tx
      .update(workspaceInvitation)
      .set({ acceptedAt: new Date() })
      .where(eq(workspaceInvitation.id, invite.id));
    await recordAudit(tx, {
      actorId: user.id,
      action: "workspace.invitation.accept",
      targetType: "workspace",
      targetId: invite.workspaceId,
      details: { invitationId: invite.id },
    });
    return { workspaceId: invite.workspaceId };
  });
}
