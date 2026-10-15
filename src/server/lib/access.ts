import { TRPCError } from "@trpc/server";
import { and, eq, sql, type Column } from "drizzle-orm";

import type { Database } from "~/server/db";
import { workspace, workspaceMember } from "~/server/db/schema";

export type AccessScope = {
  userId: string;
  workspace?: { id: string; displayCurrency: string };
};

/** Personal data is always the default; shared queries opt into a specific audience. */
export function resolveAccessScope(userId: string): AccessScope {
  return { userId };
}

export async function resolveWorkspaceScope(
  db: Pick<Database, "select">,
  scope: AccessScope,
  workspaceId?: string,
): Promise<AccessScope> {
  if (!workspaceId) return scope;
  const [row] = await db
    .select({ id: workspace.id, displayCurrency: workspace.displayCurrency })
    .from(workspace)
    .innerJoin(workspaceMember, eq(workspaceMember.workspaceId, workspace.id))
    .where(
      and(
        eq(workspace.id, workspaceId),
        eq(workspaceMember.userId, scope.userId),
      ),
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
  return { ...scope, workspace: row };
}

/** Owner-scoped data such as merchant rules and uploads never inherits workspace access. */
export function readableBy(scope: AccessScope, ownerColumn: Column) {
  return eq(ownerColumn, scope.userId);
}

/**
 * Account-level financial visibility. EXISTS avoids duplicate totals and checks current grants
 * and membership in the query itself, including when a previously resolved scope is reused.
 */
export function readableAccount(
  scope: AccessScope,
  ownerColumn: Column,
  accountColumn: Column,
) {
  if (!scope.workspace) return readableBy(scope, ownerColumn);
  return sql`exists (
    select 1 from workspace_account_share as access_share
    inner join workspace_member as access_member
      on access_member.workspace_id = access_share.workspace_id
    where access_share.workspace_id = ${scope.workspace.id}
      and access_member.user_id = ${scope.userId}
      and access_share.account_id = ${accountColumn}
      and access_share.shared_by_id = ${ownerColumn}
  )`;
}

/** Sharing grants visibility only; financial mutations remain restricted to their owner. */
export function writableBy(scope: AccessScope, ownerColumn: Column) {
  return eq(ownerColumn, scope.userId);
}
