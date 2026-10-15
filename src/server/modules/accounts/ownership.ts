import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "~/server/db";
import { financialAccount } from "~/server/db/schema";
import { writableBy, type AccessScope } from "~/server/lib/access";

/**
 * The account `id` if the signed-in user owns it and it is open (unless `allowArchived`). Records
 * are only written to accounts the user owns, never to accounts merely readable through a wider
 * (household) scope.
 */
export async function requireWritableAccount(
  db: Pick<Database, "select">,
  scope: AccessScope,
  id: string,
  options: { allowArchived?: boolean } = {},
) {
  const [account] = await db
    .select({
      id: financialAccount.id,
      type: financialAccount.type,
      currency: financialAccount.currency,
    })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, id),
        writableBy(scope, financialAccount.ownerId),
        options.allowArchived ? undefined : isNull(financialAccount.archivedAt),
      ),
    )
    .limit(1);
  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  }
  return account;
}
