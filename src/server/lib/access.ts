import { inArray, type Column } from "drizzle-orm";

/**
 * Data-access scope for the signed-in user.
 *
 * Every per-user query filters by `ownerIds` (read) and writes with `userId` (write). Today the
 * scope is just the user themself. A household view later only has to widen `readableOwnerIds`
 * here (e.g. members who opted in to sharing) — no router has to change.
 */
export type AccessScope = {
  userId: string;
  readableOwnerIds: string[];
};

export function resolveAccessScope(userId: string): AccessScope {
  return { userId, readableOwnerIds: [userId] };
}

/** `where(readableBy(scope, table.ownerId))` */
export function readableBy(scope: AccessScope, ownerColumn: Column) {
  return inArray(ownerColumn, scope.readableOwnerIds);
}
