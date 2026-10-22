import "server-only";

import { timingSafeEqual } from "node:crypto";
import { APIError } from "better-auth/api";
import { sql } from "drizzle-orm";

import { env } from "~/env";
import type { Database } from "~/server/db";
import { adminBootstrap, user } from "~/server/db/schema";

/** A fresh public instance must not let an arbitrary visitor claim administrator access. */
export function requireSetupToken(token: string | null | undefined) {
  const expected = env.SETUP_TOKEN;
  if (
    !expected ||
    !token ||
    Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  ) {
    throw new APIError("FORBIDDEN", {
      message: "A valid setup token from the instance operator is required.",
    });
  }
}

/**
 * Atomically claims the initial-admin slot. Returns true for exactly one caller while no user
 * exists. A claim whose sign-up never produced a user expires after two minutes so the instance
 * cannot get stuck without an admin.
 */
export async function claimInitialAdmin(db: Database): Promise<boolean> {
  const rows = await db
    .insert(adminBootstrap)
    .values({ id: 1, claimedAt: sql`now()` })
    .onConflictDoUpdate({
      target: adminBootstrap.id,
      set: { claimedAt: sql`now()` },
      setWhere: sql`${adminBootstrap.claimedAt} < now() - interval '2 minutes'
        and not exists (select 1 from ${user})`,
    })
    .returning({ id: adminBootstrap.id });
  return rows.length > 0;
}
