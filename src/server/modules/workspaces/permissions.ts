import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import type { Database } from "~/server/db";
import { workspace, workspaceMember } from "~/server/db/schema";

/** Mutations lock the audience before checking permissions, serializing membership changes. */
export async function requireWorkspace(
  db: Pick<Database, "select">,
  workspaceId: string,
  userId: string,
  permission: "view" | "share" | "manage" = "view",
  lock = false,
) {
  const query = db
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  const [row] = await (lock ? query.for("update") : query);
  const [membership] = row
    ? await db
        .select()
        .from(workspaceMember)
        .where(
          and(
            eq(workspaceMember.workspaceId, workspaceId),
            eq(workspaceMember.userId, userId),
          ),
        )
    : [];
  if (!row || !membership)
    throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  const role = row.ownerId === userId ? ("owner" as const) : membership.role;
  if (
    (permission === "manage" && role !== "owner") ||
    (permission === "share" && role === "viewer")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission for this action",
    });
  }
  return { ...row, role };
}
